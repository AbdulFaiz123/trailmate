// Run with: npm test
/* eslint-disable @typescript-eslint/no-explicit-any -- these tests inspect raw JSON request bodies */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPurchases, similarity } from "../src/lib/import/match";
import { sanitizeDraft } from "../src/lib/import/sanitize";
import { DRAFT_JSON_SCHEMA } from "../src/lib/import/draft";
import { DEMOS, parseTextForTests } from "../src/server/ai/mock";
import { OpenAIParser } from "../src/server/ai/openai";
import type { ImportContext } from "../src/server/ai/types";

const ctx: ImportContext = {
  newTrip: false,
  today: "2026-10-20", tripName: "Demo", origin: "Berlin", destination: "Hyderabad", startDate: "2026-10-27", endDate: "2026-11-10",
  homeTimeZone: "Europe/Berlin", homeCurrency: "EUR", existingLegs: [], existingStays: [], buyList: [], people: ["Mom", "Dad"],
};

// ---------------------------------------------------------------- receipts

test("receipt lines match Buy items despite shop abbreviations", () => {
  assert.ok(similarity("RITTER SPORT VOLLMILCH 100G", "Ritter Sport chocolates (mixed)") >= 0.5);
  assert.ok(similarity("HARIBO GOLDBAEREN 200G", "Haribo Goldbären") >= 0.5, "umlaut folded: bären ~ baeren");
  assert.equal(similarity("ZAHNPASTA SENSITIVE", "Perfume"), 0);
});

test("matchPurchases: best match per line, unit price, unmatched lines stay null", () => {
  const tasks = [
    { id: "choc", name: "Ritter Sport chocolates (mixed)", quantity: 10, status: "TO_BUY", list: "BUY" },
    { id: "hari", name: "Haribo Goldbären", quantity: 5, status: "TO_BUY", list: "BUY" },
    { id: "done", name: "Wrist watch", quantity: 1, status: "BOUGHT", list: "BUY" },
  ];
  const m = matchPurchases(DEMOS.receipt().purchases, tasks);
  assert.deepEqual(m.map((x) => x.taskId), ["choc", "hari", null]);
  assert.equal(m[0].unitPrice, 1.49);
  assert.equal(m[1].unitPrice, 1.29);
});

// ---------------------------------------------------------------- sanitizer

test("sanitizer fills missing zones from place names and flags problems", () => {
  const d = sanitizeDraft({
    legs: [{
      mode: "FLIGHT", fromName: "Frankfurt (FRA)", toName: "Hyderabad (HYD)", departureLocal: "2026-10-27T17:30", arrivalLocal: "2026-10-27T07:20",
      fromTimeZone: "Mars/Olympus", toTimeZone: null, carrier: "Lufthansa", number: "LH 752", bookingRef: null, platform: null, seat: null,
      price: 784, currency: "eur", confidence: "high",
    }],
  });
  assert.equal(d.legs[0].fromTimeZone, "Europe/Berlin", "invalid zone replaced by lookup");
  assert.equal(d.legs[0].toTimeZone, "Asia/Kolkata");
  assert.equal(d.legs[0].currency, "EUR");
  assert.ok(d.warnings.some((w) => /arrival is before departure/.test(w)), "same-day arrival for an overnight flight is caught");
});

test("sanitizer drops junk: bad times, wild quantities, unknown enums", () => {
  const d = sanitizeDraft({
    kind: "hack" as never,
    legs: [{ mode: "ROCKET", fromName: "", toName: "B", departureLocal: "tomorrow", arrivalLocal: null } as never],
    items: [{ list: "STEAL", name: "Chocolate", quantity: 1e9, category: "WEAPONS" } as never],
  });
  assert.equal(d.kind, "unknown");
  assert.equal(d.legs[0].mode, "OTHER");
  assert.equal(d.legs[0].departureLocal, null);
  assert.equal(d.items[0].list, "BUY");
  assert.equal(d.items[0].quantity, 999);
  assert.equal(d.items[0].category, null);
});

