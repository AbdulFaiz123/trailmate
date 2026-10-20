// The "draft" every smart import produces, whatever the input (voice, photo,
// PDF, receipt, pasted text). Nothing is saved until the traveler reviews it.
//
// Times are LOCAL wall-clock strings ("2026-10-27T09:51") plus the place's
// IANA zone — exactly what's printed on a ticket. The server converts to UTC
// on save, the same way the forms do.

export type Confidence = "high" | "medium" | "low";

export type DraftLeg = {
  mode: "TRAIN" | "FLIGHT" | "BUS" | "TAXI" | "WALK" | "FERRY" | "OTHER";
  fromName: string;
  toName: string;
  departureLocal: string | null;
  arrivalLocal: string | null;
  fromTimeZone: string | null;
  toTimeZone: string | null;
  carrier: string | null;
  number: string | null;
  bookingRef: string | null;
  platform: string | null;
  seat: string | null;
  price: number | null; // major units, e.g. 59.90
  currency: string | null;
  confidence: Confidence;
};

export type DraftStay = {
  kind: "HOTEL" | "AIRBNB" | "FAMILY" | "OTHER";
  name: string;
  address: string | null;
  timeZone: string | null;
  checkInLocal: string | null;
  checkOutLocal: string | null;
  latestCheckInLocal: string | null;
  bookingRef: string | null;
  price: number | null;
  currency: string | null;
  confidence: Confidence;
};

export type DraftItem = {
  list: "BUY" | "PACK";
  name: string;
  quantity: number;
  category: "GIFTS" | "ELECTRONICS" | "CLOTHES" | "DOCUMENTS" | "TOILETRIES" | "MEDICINE" | "FOOD" | "OTHER" | null;
  person: string | null;
  price: number | null;
  currency: string | null;
};

/** One line from a shop receipt. */
export type DraftPurchase = { name: string; quantity: number; totalPrice: number | null; currency: string | null };

export type ImportDraft = {
  kind: "booking" | "receipt" | "notes" | "unknown";
  summary: string;
  legs: DraftLeg[];
  stays: DraftStay[];
  items: DraftItem[];
  purchases: DraftPurchase[];
  shopName: string | null;
  warnings: string[];
};

export const EMPTY_DRAFT: ImportDraft = {
  kind: "unknown", summary: "", legs: [], stays: [], items: [], purchases: [], shopName: null, warnings: [],
};

// ------------------------------------------------------------------ JSON schema
// Strict Structured Outputs: every property listed in `required`, no extra
// properties, "optional" expressed as nullable.

const str = { type: "string" } as const;
const nstr = { type: ["string", "null"] } as const;
const nnum = { type: ["number", "null"] } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, properties, required: Object.keys(properties),
});
const localTime = { type: ["string", "null"], description: "Local wall-clock time at that place, format YYYY-MM-DDTHH:MM. Null if unknown." };
const tz = { type: ["string", "null"], description: "IANA time zone of that place, e.g. Europe/Berlin, Asia/Kolkata. Null if you can't tell." };
const confidence = { type: "string", enum: ["high", "medium", "low"] };

export const DRAFT_JSON_SCHEMA = obj({
  kind: { type: "string", enum: ["booking", "receipt", "notes", "unknown"] },
  summary: { ...str, description: "One short sentence: what this input is." },
  legs: {
    type: "array",
    items: obj({
      mode: { type: "string", enum: ["TRAIN", "FLIGHT", "BUS", "TAXI", "WALK", "FERRY", "OTHER"] },
      fromName: str, toName: str,
      departureLocal: localTime, arrivalLocal: localTime,
      fromTimeZone: tz, toTimeZone: tz,
      carrier: nstr, number: { ...nstr, description: "Train/flight number with prefix, e.g. ICE 597, LH 752" },
      bookingRef: nstr, platform: { ...nstr, description: "Platform or gate" }, seat: nstr,
      price: nnum, currency: { ...nstr, description: "ISO 4217, e.g. EUR, INR" },
      confidence,
    }),
  },
  stays: {
    type: "array",
    items: obj({
      kind: { type: "string", enum: ["HOTEL", "AIRBNB", "FAMILY", "OTHER"] },
      name: str, address: nstr, timeZone: tz,
      checkInLocal: localTime, checkOutLocal: localTime, latestCheckInLocal: localTime,
      bookingRef: nstr, price: nnum, currency: nstr, confidence,
    }),
  },
  items: {
    type: "array",
    description: "Things to buy or pack the traveler mentions (voice notes, lists). Not receipt lines.",
    items: obj({
      list: { type: "string", enum: ["BUY", "PACK"] },
      name: str, quantity: { type: "integer" },
      category: { type: ["string", "null"], enum: ["GIFTS", "ELECTRONICS", "CLOTHES", "DOCUMENTS", "TOILETRIES", "MEDICINE", "FOOD", "OTHER", null] },
      person: { ...nstr, description: "Who it's for, e.g. Mom" },
      price: nnum, currency: nstr,
    }),
  },
  purchases: {
    type: "array",
    description: "Lines from a shop receipt: what was bought.",
    items: obj({ name: str, quantity: { type: "integer" }, totalPrice: nnum, currency: nstr }),
  },
  shopName: nstr,
  warnings: { type: "array", items: str, description: "Anything unclear the traveler should double-check." },
});
