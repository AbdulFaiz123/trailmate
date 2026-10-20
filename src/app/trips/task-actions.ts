"use server";

// Server actions for the Pack and Buy lists, suggestions and baggage settings.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { localToUtc } from "@/lib/time";
import { parseLatLng } from "@/lib/geo";
import { findSuggestion, safeJsonArray, suggestionsFor } from "@/lib/rules";
import { TASK_CATEGORIES } from "@/lib/types";
import type { FormState } from "./actions";

const optional = z.string().trim().optional().transform((v) => (v ? v : null));
const grams = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+$/.test(v), "Whole grams, e.g. 350")
  .transform((v) => (v ? Number(v) : null));
const money = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+([.,]\d{1,2})?$/.test(v), "Use a number like 12.99")
  .transform((v) => (v ? Math.round(Number(v.replace(",", ".")) * 100) : null));

const TaskInput = z.object({
  list: z.enum(["BUY", "PACK"]),
  name: z.string().trim().min(1, "What is it?").max(120),
  quantity: z.coerce.number().int().min(1, "At least 1").max(999),
  category: z.enum(TASK_CATEGORIES),
  status: z.enum(["TO_BUY", "BOUGHT", "PACKED", "TODO"]),
  person: optional,
  bag: z.enum(["CHECKED", "CABIN", "NONE"]),
  weightG: grams,
  price: money,
  currency: z.string().trim().toUpperCase().optional().refine((v) => !v || /^[A-Z]{3}$/.test(v), "3-letter code").transform((v) => v || null),
  buyBy: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  placeName: optional,
  location: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseLatLng(v), "Paste coordinates like 17.4170, 78.4380")
    .transform((v) => (v ? parseLatLng(v) : null)),
  notes: optional,
});

function listsPath(tripId: string, list: string) {
  return `/trips/${tripId}/lists?tab=${list}`;
}

function refresh(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/lists`);
}

/** Find or create the gift recipient by name ("Mom"). */
async function personId(tripId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await prisma.person.findFirst({ where: { tripId, name } });
  return (existing ?? (await prisma.person.create({ data: { tripId, name } }))).id;
}

export async function saveTask(tripId: string, taskId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = TaskInput.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const { person, price, buyBy, location, ...rest } = parsed.data;
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });

  // Pack-list items are never "to buy"; keep the status consistent with the list.
  let status = rest.status;
  if (rest.list === "PACK" && status !== "PACKED") status = "TODO";
  if (rest.list === "BUY" && status === "TODO") status = "TO_BUY";

  const data = {
    ...rest,
    status,
    priceMinor: price,
    currency: price != null ? (rest.currency ?? trip.homeCurrency) : rest.currency,
    personId: await personId(tripId, person),
    // A "buy by" date means: by the evening of that day, at home.
    buyBy: rest.list === "BUY" && buyBy ? localToUtc(buyBy, "20:00", trip.homeTimeZone) : null,
    // Where to buy it: used for "shop near your stay" nudges.
    placeName: rest.list === "BUY" ? rest.placeName : null,
    lat: rest.list === "BUY" ? (location?.lat ?? null) : null,
    lng: rest.list === "BUY" ? (location?.lng ?? null) : null,
  };
  if (taskId) await prisma.task.update({ where: { id: taskId, tripId }, data });
  else await prisma.task.create({ data: { ...data, tripId } });

  refresh(tripId);
  redirect(listsPath(tripId, rest.list));
}

export async function deleteTask(tripId: string, taskId: string) {
  const task = await prisma.task.delete({ where: { id: taskId, tripId } });
  await prisma.document.updateMany({ where: { itemKind: "TASK", itemId: taskId }, data: { itemKind: null, itemId: null } });
  refresh(tripId);
  redirect(listsPath(tripId, task.list));
}

export async function addSuggestion(tripId: string, suggestionId: string) {
  const s = findSuggestion(suggestionId);
  if (!s) return;
  await prisma.task.create({
    data: {
      tripId, list: s.list, name: s.name, category: s.category, quantity: 1,
      status: s.list === "BUY" ? "TO_BUY" : "TODO",
      weightG: s.weightG ?? null, priceMinor: s.priceMinor ?? null, currency: s.currency ?? null,
      bag: s.bag ?? "CHECKED", notes: s.notes ?? null, suggestionId: s.id,
    },
  });
  refresh(tripId);
}

export async function addAllSuggestions(tripId: string, list: "BUY" | "PACK") {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { tasks: true } });
  const open = suggestionsFor(trip, trip.tasks).filter((s) => s.state === "open" && s.list === list);
  for (const s of open) await addSuggestion(tripId, s.id);
  refresh(tripId);
}

export async function dismissSuggestion(tripId: string, suggestionId: string) {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const dismissed = new Set(safeJsonArray(trip.dismissedSuggestions));
  dismissed.add(suggestionId);
  await prisma.trip.update({ where: { id: tripId }, data: { dismissedSuggestions: JSON.stringify([...dismissed]) } });
  refresh(tripId);
}

const kg = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+([.,]\d)?$/.test(v), "Use kg, e.g. 23 or 4.2")
  .transform((v) => (v ? Math.round(Number(v.replace(",", ".")) * 1000) : null));

const BaggageInput = z.object({ checkedAllowance: kg, cabinAllowance: kg, checkedTare: kg, cabinTare: kg });

export async function saveBaggage(tripId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = BaggageInput.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const v = parsed.data;
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      checkedAllowanceG: v.checkedAllowance, cabinAllowanceG: v.cabinAllowance,
      checkedTareG: v.checkedTare ?? 0, cabinTareG: v.cabinTare ?? 0,
    },
  });
  refresh(tripId);
  return {};
}