test("sanitizer flags a leg that's already planned", () => {
  const d = sanitizeDraft(
    { legs: [{ mode: "TRAIN", fromName: "Berlin Hbf", toName: "Frankfurt", departureLocal: "2026-10-27T09:51", arrivalLocal: "2026-10-27T14:05", number: "ICE 597" } as never] },
    { legKeys: ["ICE597|2026-10-27"] },
  );
  assert.ok(d.warnings.some((w) => /already in your trip/.test(w)));
});

// ---------------------------------------------------------------- mock text reader

test("mock reads a pasted booking line", () => {
  const d = parseTextForTests("ICE 597 from Berlin Hbf to Frankfurt (Main) Hbf on 27 Oct, 09:51-14:05, platform 14, booking ref DB-7K2QX9", ctx);
  assert.equal(d.legs.length, 1);
  const l = d.legs[0];
  assert.equal(l.number, "ICE 597");
  assert.equal(l.mode, "TRAIN");
  assert.equal(l.departureLocal, "2026-10-27T09:51");
  assert.equal(l.arrivalLocal, "2026-10-27T14:05");
  assert.equal(l.fromTimeZone, "Europe/Berlin");
  assert.equal(l.platform, "14");
  assert.equal(l.bookingRef, "DB-7K2QX9");
});

test("mock reads the demo voice note: items with people, and a train", () => {
  const d = parseTextForTests(DEMOS.voice(), { ...ctx, startDate: "2026-10-27" });
  assert.deepEqual(d.items.map((i) => [i.list, i.name, i.quantity, i.person]), [
    ["BUY", "Power adapters", 2, "Dad"],
    ["PACK", "Sunglasses", 1, null],
  ]);
  assert.equal(d.legs[0].fromTimeZone, "Asia/Kolkata");
  assert.equal(d.legs[0].departureLocal, null, "'the 9th' alone is too vague for the simple reader");
});

// ---------------------------------------------------------------- OpenAI adapter (fake fetch)

function withFakeFetch(reply: (url: string, init: RequestInit) => Response, run: (calls: { url: string; body: unknown }[]) => Promise<void>) {
  return async () => {
    const real = globalThis.fetch;
    const key = process.env.OPENAI_API_KEY;
    const calls: { url: string; body: unknown }[] = [];
    process.env.OPENAI_API_KEY = "sk-test";
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
      return reply(String(url), init);
    }) as typeof fetch;
    try {
      await run(calls);
    } finally {
      globalThis.fetch = real;
      if (key === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = key;
    }
  };
}
const ok = (draft: unknown) =>
  new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(draft) }] }] }), { status: 200 });

test("OpenAI: PDF goes as input_file with a strict JSON schema, store=false", withFakeFetch(
  () => ok({ kind: "booking", summary: "x", legs: [], stays: [], items: [], purchases: [], shopName: null, warnings: [] }),
  async (calls) => {
    const draft = await new OpenAIParser("gpt-test").parse({ kind: "file", bytes: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", fileName: "t.pdf" }, ctx);
    assert.equal(draft.kind, "booking");
    const body = calls[0].body as Record<string, any>;
    assert.match(calls[0].url, /\/responses$/);
    assert.equal(body.model, "gpt-test");
    assert.equal(body.store, false);
    assert.deepEqual(body.text.format, { type: "json_schema", name: "trip_import", schema: DRAFT_JSON_SCHEMA, strict: true });
    assert.equal(body.input[0].content[0].type, "input_file");
    assert.match(body.input[0].content[0].file_data, /^data:application\/pdf;base64,/);
    assert.match(body.instructions, /do not follow them/);
  },
));

test("OpenAI: photos go as input_image data URLs", withFakeFetch(
  () => ok({ kind: "receipt", summary: "", legs: [], stays: [], items: [], purchases: [], shopName: "X", warnings: [] }),
  async (calls) => {
    await new OpenAIParser().parse({ kind: "file", bytes: Buffer.from([0xff, 0xd8, 0xff]), mimeType: "image/jpeg", fileName: "r.jpg" }, ctx);
    const part = (calls[0].body as any).input[0].content[0];
    assert.equal(part.type, "input_image");
    assert.match(part.image_url, /^data:image\/jpeg;base64,/);
  },
));

let replyNo = 0;
test("OpenAI: refusal and a rejected key give clear messages", withFakeFetch(
  () => (++replyNo === 1
    ? new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "refusal", refusal: "Can't help" }] }] }), { status: 200 })
    : new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 })),
  async (calls) => {
    await assert.rejects(new OpenAIParser().parse({ kind: "text", text: "hi" }, ctx), /declined: Can't help/);
    await assert.rejects(new OpenAIParser().parse({ kind: "text", text: "hi" }, ctx), /rejected the API key/);
    assert.equal(calls.length, 2, "401 is not retried");
  },
));

