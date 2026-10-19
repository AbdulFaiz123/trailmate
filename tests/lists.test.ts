// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { baggageWarnings, summarizeBag } from "../src/lib/baggage";
import { customsReminders, suggestionsFor } from "../src/lib/rules";
import { guessCategory } from "../src/lib/categorize";

let n = 0;
function task(p: Partial<{ list: string; name: string; quantity: number; status: string; bag: string | null; weightG: number | null; priceMinor: number | null; currency: string | null; notes: string | null; suggestionId: string | null }>) {
  return {
    id: `t${++n}`, list: "PACK", name: "Thing", quantity: 1, status: "TODO", bag: "CHECKED",
    weightG: 1000, priceMinor: null, currency: null, notes: null, suggestionId: null, ...p,
  };
}
const trip = { checkedAllowanceG: 23_000, cabinAllowanceG: 8_000, checkedTareG: 4_000, cabinTareG: 2_000 };

test("bag weight = empty bag + weight × quantity", () => {
  const s = summarizeBag(trip, [task({ weightG: 100, quantity: 10 }), task({ weightG: 500, status: "PACKED" })], "CHECKED");
  assert.equal(s.plannedG, 4_000 + 1_000 + 500);
  assert.equal(s.packedG, 4_000 + 500);
});

test("items in the other bag or on the DO list don't count", () => {
  const s = summarizeBag(trip, [task({ bag: "CABIN" }), task({ list: "DO" }), task({ bag: "NONE" })], "CHECKED");
  assert.equal(s.plannedG, 4_000);
});

test("warns at 90% and when over", () => {
  const near = summarizeBag(trip, [task({ weightG: 17_000 })], "CHECKED"); // 21 kg of 23
  assert.equal(baggageWarnings([near])[0].type, "BAG_NEAR");
  const over = summarizeBag(trip, [task({ weightG: 19_500 })], "CHECKED"); // 23.5 kg
  const [w] = baggageWarnings([over]);
  assert.equal(w.type, "BAG_OVER");
  assert.match(w.title, /0\.5 kg over/);
});

test("no warning without an allowance", () => {
  const s = summarizeBag({ ...trip, checkedAllowanceG: null }, [task({ weightG: 50_000 })], "CHECKED");
  assert.equal(baggageWarnings([s]).length, 0);
});

test("India suggestions: already-covered items count as added", () => {
  const t = { destinationCountry: "IN", dismissedSuggestions: '["IN.ors"]' };
  const s = suggestionsFor(t, [task({ list: "BUY", name: "Universal power adapter" })]);
  assert.equal(s.find((x) => x.id === "IN.adapter")?.state, "added");
  assert.equal(s.find((x) => x.id === "IN.ors")?.state, "dismissed");
  assert.equal(s.find((x) => x.id === "IN.repellent")?.state, "open");
});

test("power bank in the checked bag is critical", () => {
  const r = customsReminders({ destinationCountry: "IN", originCountry: "DE", homeCurrency: "EUR" }, [
    task({ name: "Power bank 20000 mAh", bag: "CHECKED" }),
  ]);
  const lithium = r.find((x) => x.id === "AIR.lithium");
  assert.equal(lithium?.severity, "CRITICAL");
  assert.equal(r[0].id, "AIR.lithium", "critical sorts first");
});

test("India value allowance converts EUR to INR", () => {
  const r = customsReminders({ destinationCountry: "IN", originCountry: null, homeCurrency: "EUR" }, [
    task({ list: "BUY", name: "Laptop for cousin", priceMinor: 60_000, currency: "EUR" }), // €600 ≈ ₹60,000
  ]);
  const allowance = r.find((x) => x.id === "IN.allowance");
  assert.equal(allowance?.severity, "WARNING");
  assert.match(allowance!.finding!, /over the allowance/);
});

test("ghee on the way home to Germany is flagged", () => {
  const r = customsReminders({ destinationCountry: "IN", originCountry: "DE", homeCurrency: "EUR" }, [
    task({ list: "DO", name: "Bring Mom's ghee back" }),
  ]);
  assert.equal(r.find((x) => x.id === "DE.animal")?.severity, "CRITICAL");
});

test("category guessing", () => {
  assert.equal(guessCategory("Phone charger"), "ELECTRONICS");
  assert.equal(guessCategory("Ritter Sport chocolate"), "FOOD");
  assert.equal(guessCategory("Something odd"), "OTHER");
});

test("keywords match whole words only", () => {
  const trip = { destinationCountry: "IN", originCountry: null, homeCurrency: "EUR" };
  const r = customsReminders(trip, [task({ name: "Medicines in original packaging" })]);
  assert.equal(r.find((x) => x.id === "IN.alcohol"), undefined, '"gin" must not match "original"');
  const r2 = customsReminders(trip, [task({ name: "Gin", quantity: 2 }), task({ name: "Cigarettes", quantity: 200 })]);
  assert.ok(r2.find((x) => x.id === "IN.alcohol"));
  assert.equal(r2.find((x) => x.id === "IN.tobacco")?.severity, "WARNING", "plural matches, 200 > 100");
});

test("travel-size liquids in the cabin are fine", () => {
  const trip = { destinationCountry: "IN", originCountry: null, homeCurrency: "EUR" };
  const r = customsReminders(trip, [task({ name: "Hand sanitizer (travel size)", bag: "CABIN" })]);
  assert.equal(r.find((x) => x.id === "AIR.liquids"), undefined);
  const r2 = customsReminders(trip, [task({ name: "Perfume", bag: "CABIN" })]);
  assert.ok(r2.find((x) => x.id === "AIR.liquids"));
});
