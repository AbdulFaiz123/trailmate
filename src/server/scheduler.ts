// The background job. Every minute it:
//   1. works out which reminders are due for every current trip (src/lib/reminders.ts)
//   2. stores new ones as Alerts (the unique dedupeKey stops duplicates)
//   3. pushes alerts that haven't been pushed yet, unless it's quiet hours
//   4. polls live status for legs leaving within 24 h (src/server/disruption.ts)
import { prisma } from "@/lib/db";
import { dueReminders, sweepFromDate } from "@/lib/reminders";
import { createAlert, deliverPending } from "./alerts";
import { pollLegs } from "./disruption";
import { getSettings } from "./settings";

const TICK_MS = 60_000;

export type SweepResult = { created: number; pushed: number; quiet: boolean };

let running = false;

/** Store newly due reminders and push what's pending. `now` can be a pretend time. */
export async function runSweep(now = new Date()): Promise<SweepResult> {
  if (running) return { created: 0, pushed: 0, quiet: false };
  running = true;
  try {
    const settings = await getSettings();
    const trips = await prisma.trip.findMany({
      // Only trips that haven't ended (dates are "yyyy-MM-dd", so text order is date order).
      where: { endDate: { gte: sweepFromDate(now, settings.homeTimeZone) } },
      include: { legs: true, stays: true, tasks: { include: { person: true } } },
    });
    let created = 0;
    let pushed = 0;
    let anyQuiet = false;

    for (const trip of trips) {
      for (const r of dueReminders(trip, settings, now)) {
        const alert = await createAlert({
          tripId: trip.id, type: r.type, severity: r.severity, urgent: r.urgent,
          title: r.title, body: r.body, action: r.action, itemKind: r.itemKind, itemId: r.itemId,
          url: r.url, dedupeKey: r.key, fireAt: r.fireAt, expiresAt: r.expiresAt,
        });
        if (alert) created++;
      }
      const d = await deliverPending(trip, settings, now);
      pushed += d.pushed;
      anyQuiet ||= d.quiet;
    }
    return { created, pushed, quiet: anyQuiet };
  } finally {
    running = false;
  }
}

const globalForScheduler = globalThis as unknown as { trailmateScheduler?: NodeJS.Timeout };

/** Start the once-a-minute loop (called from src/instrumentation.ts). */
export function startScheduler() {
  if (process.env.SCHEDULER_DISABLED === "1" || globalForScheduler.trailmateScheduler) return;
  const tick = async () => {
    try {
      const r = await runSweep();
      if (r.created || r.pushed) console.log(`[scheduler] ${r.created} new alerts, ${r.pushed} pushed${r.quiet ? " (quiet hours)" : ""}`);
      const p = await pollLegs();
      if (p.checked) console.log(`[scheduler] live status: ${p.checked} legs checked, ${p.changed} changed`);
    } catch (e) {
      console.error("[scheduler] sweep failed", e);
    }
  };
  globalForScheduler.trailmateScheduler = setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000);
  console.log("[scheduler] started: reminders + live status every 60 s");
}
