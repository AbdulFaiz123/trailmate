// Storing and delivering alerts. Used by the reminder sweep and by the live
// disruption pipeline (which pushes immediately instead of waiting a minute).
import { Prisma, type Alert, type Settings, type Leg } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isQuietTime, travelerZone } from "@/lib/reminders";
import { pushToAll } from "./push";

/** Don't push alerts older than this (e.g. after quiet hours or downtime). */
const PUSH_WINDOW_MS = 12 * 3_600_000;

export type NewAlert = Omit<Prisma.AlertUncheckedCreateInput, "id" | "createdAt" | "readAt" | "pushedAt">;

/** Create an alert unless one with the same dedupeKey exists. Returns it if new. */
export async function createAlert(data: NewAlert): Promise<Alert | null> {
  try {
    return await prisma.alert.create({ data });
  } catch (e) {
    // P2002 = unique constraint: we already have this alert. That's the point.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/**
 * Push this trip's alerts that haven't been pushed yet. During quiet hours
 * (in the zone the traveler is in) only urgent ones go out.
 */
export async function deliverPending(
  trip: { id: string; name: string; homeTimeZone: string; legs: Leg[] },
  settings: Pick<Settings, "quietHoursStart" | "quietHoursEnd">,
  now: Date,
): Promise<{ pushed: number; quiet: boolean }> {
  const quiet = isQuietTime(now, travelerZone(trip, now), settings.quietHoursStart, settings.quietHoursEnd);
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
  if (pending.length === 0) return { pushed: 0, quiet };

  const urgent = pending.filter((a) => a.urgent);
  const normal = pending.filter((a) => !a.urgent);
  const sent: string[] = [];
  const tag = (a: Alert) => (a.itemId ? `${a.type}:${a.itemId}` : a.dedupeKey);

  for (const a of urgent) {
    if (await pushToAll({ title: a.title, body: a.body, url: `/alerts/open/${a.id}`, tag: tag(a) })) sent.push(a.id);
  }
  // More than two at once? One summary instead of a burst.
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
      if (await pushToAll({ title: a.title, body: a.body, url: `/alerts/open/${a.id}`, tag: tag(a) })) sent.push(a.id);
    }
  }
  if (sent.length) await prisma.alert.updateMany({ where: { id: { in: sent } }, data: { pushedAt: new Date() } });
  return { pushed: sent.length, quiet };
}
