// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Leg, Stay, Task } from "@prisma/client";
import { allReminders, dueReminders, isQuietTime, sweepFromDate, type TripForReminders } from "../src/lib/reminders";
import { localToUtc } from "../src/lib/time";

const BER = "Europe/Berlin";
const HYD = "Asia/Kolkata";
const t = (d: string, hhmm: string, tz = BER) => localToUtc(d, hhmm, tz);

const legDefaults = {
  fromLat: null, fromLng: null, fromStopId: null, toLat: null, toLng: null, toStopId: null,
  carrier: null, number: null, bookingRef: null, platform: null, seat: null, costMinor: null, currency: null,
  notes: null, status: "SCHEDULED", departureDelayMin: 0, arrivalDelayMin: 0, livePlatform: null,
  lastCheckedAt: null, simulated: false, createdAt: new Date(), updatedAt: new Date(), tripId: "trip",
};
const leg = (p: Partial<Leg> & Pick<Leg, "id" | "mode" | "departureAt" | "arrivalAt">) =>
  ({ ...legDefaults, fromName: "A", toName: "B", fromTimeZone: BER, toTimeZone: BER, ...p }) as Leg;
const task = (p: Partial<Task> & Pick<Task, "id" | "name" | "list">) =>
  ({ quantity: 1, status: p.list === "BUY" ? "TO_BUY" : "TODO", bag: "CHECKED", buyBy: null, lat: null, lng: null, placeName: null, person: null, ...p }) as Task;
const stay = (p: Partial<Stay> & Pick<Stay, "id" | "name" | "checkInAt" | "checkOutAt">) =>
  ({ kind: "HOTEL", timeZone: HYD, latestCheckInAt: null, lat: null, lng: null, address: null, bookingRef: null, ...p }) as Stay;

const settings = {
  leaveBufferMin: 20, quietHoursStart: "22:30", quietHoursEnd: "07:00",
  alertBuyBy: true, alertNearbyShop: true, alertPacking: true, alertLeaveNow: true, alertCheckIn: true,
};

const taxi = leg({ id: "taxi", mode: "TAXI", toName: "Berlin Hbf", departureAt: t("2026-10-27", "09:10"), arrivalAt: t("2026-10-27", "09:30") });
const ice = leg({ id: "ice", mode: "TRAIN", number: "ICE 597", fromName: "Berlin Hbf", platform: "14", departureAt: t("2026-10-27", "09:51"), arrivalAt: t("2026-10-27", "14:05") });
const flight = leg({ id: "lh", mode: "FLIGHT", number: "LH 752", toTimeZone: HYD, bookingRef: "LH-5TRW8P", departureAt: t("2026-10-27", "17:30"), arrivalAt: t("2026-10-28", "07:20", HYD) });

const trip: TripForReminders = {
  id: "trip", name: "Demo", startDate: "2026-10-27", homeTimeZone: BER,
  legs: [taxi, ice, flight],
  stays: [stay({ id: "family", name: "Family home", kind: "FAMILY", lat: 17.4156, lng: 78.4347, checkInAt: t("2026-10-29", "12:00", HYD), checkOutAt: t("2026-11-09", "21:30", HYD) })],
  tasks: [
    task({ id: "choc", list: "BUY", name: "Chocolates", quantity: 10, buyBy: t("2026-10-25", "20:00") }),
    task({ id: "rep", list: "BUY", name: "Mosquito repellent", placeName: "Apollo Pharmacy", lat: 17.417, lng: 78.438 }),
    task({ id: "pass", list: "PACK", name: "Passport" }),
  ],
};

test("buy-by: 3 days before, the morning of, then overdue", () => {
  const keys = (now: Date) => dueReminders(trip, settings, now).filter((r) => r.type === "BUY_BY").map((r) => r.key);
  assert.deepEqual(keys(t("2026-10-22", "21:00")), ["buyby:choc:3d"]);
  assert.match(dueReminders(trip, settings, t("2026-10-22", "21:00"))[0].body, /5 days until you leave/);
  assert.deepEqual(keys(t("2026-10-25", "10:00")), ["buyby:choc:today"]);
  assert.match(dueReminders(trip, settings, t("2026-10-25", "10:00")).find((r) => r.type === "BUY_BY")!.body, /2 days until you leave/);
  assert.deepEqual(keys(t("2026-10-26", "10:00")), ["buyby:choc:overdue"]);
  assert.deepEqual(keys(t("2026-10-27", "10:00")), [], "nothing once you've left");
});

