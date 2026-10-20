"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { localToUtc } from "@/lib/time";
import { runSweep, type SweepResult } from "@/server/scheduler";
import { demoToolsEnabled, getSettings } from "@/server/settings";
import type { FormState } from "./trips/actions";

export async function markAlertRead(id: string) {
  await prisma.alert.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function markAllAlertsRead() {
  await prisma.alert.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).transform((v) => v || null);
const flag = z.preprocess((v) => v === "on", z.boolean());

const SettingsInput = z.object({
  leaveBufferMin: z.coerce.number().int().min(0, "0 or more").max(240, "At most 4 hours"),
  quietHoursStart: time,
  quietHoursEnd: time,
  alertBuyBy: flag,
  alertNearbyShop: flag,
  alertPacking: flag,
  alertLeaveNow: flag,
  alertCheckIn: flag,
  alertDelay: flag,
  alertConnection: flag,
});

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = SettingsInput.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  if ((parsed.data.quietHoursStart == null) !== (parsed.data.quietHoursEnd == null)) {
    return { errors: { quietHoursEnd: "Set both times, or neither" }, values };
  }
  await prisma.settings.upsert({ where: { id: "me" }, update: parsed.data, create: { id: "me", ...parsed.data } });
  revalidatePath("/settings");
  return { values: { saved: "1" } };
}

// ------------------------------------------------------------- developer tools

export type SweepState = { result?: SweepResult & { at: string }; error?: string };

/** Run the reminder sweep as if it were a different moment ("pretend time"). */
export async function runSweepAt(_prev: SweepState, formData: FormData): Promise<SweepState> {
  if (!demoToolsEnabled()) return { error: "Developer tools are off" };
  // A quick button sends "preset"; the date field sends "at".
  const value = String(formData.get("preset") || formData.get("at") || "");
  const settings = await getSettings();
  const at = value ? localToUtc(value.slice(0, 10), value.slice(11, 16), settings.homeTimeZone) : new Date();
  if (Number.isNaN(at.getTime())) return { error: "Pick a date and time" };
  const result = await runSweep(at);
  revalidatePath("/", "layout");
  return { result: { ...result, at: value || "now" } };
}

export async function clearAlerts() {
  if (!demoToolsEnabled()) return;
  await prisma.alert.deleteMany();
  revalidatePath("/", "layout");
}
