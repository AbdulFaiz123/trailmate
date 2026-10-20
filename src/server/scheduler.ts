// The background job. Every minute it:
//   1. works out which reminders are due for every trip (src/lib/reminders.ts)
//   2. stores new ones as Alerts (the unique dedupeKey stops duplicates)
//   3. pushes alerts that haven't been pushed yet, unless it's quiet hours
//
// Step 5 adds live status polling for legs to the same tick.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dueReminders, isQuietTime, travelerZone } from "@/lib/reminders";
import { getSettings } from "./settings";
import { pushToAll } from "./push";

const TICK_MS = 60_000;
/** Don't push alerts older than this (e.g. after quiet hours or downtime). */
const PUSH_WINDOW_MS = 12 * 3_600_000;

export type SweepResult = { created: number; pushed: number; quiet: boolean };

let running = false;

export async function runSweep(now = new Date()): Promise<SweepResult> {
  if (running) return { created: 0, pushed: 0, quiet: false };
  running = true;
  try {
    const settings = await getSettings();
    const trips = await prisma.trip.findMany({
      include: { legs: true, stays: true, tasks: { include: { person: true } } },
    });

    let created = 0;
    let pushed = 0;
    let anyQuiet = false;

    for (const trip of trips) {
      // 1 + 2: store newly due reminders.
      for (const r of dueReminders(trip, settings, now)) {
        try {
          await prisma.alert.create({
            data: {
              tripId: trip.id, type: r.type, severity: r.severity, urgent: r.urgent,
              title: r.title, body: r.body, action: r.action, itemKind: r.itemKind, itemId: r.itemId,
              url: r.url, dedupeKey: r.key, fireAt: r.fireAt, expiresAt: r.expiresAt,
            },
          });
          created++;
        } catch (e) {
          // P2002 = unique constraint: we already have this alert. That's the point.
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        }
      }

      // 3: push what hasn't been pushed, respecting quiet hours where the traveler is.
      const quiet = isQuietTime(now, travelerZone(trip, now), settings.quietHoursStart, settings.quietHoursEnd);
      anyQuiet ||= quiet;
      const pending = await prisma.alert.findMany({
        where: {
          tripId: trip.id,
          pushedAt: null,
          readAt: null,
          createdAt: { gte: new Date(Date.now() - PUSH_WINDOW_MS) },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          ...(quiet ? { urgent: true } : {}),
        },
        orderBy: { createdAt: "asc" },
      });
      if (pending.length === 0) continue;

      const urgent = pending.filter((a) => a.urgent);
      const normal = pending.filter((a) => !a.urgent);
      const sent: string[] = [];

      for (const a of urgent) {
        if (await pushToAll({ title: a.title, body: a.body, url: `/alerts/open/${a.id}`, tag: a.itemId ? `${a.type}:${a.itemId}` : a.dedupeKey })) sent.push(a.id);
      }
      // More than two at once? Send one summary instead of a burst.
      if (normal.length > 2) {
        const ok = await pushToAll({
          title: `${trip.name}: ${normal.length} reminders`,
          body: normal.map((a) => `• ${a.title}`).join("\n"),
          url: "/alerts",
          tag: `digest:${trip.id}`,
        });
        if (ok) sent.push(...normal.map((a) => a.id));
      } else {
        for (const a of normal) {
          if (await pushToAll({ title: a.title, body: a.body, url: `/alerts/open/${a.id}`, tag: a.dedupeKey })) sent.push(a.id);
        }
      }
      if (sent.length) {
        await prisma.alert.updateMany({ where: { id: { in: sent } }, data: { pushedAt: new Date() } });
        pushed += sent.length;
      }
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
    } catch (e) {
      console.error("[scheduler] sweep failed", e);
    }
  };
  globalForScheduler.trailmateScheduler = setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000);
  console.log("[scheduler] started: reminder sweep every 60 s");
}