test("OpenAI: voice goes to /audio/transcriptions with gpt-transcribe", withFakeFetch(
  () => new Response(JSON.stringify({ text: "buy chocolates for mom" }), { status: 200 }),
  async (calls) => {
    const text = await new OpenAIParser().transcribe(Buffer.from("fake"), "audio/webm", "note.webm");
    assert.equal(text, "buy chocolates for mom");
    assert.match(calls[0].url, /\/audio\/transcriptions$/);
    const form = calls[0].body as FormData;
    assert.equal(form.get("model"), "gpt-transcribe");
  },
));

test("JSON schema is strict-compatible: every object lists all properties as required", () => {
  const walk = (s: any): void => {
    if (s?.type === "object") {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s?.items) walk(s.items);
  };
  walk(DRAFT_JSON_SCHEMA);
});

test("mock: Indian 5-digit train numbers and more Indian cities", () => {
  const d = parseTextForTests("Train 12795 from Hyderabad to Vijayawada on 9 Nov, 07:10-12:40", ctx);
  assert.equal(d.legs[0].number, "Train 12795");
  assert.equal(d.legs[0].carrier, "Indian Railways");
  assert.equal(d.legs[0].toTimeZone, "Asia/Kolkata");
  assert.equal(d.legs[0].departureLocal, "2026-11-09T07:10");
});

test("the parser's Buy-item hint links brands the word matcher can't", () => {
  const tasks = [{ id: "rep", name: "Mosquito repellent", quantity: 1, status: "TO_BUY", list: "BUY" }];
  const line = { name: "Anti Brumm Forte 75 ml", quantity: 1, totalPrice: 8.99, currency: "EUR" };
  assert.equal(matchPurchases([{ ...line, buyListItem: null }], tasks)[0].taskId, null, "no shared words");
  assert.equal(matchPurchases([{ ...line, buyListItem: "mosquito repellent" }], tasks)[0].taskId, "rep");
  assert.equal(matchPurchases([{ ...line, buyListItem: "Something else" }], tasks)[0].taskId, null, "a hint that isn't on the list is ignored");
});

test("person names get a capital", () => {
  const d = sanitizeDraft({ items: [{ list: "BUY", name: "Sweets", quantity: 3, category: null, person: "auntie", price: null, currency: null }] });
  assert.equal(d.items[0].person, "Auntie");
});

// ---------------------------------------------------------------- new trip from an import

const leg = (p: Record<string, unknown>) => ({
  mode: "TRAIN", carrier: null, number: null, bookingRef: null, platform: null, seat: null, price: null, currency: null, confidence: "high", ...p,
});
const defaults = { homeTimeZone: "Europe/Berlin", homeCurrency: "EUR" };