test("leave now only for legs you start from a standstill", () => {
  const leave = allReminders(trip, settings).filter((r) => r.type === "LEAVE_NOW");
  // The ICE follows the taxi and the flight follows the ICE (3h25 later), so only the taxi needs one.
  assert.deepEqual(leave.map((r) => r.itemId), ["taxi"]);
  assert.equal(leave[0].fireAt.getTime(), t("2026-10-27", "09:05").getTime(), "taxis get a 5-minute buffer");
  assert.match(leave[0].body, /ICE 597/);
  assert.equal(leave[0].urgent, true);
});

test("a delay moves 'leave now' and creates a new key", () => {
  const late = { ...trip, legs: [{ ...taxi, departureDelayMin: 15 }, ice, flight] };
  const [r] = allReminders(late, settings).filter((x) => x.type === "LEAVE_NOW");
  assert.equal(r.key, "leave:taxi:15");
  assert.equal(r.fireAt.getTime(), t("2026-10-27", "09:20").getTime());
});

test("flight check-in 24 h before", () => {
  const r = allReminders(trip, settings).find((x) => x.key === "checkin:flight:lh")!;
  assert.equal(r.fireAt.getTime(), t("2026-10-26", "17:30").getTime());
  assert.match(r.body, /LH-5TRW8P/);
});

test("no check-in reminder for a family home", () => {
  assert.equal(allReminders(trip, settings).some((r) => r.key === "checkin:stay:family"), false);
});

test("packing reminder the evening before, listing what's left", () => {
  const r = allReminders(trip, settings).find((x) => x.type === "PACKING")!;
  assert.equal(r.fireAt.getTime(), t("2026-10-26", "19:00").getTime());
  assert.match(r.body, /Passport/);
  assert.match(r.body, /Chocolates/, "mentions what still isn't bought");
});

test("shop near a stay: nudge during that stay", () => {
  const r = allReminders(trip, settings).find((x) => x.type === "NEARBY_SHOP")!;
  assert.equal(r.key, "nearby:rep:family");
  assert.match(r.body, /Apollo Pharmacy is 3[0-9]0 m/);
  assert.equal(dueReminders(trip, settings, t("2026-10-30", "10:00", HYD)).some((x) => x.type === "NEARBY_SHOP"), true);
});

test("switched-off alert types are skipped", () => {
  const r = allReminders(trip, { ...settings, alertBuyBy: false, alertLeaveNow: false });
  assert.equal(r.some((x) => x.type === "BUY_BY" || x.type === "LEAVE_NOW"), false);
});

test("quiet hours wrap around midnight, in the traveler's zone", () => {
  assert.equal(isQuietTime(t("2026-10-27", "23:00"), BER, "22:30", "07:00"), true);
  assert.equal(isQuietTime(t("2026-10-27", "06:59"), BER, "22:30", "07:00"), true);
  assert.equal(isQuietTime(t("2026-10-27", "07:00"), BER, "22:30", "07:00"), false);
  // 19:00 in Berlin is 23:30 in Hyderabad -> quiet there.
  assert.equal(isQuietTime(t("2026-10-27", "19:00"), HYD, "22:30", "07:00"), true);
  assert.equal(isQuietTime(t("2026-10-27", "23:00"), BER, null, null), false);
});

test("the sweep skips trips that ended before yesterday (home time)", () => {
  // 00:30 on 12 Nov in Berlin is still 11 Nov in UTC: the cut-off follows home time.
  assert.equal(sweepFromDate(t("2026-11-12", "00:30"), BER), "2026-11-11");
  assert.equal(sweepFromDate(t("2026-11-12", "23:30"), BER), "2026-11-11");
});
