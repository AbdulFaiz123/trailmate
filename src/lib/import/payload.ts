// What the review screen sends back when the traveler presses Save.
import { z } from "zod";
import { isValidTimeZone } from "../time";
import { LEG_MODES, STAY_KINDS, TASK_CATEGORIES } from "../types";

const s = (max = 200) => z.string().trim().max(max);
const ns = (max = 200) => z.string().trim().max(max).nullable().transform((v) => v || null);
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");
const zone = z.string().refine(isValidTimeZone, "Pick a valid time zone");
const price = z.number().min(0).max(1e7).nullable();
const ccy = z.string().regex(/^[A-Z]{3}$/).nullable().or(z.literal("").transform(() => null));

export const Payload = z.object({
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
export type ParsedImportPayload = z.output<typeof Payload>;

/** Turn a validation error into "Train 12795 (Hyderabad → Vijayawada): pick a valid time zone". */
export function describeIssue(error: z.ZodError, input: unknown): { error: string; field: string } {
  const issue = error.issues[0];
  const [group, index] = issue.path as [string, number];
  const row = ((input as Record<string, unknown>)?.[group] as Record<string, unknown>[] | undefined)?.[index];
  const label = row ? String(row.number ?? row.name ?? `${row.fromName ?? ""} → ${row.toName ?? ""}`) : "";
  const route = row?.fromName && row?.number ? ` (${row.fromName} → ${row.toName})` : "";
  const msg = issue.message.charAt(0).toLowerCase() + issue.message.slice(1);
  return { error: label ? `${label}${route}: ${msg}` : issue.message, field: issue.path.join(".") };
}
