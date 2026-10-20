"use server";

// Save what the traveler confirmed on the import review screen.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromLocalInput, isValidTimeZone } from "@/lib/time";
import { guessCategory } from "@/lib/categorize";
import { LEG_MODES, STAY_KINDS, TASK_CATEGORIES } from "@/lib/types";
import { personIdFor } from "@/server/people";

const s = (max = 200) => z.string().trim().max(max);
const ns = (max = 200) => z.string().trim().max(max).nullable().transform((v) => v || null);
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");
const zone = z.string().refine(isValidTimeZone, "Pick a valid time zone");
const price = z.number().min(0).max(1e7).nullable();
const ccy = z.string().regex(/^[A-Z]{3}$/).nullable().or(z.literal("").transform(() => null));

const Payload = z.object({
  legs: z.array(z.object({
    include: z.boolean(), mode: z.enum(LEG_MODES), fromName: s().min(1, "Where from?"), toName: s().min(1, "Where to?"),
    fromTimeZone: zone, toTimeZone: zone, departureLocal: local, arrivalLocal: local,
    carrier: ns(80), number: ns(30), bookingRef: ns(40), platform: ns(20), seat: ns(40), price, currency: ccy,
  }).or(z.object({ include: z.literal(false) }).passthrough())).max(20),
  stays: z.array(z.object({
    include: z.boolean(), kind: z.enum(STAY_KINDS), name: s().min(1, "Name the place"), address: ns(), timeZone: zone,
    checkInLocal: local, checkOutLocal: local, latestCheckInLocal: local.nullable().or(z.literal("").transform(() => null)),
    bookingRef: ns(40), price, currency: ccy,
  }).or(z.object({ include: z.literal(false) }).passthrough())).max(20),
  items: z.array(z.object({
    include: z.boolean(), list: z.enum(["BUY", "PACK"]), name: s(120).min(1), quantity: z.number().int().min(1).max(999),
    category: z.enum(TASK_CATEGORIES).nullable(), person: ns(60), price, currency: ccy,
  })).max(20),
  purchases: z.array(z.object({
    action: z.enum(["MARK", "ADD", "IGNORE"]), taskId: z.string().nullable(), name: s(120).min(1),
    quantity: z.number().int().min(1).max(999), unitPrice: price, currency: ccy,
  })).max(40),
  documentId: z.string().nullable(),
});

export type ImportPayload = z.input<typeof Payload>;
export type ApplyResult = { ok: true; summary: string; focus: string | null } | { ok: false; error: string; field?: string };

const minor = (p: number | null) => (p == null ? null : Math.round(p * 100));

