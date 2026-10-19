// Builds the Trip Timeline: one sorted list of everything that happens on a
// trip, regardless of which table it lives in.
//
// A Stay spans many days, so it becomes two entries: check-in and check-out.
// A Task only appears on the timeline when it has a deadline (buy-by / due).
import type { Leg, Person, Stay, Task } from "@prisma/client";
import { localDateKey } from "./time";

export type TimelineEntry =
  | { kind: "LEG"; key: string; at: Date; tz: string; leg: Leg }
  | { kind: "STAY_IN"; key: string; at: Date; tz: string; stay: Stay }
  | { kind: "STAY_OUT"; key: string; at: Date; tz: string; stay: Stay }
  | { kind: "TASK"; key: string; at: Date; tz: string; task: Task & { person: Person | null } };

export type TimelineDay = {
  dateKey: string; // "2026-10-27", in the local zone of the day's first item
  tz: string; // zone used for the day header
  entries: TimelineEntry[];
};

const DONE_STATUSES = new Set(["BOUGHT", "PACKED", "DONE"]);

export function buildTimeline(input: {
  legs: Leg[];
  stays: Stay[];
  tasks: (Task & { person: Person | null })[];
  homeTimeZone: string;
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const leg of input.legs) {
    // A leg happens where it departs, so its zone is the departure zone.
    entries.push({ kind: "LEG", key: `leg-${leg.id}`, at: leg.departureAt, tz: leg.fromTimeZone, leg });
  }
  for (const stay of input.stays) {
    entries.push({ kind: "STAY_IN", key: `in-${stay.id}`, at: stay.checkInAt, tz: stay.timeZone, stay });
    entries.push({ kind: "STAY_OUT", key: `out-${stay.id}`, at: stay.checkOutAt, tz: stay.timeZone, stay });
  }
  for (const task of input.tasks) {
    const at = task.buyBy ?? task.dueAt;
    if (!at) continue;
    entries.push({ kind: "TASK", key: `task-${task.id}`, at, tz: task.timeZone ?? input.homeTimeZone, task });
  }

  // Sorting by the UTC instant is what makes mixed time zones safe:
  // 17:30 in Frankfurt really is before 07:20 the next morning in Hyderabad.
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime() || order(a) - order(b));
}

// When two entries share the exact same instant, check-out comes before
// check-in, and both come before a leg leaving at that moment.
function order(e: TimelineEntry): number {
  return { STAY_OUT: 0, TASK: 1, LEG: 2, STAY_IN: 3 }[e.kind];
}

/**
 * Group entries by calendar day. Each entry is placed on the date it has *in
 * its own zone* — a flight leaving Frankfurt at 17:30 on the 27th belongs to
 * the 27th, even though it is already the 28th in India when it lands.
 */
export function groupByDay(entries: TimelineEntry[]): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const entry of entries) {
    const dateKey = localDateKey(entry.at, entry.tz);
    const last = days[days.length - 1];
    if (last && last.dateKey === dateKey) last.entries.push(entry);
    else days.push({ dateKey, tz: entry.tz, entries: [entry] });
  }
  return days;
}

export function isEntryDone(entry: TimelineEntry, now: Date): boolean {
  if (entry.kind === "TASK") return DONE_STATUSES.has(entry.task.status);
  if (entry.kind === "LEG") return entry.leg.status === "ARRIVED" || entry.leg.arrivalAt < now;
  return entry.at < now;
}

/**
 * "Next up": the first thing that still lies ahead and is not done.
 * Also returns what is happening right now (an active leg or stay), if any.
 */
export function findNextUp(entries: TimelineEntry[], now = new Date()) {
  const next = entries.find((e) => e.at >= now && !isEntryDone(e, now)) ?? null;

  // Overdue tasks are more urgent than anything in the future.
  const overdue = entries.find((e) => e.kind === "TASK" && e.at < now && !isEntryDone(e, now)) ?? null;

  const current =
    entries.find((e) => e.kind === "LEG" && e.leg.departureAt <= now && e.leg.arrivalAt > now) ??
    entries.find((e) => e.kind === "STAY_IN" && e.stay.checkInAt <= now && e.stay.checkOutAt > now) ??
    null;

  return { next: overdue ?? next, current };
}
