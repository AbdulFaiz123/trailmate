// Check and tidy whatever a parser returned before the traveler sees it.
// Parsers (especially AI ones) can return odd values; nothing here trusts them.
import { fromLocalInput, isValidTimeZone } from "../time";
import type { ImportDraft } from "./draft";
import { guessZone } from "./places";

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX = 20;

const clip = (s: unknown, n = 200) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const nclip = (s: unknown, n = 200) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);
const local = (s: unknown) => (typeof s === "string" && LOCAL.test(s.trim().slice(0, 16)) ? s.trim().slice(0, 16) : null);
const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null);
const ccy = (s: unknown) => (typeof s === "string" && /^[A-Za-z]{3}$/.test(s.trim()) ? s.trim().toUpperCase() : null);
const qty = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(999, Math.max(1, Math.round(n))) : 1);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);

function zone(raw: unknown, place: string): string | null {
  if (typeof raw === "string" && isValidTimeZone(raw.trim())) return raw.trim();
  return guessZone(place);
}

export function sanitizeDraft(raw: Partial<ImportDraft> | null | undefined, existing: { legKeys: string[] } = { legKeys: [] }): ImportDraft {
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
    const stay = {
      kind: pick(s?.kind, ["HOTEL", "AIRBNB", "FAMILY", "OTHER"] as const, "HOTEL"),
      name, address, timeZone: zone(s?.timeZone, `${name} ${address ?? ""}`),
      checkInLocal: local(s?.checkInLocal), checkOutLocal: local(s?.checkOutLocal), latestCheckInLocal: local(s?.latestCheckInLocal),
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
    person: nclip(i?.person, 60),
    price: money(i?.price), currency: ccy(i?.currency),
  }));

  const purchases = (Array.isArray(raw?.purchases) ? raw!.purchases : []).slice(0, 40).map((p) => ({
    name: clip(p?.name, 120) || "Item", quantity: qty(p?.quantity), totalPrice: money(p?.totalPrice), currency: ccy(p?.currency),
  }));

  return {
    kind: pick(raw?.kind, ["booking", "receipt", "notes", "unknown"] as const, "unknown"),
    summary: clip(raw?.summary, 300),
    legs, stays, items, purchases,
    shopName: nclip(raw?.shopName, 120),
    warnings: [...new Set(warnings)],
  };
}
