// Reminder rules: given a trip, the traveler's settings and "now", work out
// which reminders exist and when each one is due.
//
// Pure functions again: no database, no clock of its own. The scheduler
// (src/server/scheduler.ts) calls these every minute, saves new ones as
// Alerts and sends them. Tests and the "pretend time" dev tool call them with
// any `now` they like.
import type { Leg, Person, Settings, Stay, Task } from "@prisma/client";
import { addDays } from "date-fns";
import { effectiveDeparture, findConnections, legName, zoneAt } from "./checks";
import { distanceM, formatDistance } from "./geo";
import { dayDiff, formatDay, formatTime, localDateKey, localToUtc, tzAbbrev } from "./time";
import type { Severity } from "./checks";

export type ReminderType = "BUY_BY" | "NEARBY_SHOP" | "PACKING" | "LEAVE_NOW" | "CHECK_IN";

export type Reminder = {
  key: string; // dedupe key: the same key is only ever stored/sent once
  type: ReminderType;
  severity: Severity;
  urgent: boolean; // ignores quiet hours
  title: string;
  body: string;
  action?: string;
  itemKind?: "LEG" | "STAY" | "TASK";
  itemId?: string;
  url: string;
  fireAt: Date; // due from this moment...
  expiresAt: Date; // ...until this one
};

export type TripForReminders = {
  id: string;
  name: string;
  startDate: string;
  homeTimeZone: string;
  legs: Leg[];
  stays: Stay[];
  tasks: (Task & { person?: Person | null })[];
};

type ReminderSettings = Pick<
  Settings,
  "leaveBufferMin" | "quietHoursStart" | "quietHoursEnd" | "alertBuyBy" | "alertNearbyShop" | "alertPacking" | "alertLeaveNow" | "alertCheckIn"
>;

const HOUR = 3_600_000;
const MIN = 60_000;
/** A shop counts as "near" a stay within this distance. */
export const NEARBY_M = 2_000;

const at = (d: Date, tz: string) => `${formatTime(d, tz)} ${tzAbbrev(d, tz)}`;
const untilYouLeave = (days: number) =>
  days === 0 ? "You leave today." : `${days} day${days === 1 ? "" : "s"} until you leave.`;
const itemLabel = (t: Task) => (t.quantity > 1 ? `${t.quantity} × ${t.name}` : t.name);

/** When the trip really starts: the first departure, or 09:00 on the start date. */
export function tripDeparture(trip: TripForReminders): Date {
  const first = [...trip.legs].sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime())[0];
  return first ? effectiveDeparture(first) : localToUtc(trip.startDate, "09:00", trip.homeTimeZone);
}

// ---------------------------------------------------------------- the rules

function buyByReminders(trip: TripForReminders, departure: Date): Reminder[] {
  const result: Reminder[] = [];
  const url = `/trips/${trip.id}/lists?tab=BUY`;
  for (const task of trip.tasks) {
    if (task.list !== "BUY" || task.status !== "TO_BUY" || !task.buyBy) continue;
    const tz = trip.homeTimeZone;
    const daysToGo = (from: Date) => Math.max(0, dayDiff(localDateKey(from, tz), localDateKey(departure, tz)));
    const who = task.person ? ` for ${task.person.name}` : "";
    const base = { type: "BUY_BY" as const, itemKind: "TASK" as const, itemId: task.id, url, urgent: false };

    // 1) Three days before the buy-by date.
    const early = new Date(task.buyBy.getTime() - 3 * 24 * HOUR);
    result.push({
      ...base,
      key: `buyby:${task.id}:3d`,
      severity: "INFO",
      title: `Still to buy: ${itemLabel(task)}${who}`,
      body: `Buy by ${formatDay(task.buyBy, tz)}. ${untilYouLeave(daysToGo(early))}`,
      fireAt: early,
      expiresAt: new Date(task.buyBy.getTime() - 11 * HOUR),
    });
    // 2) The morning of the buy-by day (buy-by is 20:00, so 09:00 is 11 h before).
    const morning = new Date(task.buyBy.getTime() - 11 * HOUR);
    result.push({
      ...base,
      key: `buyby:${task.id}:today`,
      severity: "WARNING",
      title: `Buy today: ${itemLabel(task)}${who}`,
      body: `Shops close soon after ${at(task.buyBy, tz)}. ${untilYouLeave(daysToGo(morning))}`,
      fireAt: morning,
      expiresAt: task.buyBy,
    });
    // 3) Missed it, but there is still time before departure.
    if (task.buyBy < departure) {
      result.push({
        ...base,
        key: `buyby:${task.id}:overdue`,
        severity: "WARNING",
        title: `You haven't bought ${itemLabel(task)} yet`,
        body: `It was due ${formatDay(task.buyBy, tz)}. You leave ${formatDay(departure, tz)} at ${at(departure, tz)}.`,
        action: "Buy it, or remove it from the list",
        fireAt: task.buyBy,
        expiresAt: departure,
      });
    }
  }
  return result;
}

