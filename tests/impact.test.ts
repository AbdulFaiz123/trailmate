// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Dependency, Leg, Stay } from "@prisma/client";
import { assessImpact, estimateAlternative, impactMessage, isDisrupted } from "../src/lib/impact";
import { DbRestProvider } from "../src/server/transport/db-rest";
import { localToUtc } from "../src/lib/time";

const BER = "Europe/Berlin";
const HYD = "Asia/Kolkata";
const t = (d: string, hhmm: string, tz = BER) => localToUtc(d, hhmm, tz);

const base = {
  fromLat: null, fromLng: null, toLat: null, toLng: null, carrier: null, bookingRef: null, seat: null, costMinor: null,
  currency: null, notes: null, status: "SCHEDULED", departureDelayMin: 0, arrivalDelayMin: 0, livePlatform: null,
  lastCheckedAt: null, simulated: false, statusSource: null, statusNote: null, createdAt: new Date(), updatedAt: new Date(),
  tripId: "trip", fromStopId: null, toStopId: null, platform: null,
};
const leg = (p: Partial<Leg> & Pick<Leg, "id" | "mode" | "departureAt" | "arrivalAt">) =>
  ({ ...base, fromName: "A", toName: "B", fromTimeZone: BER, toTimeZone: BER, number: null, ...p }) as Leg;
const dep = (fromId: string, toId: string, minBufferMin: number) =>
  ({ id: `${fromId}-${toId}`, tripId: "trip", fromKind: "LEG", fromId, toKind: "LEG", toId, minBufferMin }) as Dependency;

const ice = leg({ id: "ice", mode: "TRAIN", number: "ICE 597", fromName: "Berlin Hbf", toName: "Frankfurt (Main) Hbf", platform: "14",
  fromStopId: "8011160", toStopId: "8000105", departureAt: t("2026-10-27", "09:51"), arrivalAt: t("2026-10-27", "14:05") });
const s8 = leg({ id: "s8", mode: "TRAIN", number: "S8", toName: "Frankfurt Flughafen", departureAt: t("2026-10-27", "14:16"), arrivalAt: t("2026-10-27", "14:28") });
const lh = leg({ id: "lh", mode: "FLIGHT", number: "LH 752", carrier: "Lufthansa", toTimeZone: HYD, departureAt: t("2026-10-27", "17:30"), arrivalAt: t("2026-10-28", "07:20", HYD) });
const hotel = { id: "hotel", name: "Novotel", timeZone: HYD, checkInAt: t("2026-10-28", "14:00", HYD), latestCheckInAt: t("2026-10-28", "23:59", HYD), checkOutAt: t("2026-10-29", "12:00", HYD) } as Stay;
const deps = [dep("ice", "s8", 4), dep("s8", "lh", 90)];
const trip = (legs: Leg[]) => ({ legs, stays: [hotel], dependencies: deps });

test("on time is not a disruption", () => {
  assert.equal(isDisrupted(ice), false);
  assert.equal(assessImpact(trip([ice, s8, lh]), "ice"), null);
});

test("ICE +40: misses the S8, flight still reachable via the 15:01 S8", () => {
  const late = { ...ice, departureDelayMin: 40, arrivalDelayMin: 40 };
  const impact = assessImpact(trip([late, s8, lh]), "ice")!;
  assert.equal(impact.missedLegId, "s8");
  assert.match(impact.headline, /ICE 597 is \+40 min/);
  assert.match(impact.headline, /arrives 14:45 CET/);
  assert.match(impact.lines[0], /miss the 14:16 CET S8/);
  assert.match(impact.lines[1], /LH 752 is still reachable via S8 at 15:01/);
  assert.match(impact.lines[1], /2h 17m before/);
  assert.equal(impact.action, "Take S8 at 15:01");
  assert.equal(impact.severity, "WARNING", "missed a train but the flight is safe");
  assert.equal(impact.alternative?.source, "estimate");
});

test("ICE +3h: even the next S-Bahn is too late for the flight", () => {
  const veryLate = { ...ice, departureDelayMin: 180, arrivalDelayMin: 180 };
  const impact = assessImpact(trip([veryLate, s8, lh]), "ice")!;
  assert.equal(impact.severity, "CRITICAL");
  assert.match(impactMessage(impact), /too late for LH 752/);
  assert.match(impact.action!, /Call Lufthansa/);
});

test("ICE +6: connection gets tight but holds", () => {
  const bitLate = { ...ice, departureDelayMin: 6, arrivalDelayMin: 6 };
  const impact = assessImpact(trip([bitLate, s8, lh]), "ice")!;
  assert.equal(impact.severity, "WARNING");
  assert.match(impact.lines[0], /only 5 min/);
  assert.equal(impact.missedLegId, undefined);
});

