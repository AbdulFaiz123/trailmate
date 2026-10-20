"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { impactMessage, type Impact } from "@/lib/impact";
import { applyLegStatus, checkLeg } from "@/server/disruption";
import { demoToolsEnabled } from "@/server/settings";

export type LiveState = { message?: string; severity?: "INFO" | "WARNING" | "CRITICAL"; error?: string };

function describe(impact: Impact | null, changed: boolean, fallback: string): LiveState {
  if (impact) return { message: impactMessage(impact) + (impact.action ? ` → ${impact.action}.` : ""), severity: impact.severity };
  return { message: changed ? fallback : "No change.", severity: "INFO" };
}

/**
 * "Simulate delay" (dev & demo only). Runs the exact same pipeline as a real
 * status update: save -> impact check -> alert -> push.
 */
export async function simulateLeg(tripId: string, legId: string, _prev: LiveState, formData: FormData): Promise<LiveState> {
  if (!demoToolsEnabled()) return { error: "Simulation is only available in development or with DEMO_TOOLS=1." };
  const leg = await prisma.leg.findUnique({ where: { id: legId, tripId } });
  if (!leg) return { error: "Leg not found" };
  const preset = String(formData.get("preset") ?? "");
  const platformInput = String(formData.get("platform") ?? "").trim();

  let update;
  if (preset === "reset") {
    update = { departureDelayMin: 0, arrivalDelayMin: 0, cancelled: false, platform: null, source: "simulated", simulated: false };
  } else if (preset === "cancel") {
    update = { departureDelayMin: leg.departureDelayMin, arrivalDelayMin: leg.arrivalDelayMin, cancelled: true, platform: leg.livePlatform, source: "simulated", simulated: true };
  } else if (preset === "platform") {
    if (!platformInput) return { error: "Type the new platform or gate first." };
    update = { departureDelayMin: leg.departureDelayMin, arrivalDelayMin: leg.arrivalDelayMin, cancelled: leg.status === "CANCELLED", platform: platformInput, source: "simulated", simulated: true };
  } else {
    const minutes = Number(preset);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) return { error: "Pick a delay" };
    update = { departureDelayMin: minutes, arrivalDelayMin: minutes, cancelled: false, platform: leg.livePlatform, source: "simulated", simulated: true };
  }

  const { changed, impact } = await applyLegStatus(legId, { ...update, note: preset === "reset" ? null : "Simulated status (demo)" });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/", "layout");
  return describe(impact, changed, preset === "reset" ? "Back to the timetable." : "Saved.");
}

/** Ask the live source right now instead of waiting for the next poll. */
export async function checkLegNow(tripId: string, legId: string): Promise<LiveState> {
  const leg = await prisma.leg.findUnique({ where: { id: legId, tripId } });
  if (!leg) return { error: "Leg not found" };
  if (leg.simulated) return { message: "This leg is showing a simulated status. Reset it first to see live data.", severity: "INFO" };
  const r = await checkLeg(leg);
  revalidatePath(`/trips/${tripId}`);
  if (r.note) return { message: r.note, severity: "INFO" };
  return describe(r.impact ?? null, r.changed, "Updated.");
}
