// Live tracking: poll each upcoming leg, notice changes, work out what they
// break, tell the traveler.
import type { Leg } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveArrival, effectiveDeparture, legName } from "@/lib/checks";
import { assessImpact, impactMessage, isDisrupted, type Impact } from "@/lib/impact";
import { createAlert, deliverPending } from "./alerts";
import { getSettings } from "./settings";
import { providerFor } from "./transport";

const MIN = 60_000;
const HOUR = 60 * MIN;

export type StatusUpdate = {
  departureDelayMin: number;
  arrivalDelayMin: number;
  cancelled: boolean;
  platform: string | null; // live platform/gate as reported (null = unknown)
  source: string;
  note?: string | null;
  simulated?: boolean;
};

/** Delays are compared in 5-minute steps so 1-2 minute jitter doesn't spam you. */
function delayBucket(l: Pick<Leg, "departureDelayMin" | "arrivalDelayMin">) {
  const d = Math.max(l.departureDelayMin, l.arrivalDelayMin);
  return d < 5 ? 0 : Math.round(d / 5) * 5;
}

function statusFor(l: Pick<Leg, "departureAt" | "arrivalAt" | "departureDelayMin" | "arrivalDelayMin">, cancelled: boolean, now: Date) {
  if (cancelled) return "CANCELLED";
  const tmp = { ...l } as Leg;
  if (now >= effectiveArrival(tmp)) return "ARRIVED";
  if (now >= effectiveDeparture(tmp)) return "DEPARTED";
  return Math.max(l.departureDelayMin, l.arrivalDelayMin) >= 1 ? "DELAYED" : "SCHEDULED";
}

/**
 * Save a new status for a leg. If something meaningful changed, run the
 * impact check and alert the traveler. Returns the impact (or null).
 */
export async function applyLegStatus(legId: string, u: StatusUpdate, now = new Date()): Promise<{ changed: boolean; impact: Impact | null }> {
  const before = await prisma.leg.findUniqueOrThrow({ where: { id: legId } });
  const next = {
    departureDelayMin: Math.max(0, Math.round(u.departureDelayMin)),
    arrivalDelayMin: Math.max(0, Math.round(u.arrivalDelayMin)),
    livePlatform: u.platform,
  };
  const status = statusFor({ ...before, ...next }, u.cancelled, now);
  const after = await prisma.leg.update({
    where: { id: legId },
    data: {
      ...next, status, lastCheckedAt: now, statusSource: u.source, statusNote: u.note ?? null,
      ...(u.simulated !== undefined ? { simulated: u.simulated } : {}),
    },
  });

  const platformChanged = (before.livePlatform ?? before.platform) !== (after.livePlatform ?? after.platform);
  const changed =
    delayBucket(before) !== delayBucket(after) || (before.status === "CANCELLED") !== (after.status === "CANCELLED") || platformChanged;
  if (!changed) return { changed: false, impact: null };

  const impact = await reportChange(after, isDisrupted(before), now);
  return { changed: true, impact };
}

