// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNights, checkStayArrivals, findConnections, runTripChecks } from "../src/lib/checks";
import { localToUtc } from "../src/lib/time";

const BER = "Europe/Berlin";
const HYD = "Asia/Kolkata";

let n = 0;
function leg(p: {
  mode?: string; from?: string; to?: string; fromTz?: string; toTz?: string;
  dep: Date; arr: Date; delay?: number; status?: string; number?: string;
}) {
  return {
    id: `leg${++n}`, mode: p.mode ?? "TRAIN", number: p.number ?? null,
    fromName: p.from ?? "A", toName: p.to ?? "B",
    fromTimeZone: p.fromTz ?? BER, toTimeZone: p.toTz ?? BER,
    departureAt: p.dep, arrivalAt: p.arr,
    departureDelayMin: p.delay ?? 0, arrivalDelayMin: p.delay ?? 0,
    status: p.status ?? "SCHEDULED",
  };
}
function stay(p: { name?: string; tz?: string; inAt: Date; outAt: Date; latest?: Date }) {
  return { id: `stay${++n}`, name: p.name ?? "Hotel", timeZone: p.tz ?? BER,
    checkInAt: p.inAt, checkOutAt: p.outAt, latestCheckInAt: p.latest ?? null };
}
const t = (date: string, hhmm: string, tz = BER) => localToUtc(date, hhmm, tz);

// The demo trip's outbound day.
const ice = leg({ number: "ICE 597", to: "Frankfurt Hbf", dep: t("2026-10-27", "09:51"), arr: t("2026-10-27", "14:05") });
const sbahn = leg({ number: "S8", dep: t("2026-10-27", "14:16"), arr: t("2026-10-27", "14:28") });
const flight = leg({ mode: "FLIGHT", number: "LH 752", toTz: HYD, dep: t("2026-10-27", "17:30"), arr: t("2026-10-28", "07:20", HYD) });

test("11-minute train change is flagged as tight", () => {
  const [c] = findConnections([ice, sbahn], []);
  assert.equal(c.transferMin, 11);
  assert.equal(c.status, "TIGHT");
});

test("3 hours before an international flight is fine", () => {
  const [, c] = findConnections([ice, sbahn, flight], []);
  assert.equal(c.transferMin, 182);
  assert.equal(c.status, "OK");
});

test("a 40-minute ICE delay breaks the S-Bahn connection", () => {
  const late = { ...ice, arrivalDelayMin: 40 };
  const [c] = findConnections([late, sbahn], []);
  assert.equal(c.transferMin, -29);
  assert.equal(c.status, "BROKEN");
});

test("a Dependency buffer overrides the default", () => {
  const deps = [{ fromKind: "LEG", fromId: ice.id, toKind: "LEG", toId: sbahn.id, minBufferMin: 20 }];
  const [c] = findConnections([ice, sbahn], [], deps);
  assert.equal(c.status, "BROKEN");
});

test("cancelled leg breaks the connection", () => {
  const [c] = findConnections([ice, { ...sbahn, status: "CANCELLED" }], []);
  assert.equal(c.status, "BROKEN");
});

test("legs separated by a hotel night are not a connection", () => {
  const a = leg({ dep: t("2026-10-27", "08:00"), arr: t("2026-10-27", "10:00") });
  const b = leg({ dep: t("2026-10-27", "20:00"), arr: t("2026-10-27", "21:00") });
  const s = stay({ inAt: t("2026-10-27", "12:00"), outAt: t("2026-10-28", "10:00") });
  assert.equal(findConnections([a, b], [s]).length, 0);
});

test("overnight flight covers the night; missing hotel is a gap", () => {
  const hotel = stay({ tz: HYD, inAt: t("2026-10-28", "14:00", HYD), outAt: t("2026-10-29", "12:00", HYD) });
  const w = checkNights({
    startDate: "2026-10-27", endDate: "2026-10-30", homeTimeZone: BER,
    legs: [ice, sbahn, flight], stays: [hotel],
  });
  // 27th: on the plane. 28th: hotel. 29th: nothing -> gap.
  assert.equal(w.length, 1);
  assert.equal(w[0].type, "GAP");
  assert.match(w[0].title, /29 Oct/);
});

test("consecutive gap nights are merged", () => {
  const w = checkNights({ startDate: "2026-11-01", endDate: "2026-11-04", homeTimeZone: BER, legs: [], stays: [] });
  assert.equal(w.length, 1);
  assert.match(w[0].title, /3 nights/);
});

test("two stays on the same night is an overlap", () => {
  const a = stay({ name: "A", inAt: t("2026-11-01", "15:00"), outAt: t("2026-11-03", "11:00") });
  const b = stay({ name: "B", inAt: t("2026-11-02", "15:00"), outAt: t("2026-11-04", "11:00") });
  const w = checkNights({ startDate: "2026-11-01", endDate: "2026-11-04", homeTimeZone: BER, legs: [], stays: [a, b] });
  assert.deepEqual(w.map((x) => x.type), ["OVERLAP"]);
});

test("overlapping stays across several nights give one warning", () => {
  const a = stay({ name: "A", inAt: t("2026-11-01", "15:00"), outAt: t("2026-11-05", "11:00") });
  const b = stay({ name: "B", inAt: t("2026-11-02", "15:00"), outAt: t("2026-11-05", "11:00") });
  const w = checkNights({ startDate: "2026-11-01", endDate: "2026-11-05", homeTimeZone: BER, legs: [], stays: [a, b] });
  assert.equal(w.length, 1);
  assert.match(w[0].title, /3 nights/);
});

test("arriving after the latest check-in is critical", () => {
  const s = stay({ inAt: t("2026-11-01", "15:00"), latest: t("2026-11-01", "22:00"), outAt: t("2026-11-02", "11:00") });
  const l = leg({ dep: t("2026-11-01", "19:00"), arr: t("2026-11-01", "22:30") });
  const [w] = checkStayArrivals([s], [l]);
  assert.equal(w.type, "LATE_ARRIVAL");
  assert.equal(w.severity, "CRITICAL");
});

test("runTripChecks sorts critical first", () => {
  const late = { ...ice, arrivalDelayMin: 40 };
  const { warnings } = runTripChecks({
    startDate: "2026-10-27", endDate: "2026-10-28", homeTimeZone: BER, legs: [late, sbahn, flight], stays: [],
  });
  assert.equal(warnings[0].severity, "CRITICAL");
});

test("arrival at a stay ignores stopovers (Munich -> Dubai -> Goa)", () => {
  const DXB = "Asia/Dubai";
  const ek52 = leg({ mode: "FLIGHT", number: "EK 52", toTz: DXB, dep: t("2026-12-05", "15:15"), arr: t("2026-12-05", "23:30", DXB) });
  const ek532 = leg({ mode: "FLIGHT", number: "EK 532", fromTz: DXB, toTz: HYD, dep: t("2026-12-06", "03:15", DXB), arr: t("2026-12-06", "07:45", HYD) });
  const hut = stay({ name: "Sea Breeze Huts", tz: HYD, inAt: t("2026-12-06", "15:00", HYD), outAt: t("2026-12-18", "11:00", HYD) });
  const [w] = checkStayArrivals([hut], [ek52, ek532]);
  assert.equal(w.type, "EARLY_ARRIVAL");
  assert.match(w.detail, /You arrive 07:45 IST/, "the Goa landing, not the Dubai stopover");
});
