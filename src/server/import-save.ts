// Save a reviewed import into a trip: all checks first, then all writes.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { fromLocalInput } from "@/lib/time";
import { guessCategory } from "@/lib/categorize";
import type { ParsedImportPayload } from "@/lib/import/payload";
import { personIdFor } from "./people";

export type ApplyResult = { ok: true; summary: string; focus: string | null } | { ok: false; error: string; field?: string };

const minor = (p: number | null) => (p == null ? null : Math.round(p * 100));

export async function saveImport(tripId: string, p: ParsedImportPayload): Promise<ApplyResult> {
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