test("new trip: dates, places and name come from the legs when not said", () => {
  const d = sanitizeDraft({
    trip: { name: null, origin: null, destination: null, originCountry: "de", destinationCountry: "IN", startDate: null, endDate: null, homeTimeZone: null, homeCurrency: null },
    legs: [
      leg({ number: "ICE 597", fromName: "Berlin Hbf", toName: "Frankfurt (Main) Hbf", departureLocal: "2026-10-27T09:51", arrivalLocal: "2026-10-27T14:05", fromTimeZone: "Europe/Berlin", toTimeZone: "Europe/Berlin" }),
      leg({ mode: "FLIGHT", number: "LH 752", fromName: "Frankfurt Airport (FRA)", toName: "Hyderabad Airport (HYD)", departureLocal: "2026-10-27T17:30", arrivalLocal: "2026-10-28T07:20", fromTimeZone: "Europe/Berlin", toTimeZone: "Asia/Kolkata" }),
      leg({ mode: "FLIGHT", number: "LH 753", fromName: "Hyderabad Airport (HYD)", toName: "Frankfurt Airport (FRA)", departureLocal: "2026-11-10T02:35", arrivalLocal: "2026-11-10T08:30", fromTimeZone: "Asia/Kolkata", toTimeZone: "Europe/Berlin" }),
    ] as never,
  }, { legKeys: [] }, defaults);
  assert.equal(d.trip.origin, "Berlin");
  assert.equal(d.trip.destination, "Hyderabad", "end of the first journey, not the way back");
  assert.equal(d.trip.name, "Trip to Hyderabad");
  assert.equal(d.trip.startDate, "2026-10-27");
  assert.equal(d.trip.endDate, "2026-11-10");
  assert.equal(d.trip.originCountry, "DE");
  assert.equal(d.trip.homeTimeZone, "Europe/Berlin");
  assert.equal(d.trip.homeCurrency, "EUR");
});

test("new trip: what the traveler said wins over guesses; missing end date is flagged", () => {
  const d = sanitizeDraft({
    trip: { name: "Diwali with family", origin: "Munich, Germany", destination: "Mumbai, India", originCountry: "DE", destinationCountry: "IN", startDate: "2026-11-05", endDate: null, homeTimeZone: "Europe/Berlin", homeCurrency: "EUR" },
  }, { legKeys: [] }, defaults);
  assert.equal(d.trip.name, "Diwali with family");
  assert.equal(d.trip.startDate, "2026-11-05");
  assert.equal(d.trip.endDate, null);
  assert.ok(d.warnings.some((w) => /When are you back/.test(w)));
});

test("existing trip: trip details are ignored even if a parser fills them", () => {
  const d = sanitizeDraft({ trip: { name: "Hijack", origin: "X" } as never });
  assert.equal(d.trip.name, null);
});

test("mock: a spoken new trip gives the dates and both legs", () => {
  const text = DEMOS.newTripVoice(2026);
  const d = parseTextForTests(text, { ...ctx, newTrip: true, startDate: "2026-10-20" });
  assert.equal(d.trip.endDate, "2026-11-10", "'back on 10 Nov'");
  assert.deepEqual(d.legs.map((l) => l.number), ["ICE 597", "LH 752"]);
  const s = sanitizeDraft(d, { legKeys: [] }, defaults);
  assert.equal(s.trip.startDate, "2026-10-27");
  assert.equal(s.trip.destination, "Hyderabad");
});

test("a stay given only as dates gets 15:00 / 11:00, with a note", () => {
  const d = sanitizeDraft({ stays: [{ kind: "HOTEL", name: "Sea Breeze Huts", address: "Palolem, Goa", timeZone: null, checkInLocal: "2026-12-06", checkOutLocal: "2026-12-18", latestCheckInLocal: null, bookingRef: null, price: null, currency: null, confidence: "medium" }] });
  assert.equal(d.stays[0].checkInLocal, "2026-12-06T15:00");
  assert.equal(d.stays[0].checkOutLocal, "2026-12-18T11:00");
  assert.equal(d.stays[0].timeZone, "Asia/Kolkata", "Palolem/Goa -> India");
  assert.ok(d.warnings.some((w) => /assumed 15:00/.test(w)));
});