test("ICE +8: 3 min is below the 4 min this change needs -> missed", () => {
  const late = { ...ice, departureDelayMin: 8, arrivalDelayMin: 8 };
  assert.equal(assessImpact(trip([late, s8, lh]), "ice")!.missedLegId, "s8");
});

test("a live alternative is used instead of the estimate", () => {
  const late = { ...ice, departureDelayMin: 40, arrivalDelayMin: 40 };
  const live = { departureAt: t("2026-10-27", "14:52"), arrivalAt: t("2026-10-27", "15:04"), label: "S9 at 14:52", source: "live" as const };
  const impact = assessImpact(trip([late, s8, lh]), "ice", live)!;
  assert.match(impact.lines[1], /via S9 at 14:52: arrives 15:04/);
  assert.doesNotMatch(impact.lines[1], /estimated/);
});

test("cancelled flight: no 'next one', rebook", () => {
  const cancelled = { ...lh, status: "CANCELLED" };
  const impact = assessImpact(trip([ice, s8, cancelled]), "lh")!;
  assert.equal(impact.severity, "CRITICAL");
  assert.match(impact.action!, /rebook LH 752/);
});

test("flight +17h makes you miss the latest hotel check-in", () => {
  const taxi = leg({ id: "taxi", mode: "TAXI", fromTimeZone: HYD, toTimeZone: HYD, toName: "Novotel", departureAt: t("2026-10-28", "08:30", HYD), arrivalAt: t("2026-10-28", "08:45", HYD) });
  const tripWithTaxi = { legs: [ice, s8, { ...lh, departureDelayMin: 17 * 60, arrivalDelayMin: 17 * 60 }, taxi], stays: [hotel],
    dependencies: [...deps, dep("lh", "taxi", 45), { ...dep("taxi", "hotel", 0), toKind: "STAY" } as Dependency] };
  const impact = assessImpact(tripWithTaxi, "lh")!;
  assert.equal(impact.severity, "CRITICAL");
});

test("platform change alone", () => {
  const moved = { ...ice, livePlatform: "12" };
  const impact = assessImpact(trip([moved, s8, lh]), "ice")!;
  assert.match(impact.headline, /platform 12 \(was 14\)/);
  assert.equal(impact.action, "Go to platform 12");
});

test("estimates: S-Bahn every 15 min, taxis right away, flights never", () => {
  assert.equal(estimateAlternative(s8, t("2026-10-27", "14:49"))!.label, "S8 at 15:01");
  const taxi = leg({ id: "x", mode: "TAXI", departureAt: t("2026-10-27", "09:10"), arrivalAt: t("2026-10-27", "09:30") });
  assert.equal(estimateAlternative(taxi, t("2026-10-27", "09:40"))!.departureAt.getTime(), t("2026-10-27", "09:40").getTime());
  assert.equal(estimateAlternative(lh, t("2026-10-27", "18:00")), null);
});

// ---------------------------------------------------------------- DB adapter

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    const body = routes[key];
    if (body === 503) return new Response("down", { status: 503 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const departure = (p: Record<string, unknown>) => ({
  tripId: "1|123|0", when: null, plannedWhen: "2026-10-27T08:51:00+00:00", delay: null, platform: "14", plannedPlatform: "14", line: { name: "ICE 597", fahrtNr: "597" }, ...p,
});

test("DB adapter: finds the train and reads delay + platform", async () => {
  const db = new DbRestProvider("https://db.test", fakeFetch({
    "/stops/8011160/departures": { departures: [departure({ line: { name: "ICE 1001", fahrtNr: "1001" }, tripId: "x" }), departure({ delay: 1200, platform: "12" })] },
    "/stops/8000105/arrivals": { arrivals: [departure({ tripId: "1|123|0", delay: 1500, plannedWhen: "2026-10-27T13:05:00+00:00" })] },
  }));
  const r = await db.getStatus(ice);
  assert.deepEqual(r, { ok: true, found: true, source: "db-rest", departureDelayMin: 20, arrivalDelayMin: 25, cancelled: false, platform: "12" });
});

test("DB adapter: train not in the data", async () => {
  const db = new DbRestProvider("https://db.test", fakeFetch({ "/departures": { departures: [] } }));
  const r = await db.getStatus(ice);
  assert.equal(r.ok && !r.found, true);
});

test("DB adapter: API down -> clear fallback and a 10-minute back-off", async () => {
  const calls: string[] = [];
  let now = Date.parse("2026-10-27T08:00:00Z");
  const db = new DbRestProvider("https://db.test", fakeFetch({ "/departures": 503 }, calls), () => now);
  const r = await db.getStatus(ice);
  assert.equal(r.ok, false);
  assert.match((r as { note: string }).note, /unavailable/);
  assert.equal(calls.length, 2, "one retry");
  await db.getStatus(ice);
  assert.equal(calls.length, 2, "no calls during back-off");
  now += 11 * 60_000;
  await db.getStatus(ice);
  assert.equal(calls.length, 4, "tries again after back-off");
});
