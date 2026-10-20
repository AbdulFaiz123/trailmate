// Turn DB rows into form values (local wall-clock strings) and pick smart
// defaults for new items so the traveler types as little as possible.
import type { Leg, Stay, Trip } from "@prisma/client";
import { addDays } from "date-fns";
import { localDateKey, localToUtc, toLocalInput } from "./time";

const money = (minor: number | null) => (minor == null ? "" : (minor / 100).toFixed(2));

export function legToForm(leg: Leg): Record<string, string> {
  return {
    mode: leg.mode,
    fromName: leg.fromName, fromTimeZone: leg.fromTimeZone, fromStopId: leg.fromStopId ?? "",
    toName: leg.toName, toTimeZone: leg.toTimeZone, toStopId: leg.toStopId ?? "",
    departure: toLocalInput(leg.departureAt, leg.fromTimeZone),
    arrival: toLocalInput(leg.arrivalAt, leg.toTimeZone),
    carrier: leg.carrier ?? "", number: leg.number ?? "", bookingRef: leg.bookingRef ?? "",
    platform: leg.platform ?? "", seat: leg.seat ?? "",
    cost: money(leg.costMinor), currency: leg.currency ?? "", notes: leg.notes ?? "",
  };
}

export function stayToForm(stay: Stay): Record<string, string> {
  return {
    kind: stay.kind, name: stay.name, address: stay.address ?? "", timeZone: stay.timeZone,
    checkIn: toLocalInput(stay.checkInAt, stay.timeZone),
    latestCheckIn: toLocalInput(stay.latestCheckInAt, stay.timeZone),
    checkOut: toLocalInput(stay.checkOutAt, stay.timeZone),
    bookingRef: stay.bookingRef ?? "", bookingUrl: stay.bookingUrl ?? "",
    cost: money(stay.costMinor), currency: stay.currency ?? "", notes: stay.notes ?? "",
  };
}

/** A new leg starts where the last one ended, 30 minutes later. */
export function newLegDefaults(trip: Trip, legs: Leg[]): Record<string, string> {
  const last = [...legs].sort((a, b) => b.arrivalAt.getTime() - a.arrivalAt.getTime())[0];
  if (!last) {
    const dep = localToUtc(trip.startDate, "09:00", trip.homeTimeZone);
    return {
      mode: "TRAIN", fromName: trip.origin, fromTimeZone: trip.homeTimeZone, toTimeZone: trip.homeTimeZone,
      departure: toLocalInput(dep, trip.homeTimeZone), currency: trip.homeCurrency,
    };
  }
  const dep = new Date(last.arrivalAt.getTime() + 30 * 60_000);
  return {
    mode: "TRAIN", fromName: last.toName, fromTimeZone: last.toTimeZone, toTimeZone: last.toTimeZone,
    departure: toLocalInput(dep, last.toTimeZone), currency: trip.homeCurrency,
  };
}

/** A new stay starts where the last stay ended (or on the first day), 15:00 -> 11:00 next day. */
export function newStayDefaults(trip: Trip, stays: Stay[], legs: Leg[]): Record<string, string> {
  const lastStay = [...stays].sort((a, b) => b.checkOutAt.getTime() - a.checkOutAt.getTime())[0];
  const lastLeg = [...legs].sort((a, b) => b.arrivalAt.getTime() - a.arrivalAt.getTime())[0];
  const tz = lastLeg?.toTimeZone ?? trip.homeTimeZone;
  const day = lastStay ? localDateKey(lastStay.checkOutAt, lastStay.timeZone) : trip.startDate;
  const nextDay = localDateKey(addDays(new Date(`${day}T12:00:00Z`), 1), "UTC");
  return {
    kind: "HOTEL", timeZone: tz, currency: trip.homeCurrency,
    checkIn: `${day}T15:00`, checkOut: `${nextDay}T11:00`,
  };
}

export function taskToForm(
  task: import("@prisma/client").Task & { person: import("@prisma/client").Person | null },
  homeTimeZone: string,
): Record<string, string> {
  return {
    list: task.list, name: task.name, quantity: String(task.quantity), category: task.category ?? "OTHER",
    status: task.status, person: task.person?.name ?? "", bag: task.bag ?? "NONE",
    weightG: task.weightG != null ? String(task.weightG) : "",
    price: money(task.priceMinor), currency: task.currency ?? "",
    buyBy: task.buyBy ? localDateKey(task.buyBy, homeTimeZone) : "",
    placeName: task.placeName ?? "",
    location: task.lat != null && task.lng != null ? `${task.lat}, ${task.lng}` : "",
    notes: task.notes ?? "",
  };
}
