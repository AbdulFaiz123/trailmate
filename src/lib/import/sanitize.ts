// Check and tidy whatever a parser returned before the traveler sees it.
// Parsers (especially AI ones) can return odd values; nothing here trusts them.
import { fromLocalInput, isValidTimeZone } from "../time";
import { EMPTY_TRIP, type DraftTrip, type ImportDraft } from "./draft";
import { guessZone } from "./places";

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX = 20;

const clip = (s: unknown, n = 200) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const nclip = (s: unknown, n = 200) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);
const local = (s: unknown) => (typeof s === "string" && LOCAL.test(s.trim().slice(0, 16)) ? s.trim().slice(0, 16) : null);
const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null);
const ccy = (s: unknown) => (typeof s === "string" && /^[A-Za-z]{3}$/.test(s.trim()) ? s.trim().toUpperCase() : null);
const qty = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(999, Math.max(1, Math.round(n))) : 1);
/** "auntie" -> "Auntie", "mom" -> "Mom" (keeps "McKenzie" as written). */
const titleCase = (s: string | null) => (s && s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);

function zone(raw: unknown, place: string): string | null {
  if (typeof raw === "string" && isValidTimeZone(raw.trim())) return raw.trim();
  return guessZone(place);
}

export type NewTripDefaults = { homeTimeZone: string; homeCurrency: string };