async function reportChange(leg: Leg, wasDisrupted: boolean, now: Date): Promise<Impact | null> {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: leg.tripId }, include: { legs: true, stays: true, dependencies: true } });
  const settings = await getSettings();
  const name = legName(leg);
  const bucket = delayBucket(leg);
  const key = `status:${leg.id}:d${bucket}:c${leg.status === "CANCELLED" ? 1 : 0}:p${leg.livePlatform ?? ""}`;
  const expiresAt = new Date(effectiveArrival(leg).getTime() + 2 * HOUR);
  const url = `/trips/${trip.id}?saved=leg-${leg.id}`;

  let impact = assessImpact(trip, leg.id);

  if (!impact) {
    // Back to normal after a disruption: say so once.
    if (wasDisrupted && settings.alertDelay) {
      await createAlert({
        tripId: trip.id, type: "DELAY", severity: "INFO", urgent: false, itemKind: "LEG", itemId: leg.id, url,
        title: `${name} is back on time`, body: `${name} is running to schedule again. Your plan is unchanged.`,
        dedupeKey: key, fireAt: now, expiresAt,
      });
      await deliverPending(trip, settings, now);
    }
    return null;
  }

  // Missed something? Ask a live journey planner for the next option first;
  // fall back to the estimate inside assessImpact if it can't answer.
  if (impact.missedLegId && impact.earliest) {
    const missed = trip.legs.find((l) => l.id === impact!.missedLegId)!;
    const provider = providerFor(missed);
    const live = provider?.findAlternative ? await provider.findAlternative(missed, impact.earliest).catch(() => null) : null;
    if (live) impact = assessImpact(trip, leg.id, live) ?? impact;
  }

  const type =
    leg.status === "CANCELLED" ? "CANCELLATION"
    : impact.missedLegId ? "MISSED_CONNECTION"
    : bucket === 0 ? "PLATFORM_CHANGE"
    : "DELAY";
  const enabled = type === "MISSED_CONNECTION" ? settings.alertConnection || settings.alertDelay : settings.alertDelay;
  if (enabled) {
    const showImpact = type !== "MISSED_CONNECTION" || settings.alertConnection;
    const startsSoon = effectiveDeparture(leg).getTime() - now.getTime() < 3 * HOUR;
    await createAlert({
      tripId: trip.id,
      type: showImpact ? type : "DELAY",
      severity: impact.severity,
      urgent: impact.severity !== "INFO" || startsSoon,
      title:
        type === "CANCELLATION" ? `${name} is cancelled`
        : type === "MISSED_CONNECTION" && showImpact ? `${name} +${bucket} min: connection at risk`
        : type === "PLATFORM_CHANGE" ? `${name}: ${leg.mode === "FLIGHT" ? "gate" : "platform"} change to ${leg.livePlatform}`
        : `${name} is +${bucket} min`,
      body: showImpact ? impactMessage(impact) : impact.headline,
      action: impact.action,
      itemKind: "LEG", itemId: leg.id, url, dedupeKey: key, fireAt: now, expiresAt,
    });
    await deliverPending(trip, settings, now);
  }
  return impact;
}

// ---------------------------------------------------------------- polling

/** How often to poll a leg: every 5 min from 24 h before, every 2 min in the last 2 h. */
export function pollIntervalMs(leg: Leg, now: Date): number | null {
  const dep = effectiveDeparture(leg).getTime();
  const arr = effectiveArrival(leg).getTime();
  const t = now.getTime();
  if (leg.status === "ARRIVED" || t > arr + 15 * MIN || dep - t > 24 * HOUR) return null;
  return dep - t <= 2 * HOUR ? 2 * MIN : 5 * MIN;
}

export async function pollLegs(now = new Date()): Promise<{ checked: number; changed: number }> {
  const candidates = await prisma.leg.findMany({
    where: {
      simulated: false, // "Simulate delay" pins a leg until you reset it
      status: { not: "ARRIVED" },
      departureAt: { lte: new Date(now.getTime() + 25 * HOUR) },
      arrivalAt: { gte: new Date(now.getTime() - 12 * HOUR) },
    },
  });
  let checked = 0;
  let changed = 0;
  for (const leg of candidates) {
    const interval = pollIntervalMs(leg, now);
    if (interval == null) continue;
    if (leg.lastCheckedAt && now.getTime() - leg.lastCheckedAt.getTime() < interval) continue;
    const r = await checkLeg(leg, now);
    checked++;
    if (r.changed) changed++;
  }
  return { checked, changed };
}

/** Ask the leg's provider once and apply the answer. */
export async function checkLeg(leg: Leg, now = new Date()): Promise<{ changed: boolean; note?: string; impact?: Impact | null }> {
  const provider = providerFor(leg);
  if (!provider) return { changed: false, note: "Live tracking is off for this leg." };
  const r = await provider.getStatus(leg);
  if (!r.ok || !r.found) {
    // Keep the last known status, record why we couldn't update it.
    await prisma.leg.update({ where: { id: leg.id }, data: { lastCheckedAt: now, statusSource: r.source, statusNote: r.note } });
    return { changed: false, note: r.note };
  }
  const { changed, impact } = await applyLegStatus(
    leg.id,
    { departureDelayMin: r.departureDelayMin, arrivalDelayMin: r.arrivalDelayMin, cancelled: r.cancelled, platform: r.platform, source: r.source, note: null },
    now,
  );
  return { changed, impact };
}
