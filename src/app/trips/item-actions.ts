"use server";

// Create / update / delete legs and stays.
//
// Forms send local wall-clock times ("2026-10-27T09:51") plus the place's time
// zone. We convert to UTC *here, on the server*, so the database only ever
// sees UTC.
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromLocalInput, isValidTimeZone } from "@/lib/time";
import { LEG_MODES, STAY_KINDS } from "@/lib/types";
import type { FormState } from "./actions";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));
const zone = z.string().trim().refine(isValidTimeZone, "Unknown time zone — pick one from the list");
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Pick a date and time");
const optionalLocalDateTime = z.union([z.literal(""), localDateTime]).optional();
const money = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+([.,]\d{1,2})?$/.test(v), "Use a number like 59.90")
  .transform((v) => (v ? Math.round(Number(v.replace(",", ".")) * 100) : null));
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .refine((v) => !v || /^[A-Z]{3}$/.test(v), "3-letter code, e.g. EUR")
  .transform((v) => v || null);

function formValues(formData: FormData) {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function zodErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

// ---------------------------------------------------------------- Legs

const LegInput = z.object({
  mode: z.enum(LEG_MODES),
  fromName: z.string().trim().min(1, "Where from?"),
  fromTimeZone: zone,
  fromStopId: optional,
  toName: z.string().trim().min(1, "Where to?"),
  toTimeZone: zone,
  toStopId: optional,
  departure: localDateTime,
  arrival: localDateTime,
  carrier: optional,
  number: optional,
  bookingRef: optional,
  platform: optional,
  seat: optional,
  cost: money,
  currency,
  notes: optional,
});

export async function saveLeg(
  tripId: string,
  legId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const parsed = LegInput.safeParse(values);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };

  const { departure, arrival, cost, ...rest } = parsed.data;
  // Each end is interpreted in its own zone. 17:30 Frankfurt -> 07:20 Hyderabad
  // is a 9h20m flight, not a negative one.
  const departureAt = fromLocalInput(departure, rest.fromTimeZone);
  const arrivalAt = fromLocalInput(arrival, rest.toTimeZone);
  if (arrivalAt <= departureAt) {
    return { errors: { arrival: "Arrival is before departure. Check the date and both time zones." }, values };
  }
  if (arrivalAt.getTime() - departureAt.getTime() > 72 * 3_600_000) {
    return { errors: { arrival: "That's more than 3 days of travel. Check the dates." }, values };
  }

  const data = { ...rest, departureAt, arrivalAt, costMinor: cost };
  const leg = legId
    ? await prisma.leg.update({ where: { id: legId, tripId }, data })
    : await prisma.leg.create({ data: { ...data, tripId } });

  redirect(`/trips/${tripId}?saved=leg-${leg.id}`);
}

export async function deleteLeg(tripId: string, legId: string) {
  // Dependencies point at items by (kind, id) without a foreign key, so we
  // clean them up ourselves, in one transaction.
  await prisma.$transaction([
    prisma.dependency.deleteMany({
      where: { OR: [{ fromKind: "LEG", fromId: legId }, { toKind: "LEG", toId: legId }] },
    }),
    prisma.document.updateMany({ where: { itemKind: "LEG", itemId: legId }, data: { itemKind: null, itemId: null } }),
    prisma.leg.delete({ where: { id: legId, tripId } }),
  ]);
  redirect(`/trips/${tripId}`);
}

// ---------------------------------------------------------------- Stays

const StayInput = z.object({
  kind: z.enum(STAY_KINDS),
  name: z.string().trim().min(1, "Name the place"),
  address: optional,
  timeZone: zone,
  checkIn: localDateTime,
  latestCheckIn: optionalLocalDateTime,
  checkOut: localDateTime,
  bookingRef: optional,
  bookingUrl: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^https?:\/\//.test(v), "Start the link with https://")
    .transform((v) => v || null),
  cost: money,
  currency,
  notes: optional,
});

export async function saveStay(
  tripId: string,
  stayId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const parsed = StayInput.safeParse(values);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };

  const { checkIn, latestCheckIn, checkOut, cost, ...rest } = parsed.data;
  const checkInAt = fromLocalInput(checkIn, rest.timeZone);
  const checkOutAt = fromLocalInput(checkOut, rest.timeZone);
  const latestCheckInAt = latestCheckIn ? fromLocalInput(latestCheckIn, rest.timeZone) : null;

  if (checkOutAt <= checkInAt) return { errors: { checkOut: "Check-out must be after check-in." }, values };
  if (latestCheckInAt && (latestCheckInAt < checkInAt || latestCheckInAt >= checkOutAt)) {
    return { errors: { latestCheckIn: "Must be between check-in and check-out." }, values };
  }

  const data = { ...rest, checkInAt, checkOutAt, latestCheckInAt, costMinor: cost };
  const stay = stayId
    ? await prisma.stay.update({ where: { id: stayId, tripId }, data })
    : await prisma.stay.create({ data: { ...data, tripId } });

  redirect(`/trips/${tripId}?saved=stay-${stay.id}`);
}

export async function deleteStay(tripId: string, stayId: string) {
  await prisma.$transaction([
    prisma.dependency.deleteMany({
      where: { OR: [{ fromKind: "STAY", fromId: stayId }, { toKind: "STAY", toId: stayId }] },
    }),
    prisma.document.updateMany({ where: { itemKind: "STAY", itemId: stayId }, data: { itemKind: null, itemId: null } }),
    prisma.stay.delete({ where: { id: stayId, tripId } }),
  ]);
  redirect(`/trips/${tripId}`);
}