function nearbyShopReminders(trip: TripForReminders): Reminder[] {
  const result: Reminder[] = [];
  for (const task of trip.tasks) {
    if (task.list !== "BUY" || task.status !== "TO_BUY" || task.lat == null || task.lng == null) continue;
    for (const stay of trip.stays) {
      if (stay.lat == null || stay.lng == null) continue;
      // Only useful if you are still allowed to buy it during the stay.
      if (task.buyBy && task.buyBy < stay.checkInAt) continue;
      const m = distanceM({ lat: task.lat, lng: task.lng }, { lat: stay.lat, lng: stay.lng });
      if (m > NEARBY_M) continue;
      result.push({
        key: `nearby:${task.id}:${stay.id}`,
        type: "NEARBY_SHOP",
        severity: "INFO",
        urgent: false,
        title: `Buy ${itemLabel(task)} near ${stay.name}`,
        body: `${task.placeName ?? "The shop"} is ${formatDistance(m)} from where you're staying.`,
        itemKind: "TASK",
        itemId: task.id,
        url: `/trips/${trip.id}/lists?tab=BUY`,
        fireAt: stay.checkInAt,
        expiresAt: stay.checkOutAt,
      });
    }
  }
  return result;
}

function packingReminder(trip: TripForReminders, departure: Date): Reminder[] {
  const first = [...trip.legs].sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime())[0];
  const tz = first?.fromTimeZone ?? trip.homeTimeZone;
  const eve = addDays(new Date(`${localDateKey(departure, tz)}T12:00:00Z`), -1).toISOString().slice(0, 10);
  const fireAt = localToUtc(eve, "19:00", tz);

  const unpacked = trip.tasks.filter((t) => t.list === "PACK" && t.status !== "PACKED");
  const boughtNotPacked = trip.tasks.filter((t) => t.list === "BUY" && t.status === "BOUGHT" && t.bag !== "NONE");
  const notBought = trip.tasks.filter((t) => t.list === "BUY" && t.status === "TO_BUY" && t.bag !== "NONE");
  const toPack = [...unpacked, ...boughtNotPacked];
  if (toPack.length === 0 && notBought.length === 0) return [];

  const names = toPack.slice(0, 5).map(itemLabel).join(", ") + (toPack.length > 5 ? ` and ${toPack.length - 5} more` : "");
  return [{
    key: `packing:${trip.id}:${eve}`,
    type: "PACKING",
    severity: "WARNING",
    urgent: false,
    title: toPack.length ? `Pack tonight: ${toPack.length} item${toPack.length === 1 ? "" : "s"} left` : "Last chance to shop",
    body:
      (toPack.length ? `Not packed yet: ${names}.` : "") +
      (notBought.length ? ` Still not bought: ${notBought.map(itemLabel).join(", ")}.` : "") +
      ` You leave tomorrow at ${at(departure, tz)}.`,
    url: `/trips/${trip.id}/lists?tab=PACK`,
    fireAt,
    expiresAt: departure,
  }];
}

function leaveNowReminders(trip: TripForReminders, settings: ReminderSettings): Reminder[] {
  // Only legs you *start* from a standstill need "leave now": if you arrive on
  // a connecting leg, you're already on your way.
  const connections = findConnections(trip.legs, trip.stays);
  const isConnected = new Set(connections.map((c) => c.toLegId));
  const next = new Map(connections.map((c) => [c.fromLegId, c.toLegId]));
  const byId = new Map(trip.legs.map((l) => [l.id, l]));

  const result: Reminder[] = [];
  for (const leg of trip.legs) {
    if (isConnected.has(leg.id) || leg.status === "CANCELLED") continue;
    const buffer = leg.mode === "TAXI" ? 5 : leg.mode === "WALK" ? 0 : settings.leaveBufferMin;
    const dep = effectiveDeparture(leg);
    const tz = leg.fromTimeZone;
    const onward = next.get(leg.id) ? byId.get(next.get(leg.id)!) : undefined;
    const delayNote = leg.departureDelayMin > 0 ? ` (${leg.departureDelayMin} min late)` : "";
    const where = leg.platform ? `, ${leg.mode === "FLIGHT" ? "gate" : "platform"} ${leg.livePlatform ?? leg.platform}` : "";

    result.push({
      // The delay is part of the key: if the train gets later, you get a new,
      // corrected "leave now".
      key: `leave:${leg.id}:${leg.departureDelayMin}`,
      type: "LEAVE_NOW",
      severity: "WARNING",
      urgent: true,
      title: leg.mode === "TAXI" ? `Be outside now: ${legName(leg)}` : `Leave now for ${legName(leg)}`,
      body:
        `${legName(leg)} leaves ${leg.fromName} at ${at(dep, tz)}${delayNote}${where}.` +
        (onward ? ` You need it for ${legName(onward)} at ${at(effectiveDeparture(onward), onward.fromTimeZone)}.` : "") +
        (buffer ? ` That gives you ${buffer} min to get there.` : ""),
      itemKind: "LEG",
      itemId: leg.id,
      url: `/trips/${trip.id}?saved=leg-${leg.id}`,
      fireAt: new Date(dep.getTime() - buffer * MIN),
      expiresAt: dep,
    });
  }
  return result;
}