export async function applyImport(tripId: string, input: ImportPayload): Promise<ApplyResult> {
  const parsed = Payload.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Name the card: "Train 12795 (Hyderabad → Vijayawada): pick a valid time zone".
    const [group, index] = issue.path as [keyof typeof input, number];
    const row = (input[group] as Record<string, unknown>[] | undefined)?.[index];
    const label = row ? String(row.number ?? row.name ?? `${row.fromName ?? ""} → ${row.toName ?? ""}`) : "";
    const route = row?.fromName && row?.number ? ` (${row.fromName} → ${row.toName})` : "";
    return { ok: false, error: label ? `${label}${route}: ${issue.message.charAt(0).toLowerCase()}${issue.message.slice(1)}` : issue.message, field: issue.path.join(".") };
  }
  const p = parsed.data;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return { ok: false, error: "Trip not found" };

  // Validate times first, so we either save everything or nothing.
  const legs = [];
  for (const [i, l] of p.legs.entries()) {
    if (!l.include || !("mode" in l)) continue;
    const departureAt = fromLocalInput(l.departureLocal, l.fromTimeZone);
    const arrivalAt = fromLocalInput(l.arrivalLocal, l.toTimeZone);
    if (arrivalAt <= departureAt) return { ok: false, error: `${l.number ?? `Leg ${i + 1}`}: arrival is before departure.`, field: `legs.${i}` };
    legs.push({ l, departureAt, arrivalAt });
  }
  const stays = [];
  for (const [i, st] of p.stays.entries()) {
    if (!st.include || !("kind" in st)) continue;
    const checkInAt = fromLocalInput(st.checkInLocal, st.timeZone);
    const checkOutAt = fromLocalInput(st.checkOutLocal, st.timeZone);
    if (checkOutAt <= checkInAt) return { ok: false, error: `${st.name}: check-out is before check-in.`, field: `stays.${i}` };
    stays.push({ st, checkInAt, checkOutAt, latestCheckInAt: st.latestCheckInLocal ? fromLocalInput(st.latestCheckInLocal, st.timeZone) : null });
  }

  const created = { legs: 0, stays: 0, items: 0, bought: 0 };
  let focus: string | null = null;
  let attachTo: { kind: "LEG" | "STAY"; id: string } | null = null;

  for (const { l, departureAt, arrivalAt } of legs) {
    const leg = await prisma.leg.create({
      data: {
        tripId, mode: l.mode, fromName: l.fromName, toName: l.toName, fromTimeZone: l.fromTimeZone, toTimeZone: l.toTimeZone,
        departureAt, arrivalAt, carrier: l.carrier, number: l.number, bookingRef: l.bookingRef, platform: l.platform, seat: l.seat,
        costMinor: minor(l.price), currency: l.price != null ? (l.currency ?? trip.homeCurrency) : null,
        notes: "Added by smart import",
      },
    });
    created.legs++;
    focus ??= `leg-${leg.id}`;
    attachTo ??= { kind: "LEG", id: leg.id };
  }
  for (const { st, checkInAt, checkOutAt, latestCheckInAt } of stays) {
    const stay = await prisma.stay.create({
      data: {
        tripId, kind: st.kind, name: st.name, address: st.address, timeZone: st.timeZone, checkInAt, checkOutAt, latestCheckInAt,
        bookingRef: st.bookingRef, costMinor: minor(st.price), currency: st.price != null ? (st.currency ?? trip.homeCurrency) : null,
        notes: "Added by smart import",
      },
    });
    created.stays++;
    focus ??= `stay-${stay.id}`;
    attachTo ??= { kind: "STAY", id: stay.id };
  }
  for (const it of p.items) {
    if (!it.include) continue;
    await prisma.task.create({
      data: {
        tripId, list: it.list, name: it.name, quantity: it.quantity, category: it.category ?? guessCategory(it.name),
        status: it.list === "BUY" ? "TO_BUY" : "TODO", bag: "CHECKED", personId: await personIdFor(tripId, it.person),
        priceMinor: minor(it.price), currency: it.price != null ? (it.currency ?? trip.homeCurrency) : null,
      },
    });
    created.items++;
  }
  for (const pu of p.purchases) {
    if (pu.action === "IGNORE") continue;
    const priceData = { priceMinor: minor(pu.unitPrice), currency: pu.unitPrice != null ? (pu.currency ?? trip.homeCurrency) : null };
    if (pu.action === "MARK" && pu.taskId) {
      const task = await prisma.task.findUnique({ where: { id: pu.taskId, tripId } });
      if (!task) continue;
      await prisma.task.update({ where: { id: task.id }, data: { status: task.status === "PACKED" ? "PACKED" : "BOUGHT", ...(pu.unitPrice != null ? priceData : {}) } });
    } else {
      await prisma.task.create({
        data: { tripId, list: "BUY", name: pu.name, quantity: pu.quantity, category: guessCategory(pu.name), status: "BOUGHT", bag: "CHECKED", ...priceData },
      });
    }
    created.bought++;
  }

  // The original ticket/receipt was uploaded to the vault; link it to what it created.
  if (p.documentId && attachTo) {
    await prisma.document.updateMany({ where: { id: p.documentId, tripId }, data: { itemKind: attachTo.kind, itemId: attachTo.id } });
  }

  revalidatePath(`/trips/${tripId}`, "layout");
  const parts = [
    created.legs && `${created.legs} leg${created.legs === 1 ? "" : "s"}`,
    created.stays && `${created.stays} stay${created.stays === 1 ? "" : "s"}`,
    created.items && `${created.items} list item${created.items === 1 ? "" : "s"}`,
    created.bought && `${created.bought} purchase${created.bought === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return { ok: true, summary: parts.length ? `Saved ${parts.join(", ")}.` : "Nothing selected to save.", focus };
}