export function sanitizeDraft(
  raw: Partial<ImportDraft> | null | undefined,
  existing: { legKeys: string[] } = { legKeys: [] },
  newTrip?: NewTripDefaults,
): ImportDraft {
  const warnings = (Array.isArray(raw?.warnings) ? raw!.warnings : []).map((w) => clip(w, 300)).filter(Boolean).slice(0, MAX);

  const legs = (Array.isArray(raw?.legs) ? raw!.legs : []).slice(0, MAX).map((l) => {
    const fromName = clip(l?.fromName) || "?";
    const toName = clip(l?.toName) || "?";
    const leg = {
      mode: pick(l?.mode, ["TRAIN", "FLIGHT", "BUS", "TAXI", "WALK", "FERRY", "OTHER"] as const, "OTHER"),
      fromName, toName,
      departureLocal: local(l?.departureLocal), arrivalLocal: local(l?.arrivalLocal),
      fromTimeZone: zone(l?.fromTimeZone, fromName), toTimeZone: zone(l?.toTimeZone, toName),
      carrier: nclip(l?.carrier, 80), number: nclip(l?.number, 30), bookingRef: nclip(l?.bookingRef, 40),
      platform: nclip(l?.platform, 20), seat: nclip(l?.seat, 40),
      price: money(l?.price), currency: ccy(l?.currency),
      confidence: pick(l?.confidence, ["high", "medium", "low"] as const, "low"),
    };
    const label = leg.number ?? `${fromName} → ${toName}`;
    if (!leg.fromTimeZone || !leg.toTimeZone) warnings.push(`${label}: check the time zones.`);
    if (!leg.departureLocal || !leg.arrivalLocal) warnings.push(`${label}: departure or arrival time is missing.`);
    if (leg.departureLocal && leg.arrivalLocal && leg.fromTimeZone && leg.toTimeZone &&
        fromLocalInput(leg.arrivalLocal, leg.toTimeZone) <= fromLocalInput(leg.departureLocal, leg.fromTimeZone)) {
      warnings.push(`${label}: arrival is before departure — check the dates.`);
    }
    if (leg.number && leg.departureLocal && existing.legKeys.includes(`${leg.number.replace(/\s+/g, "").toUpperCase()}|${leg.departureLocal.slice(0, 10)}`)) {
      warnings.push(`${label} on ${leg.departureLocal.slice(0, 10)} is already in your trip.`);
    }
    return leg;
  });

  const stays = (Array.isArray(raw?.stays) ? raw!.stays : []).slice(0, MAX).map((s) => {
    const name = clip(s?.name) || "Stay";
    const address = nclip(s?.address);
    // A stay given only as dates ("from the 6th to the 18th") gets the usual
    // 15:00 check-in / 11:00 check-out, with a note that we assumed them.
    const dateOnly = (v: unknown, hhmm: string) => {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
      warnings.push(`${name}: no ${hhmm === "15:00" ? "check-in" : "check-out"} time given — assumed ${hhmm}.`);
      return `${v.trim()}T${hhmm}`;
    };
    const stay = {
      kind: pick(s?.kind, ["HOTEL", "AIRBNB", "FAMILY", "OTHER"] as const, "HOTEL"),
      name, address, timeZone: zone(s?.timeZone, `${name} ${address ?? ""}`),
      checkInLocal: local(s?.checkInLocal) ?? dateOnly(s?.checkInLocal, "15:00"),
      checkOutLocal: local(s?.checkOutLocal) ?? dateOnly(s?.checkOutLocal, "11:00"),
      latestCheckInLocal: local(s?.latestCheckInLocal),
      bookingRef: nclip(s?.bookingRef, 40), price: money(s?.price), currency: ccy(s?.currency),
      confidence: pick(s?.confidence, ["high", "medium", "low"] as const, "low"),
    };
    if (!stay.timeZone) warnings.push(`${name}: check the time zone.`);
    if (!stay.checkInLocal || !stay.checkOutLocal) warnings.push(`${name}: check-in or check-out date is missing.`);
    return stay;
  });

  const items = (Array.isArray(raw?.items) ? raw!.items : []).slice(0, MAX).map((i) => ({
    list: pick(i?.list, ["BUY", "PACK"] as const, "BUY"),
    name: clip(i?.name, 120) || "Item",
    quantity: qty(i?.quantity),
    category: i?.category && ["GIFTS", "ELECTRONICS", "CLOTHES", "DOCUMENTS", "TOILETRIES", "MEDICINE", "FOOD", "OTHER"].includes(i.category) ? i.category : null,
    person: titleCase(nclip(i?.person, 60)),
    price: money(i?.price), currency: ccy(i?.currency),
  }));

  const purchases = (Array.isArray(raw?.purchases) ? raw!.purchases : []).slice(0, 40).map((p) => ({
    name: clip(p?.name, 120) || "Item", quantity: qty(p?.quantity), totalPrice: money(p?.totalPrice), currency: ccy(p?.currency),
    buyListItem: nclip(p?.buyListItem, 120),
  }));

  const trip = newTrip ? sanitizeTrip(raw?.trip, legs, stays, newTrip, warnings) : EMPTY_TRIP;

  return {
    kind: pick(raw?.kind, ["booking", "receipt", "notes", "unknown"] as const, "unknown"),
    summary: clip(raw?.summary, 300),
    trip, legs, stays, items, purchases,
    shopName: nclip(raw?.shopName, 120),
    warnings: [...new Set(warnings)],
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (s: unknown) => (typeof s === "string" && DATE.test(s.trim()) ? s.trim() : null);
const country = (s: unknown) => (typeof s === "string" && /^[A-Za-z]{2}$/.test(s.trim()) ? s.trim().toUpperCase() : null);

/** City part of "Hyderabad Airport (HYD)" or "Hyderabad, India". */
function city(place: string): string {
  return place.split(/[,(]/)[0].replace(/\b(airport|hbf|hauptbahnhof|station|central|intl\.?|international)\b/gi, "").trim() || place;
}

/**
 * Trip details for a new trip, filling gaps from the legs and stays:
 * dates from the first departure / last arrival, places from the first
 * journey (Berlin -> Frankfurt -> Hyderabad means destination Hyderabad).
 */
function sanitizeTrip(raw: Partial<DraftTrip> | undefined, legs: ImportDraft["legs"], stays: ImportDraft["stays"], d: NewTripDefaults, warnings: string[]): DraftTrip {
  const sorted = legs.filter((l) => l.departureLocal).sort((a, b) => a.departureLocal!.localeCompare(b.departureLocal!));
  const days = [
    ...sorted.flatMap((l) => [l.departureLocal!.slice(0, 10), l.arrivalLocal?.slice(0, 10) ?? ""]),
    ...stays.flatMap((s) => [s.checkInLocal?.slice(0, 10) ?? "", s.checkOutLocal?.slice(0, 10) ?? ""]),
  ].filter(Boolean).sort();

  // The first journey: legs that follow each other within 12 hours. Each time
  // is converted with its own zone, so 07:20 in Hyderabad compares correctly
  // with 17:30 in Frankfurt.
  const utc = (local: string, tz: string | null) => fromLocalInput(local, tz ?? "UTC").getTime();
  let chainEnd = sorted[0];
  for (let i = 1; i < sorted.length && sorted[i - 1].arrivalLocal; i++) {
    const prev = sorted[i - 1];
    const gapH = (utc(sorted[i].departureLocal!, sorted[i].fromTimeZone) - utc(prev.arrivalLocal!, prev.toTimeZone)) / 3_600_000;
    if (gapH < 0 || gapH > 12) break;
    chainEnd = sorted[i];
  }

  const origin = nclip(raw?.origin, 120) ?? (sorted[0] ? city(sorted[0].fromName) : null);
  const destination = nclip(raw?.destination, 120) ?? (chainEnd ? city(chainEnd.toName) : stays[0] ? city(stays[0].address ?? stays[0].name) : null);
  const startDate = date(raw?.startDate) ?? days[0] ?? null;
  let endDate = date(raw?.endDate) ?? (days.length > 1 ? days[days.length - 1] : null);
  if (startDate && endDate && endDate < startDate) endDate = null;
  if (!startDate) warnings.push("When does the trip start? Add the start date.");
  if (startDate && !endDate) warnings.push("When are you back? Add the end date.");

  const homeTz = typeof raw?.homeTimeZone === "string" && isValidTimeZone(raw.homeTimeZone) ? raw.homeTimeZone
    : sorted[0]?.fromTimeZone ?? d.homeTimeZone;

  return {
    name: nclip(raw?.name, 80) ?? (destination ? `Trip to ${city(destination)}` : null),
    origin, destination,
    originCountry: country(raw?.originCountry),
    destinationCountry: country(raw?.destinationCountry),
    startDate, endDate,
    homeTimeZone: homeTz,
    homeCurrency: ccy(raw?.homeCurrency) ?? d.homeCurrency,
  };
}