function checkInReminders(trip: TripForReminders): Reminder[] {
  const result: Reminder[] = [];
  for (const leg of trip.legs) {
    if (leg.mode !== "FLIGHT" || leg.status === "CANCELLED") continue;
    const dep = effectiveDeparture(leg);
    result.push({
      key: `checkin:flight:${leg.id}`,
      type: "CHECK_IN",
      severity: "INFO",
      urgent: false,
      title: `Check in online for ${legName(leg)}`,
      body:
        `Online check-in usually opens 24 h before departure (${formatDay(dep, leg.fromTimeZone)} ${at(dep, leg.fromTimeZone)}).` +
        (leg.bookingRef ? ` Booking ref ${leg.bookingRef}.` : ""),
      action: `Open the ${leg.carrier ?? "airline"} app`,
      itemKind: "LEG",
      itemId: leg.id,
      url: `/trips/${trip.id}?saved=leg-${leg.id}`,
      fireAt: new Date(dep.getTime() - 24 * HOUR),
      expiresAt: new Date(dep.getTime() - HOUR),
    });
  }
  for (const stay of trip.stays) {
    if (stay.kind === "FAMILY") continue; // nobody checks you in at Mom's
    const tz = stay.timeZone;
    result.push({
      key: `checkin:stay:${stay.id}`,
      type: "CHECK_IN",
      severity: "INFO",
      urgent: false,
      title: `Check-in today: ${stay.name}`,
      body:
        `Check-in from ${at(stay.checkInAt, tz)}` +
        (stay.latestCheckInAt ? `, latest ${at(stay.latestCheckInAt, tz)}` : "") +
        "." +
        (stay.address ? ` ${stay.address}.` : "") +
        (stay.bookingRef ? ` Booking ref ${stay.bookingRef}.` : ""),
      itemKind: "STAY",
      itemId: stay.id,
      url: `/trips/${trip.id}?saved=stay-${stay.id}`,
      fireAt: new Date(stay.checkInAt.getTime() - 3 * HOUR),
      expiresAt: stay.latestCheckInAt ?? stay.checkOutAt,
    });
  }
  return result;
}

// ---------------------------------------------------------------- public API

/** Every reminder this trip will ever produce, whether due or not. */
export function allReminders(trip: TripForReminders, settings: ReminderSettings): Reminder[] {
  const departure = tripDeparture(trip);
  const enabled: Record<ReminderType, boolean> = {
    BUY_BY: settings.alertBuyBy,
    NEARBY_SHOP: settings.alertNearbyShop,
    PACKING: settings.alertPacking,
    LEAVE_NOW: settings.alertLeaveNow,
    CHECK_IN: settings.alertCheckIn,
  };
  return [
    ...buyByReminders(trip, departure),
    ...nearbyShopReminders(trip),
    ...packingReminder(trip, departure),
    ...leaveNowReminders(trip, settings),
    ...checkInReminders(trip),
  ]
    .filter((r) => enabled[r.type])
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/** The reminders that should be live at `now`. */
export function dueReminders(trip: TripForReminders, settings: ReminderSettings, now: Date): Reminder[] {
  return allReminders(trip, settings).filter((r) => r.fireAt <= now && now < r.expiresAt);
}

/**
 * Are we inside quiet hours? Quiet hours are wall-clock times ("22:30" to
 * "07:00") in the zone the traveler is *in right now*: 23:00 in Hyderabad is
 * night, even if it's only 18:30 at home.
 */
export function isQuietTime(now: Date, tz: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false;
  const t = formatTime(now, tz);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

export function travelerZone(trip: Pick<TripForReminders, "legs" | "homeTimeZone">, now: Date): string {
  const legs = [...trip.legs].sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
  return zoneAt(now, legs, trip.homeTimeZone);
}
