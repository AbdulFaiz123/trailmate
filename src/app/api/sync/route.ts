import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseQuickAdd } from "@/lib/task-status";
import type { SyncResult } from "@/lib/outbox";

const Op = z.discriminatedUnion("kind", [
  z.object({ opId: z.string(), kind: z.literal("setStatus"), tripId: z.string(), taskId: z.string(), status: z.enum(["TO_BUY", "BOUGHT", "PACKED", "TODO"]), at: z.number() }),
  z.object({ opId: z.string(), kind: z.literal("addTask"), tripId: z.string(), clientId: z.string().min(8).max(64), list: z.enum(["BUY", "PACK"]), name: z.string().trim().min(1).max(120), at: z.number() }),
]);
const Body = z.object({ ops: z.array(z.unknown()).max(500) });

/** Apply changes queued by the offline outbox, in order. Safe to call twice. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Expected { ops: [...] }" }, { status: 400 });

  const results: SyncResult[] = [];
  const trips = new Set<string>();
  for (const raw of body.data.ops) {
    const parsed = Op.safeParse(raw);
    const opId = (raw as { opId?: string })?.opId ?? "?";
    if (!parsed.success) { results.push({ opId, result: "invalid" }); continue; }
    const op = parsed.data;

    if (op.kind === "setStatus") {
      const task = await prisma.task.findUnique({ where: { id: op.taskId, tripId: op.tripId } });
      if (!task) { results.push({ opId, result: "missing" }); continue; }
      const statusOk = task.list === "BUY" ? op.status !== "TODO" : op.status === "TODO" || op.status === "PACKED";
      if (!statusOk) { results.push({ opId, result: "invalid" }); continue; }
      // Last write wins: if the server changed it after this offline tap, keep the server's.
      if (task.updatedAt.getTime() > op.at) { results.push({ opId, result: "stale" }); continue; }
      await prisma.task.update({ where: { id: task.id }, data: { status: op.status } });
      results.push({ opId, result: "applied" });
      trips.add(op.tripId);
    } else {
      const exists = await prisma.task.findUnique({ where: { clientId: op.clientId } });
      if (exists) { results.push({ opId, result: "duplicate" }); continue; }
      const trip = await prisma.trip.findUnique({ where: { id: op.tripId }, select: { id: true } });
      if (!trip) { results.push({ opId, result: "missing" }); continue; }
      const q = parseQuickAdd(op.name);
      await prisma.task.create({
        data: {
          tripId: op.tripId, list: op.list, clientId: op.clientId, ...q,
          status: op.list === "BUY" ? "TO_BUY" : "TODO", bag: "CHECKED",
        },
      });
      results.push({ opId, result: "applied" });
      trips.add(op.tripId);
    }
  }
  for (const id of trips) revalidatePath(`/trips/${id}`, "layout");
  return NextResponse.json({ results });
}
