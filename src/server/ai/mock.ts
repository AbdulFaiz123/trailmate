// Mock import parser: works with no API key. It understands simple pasted
// text ("ICE 597 from Berlin to Frankfurt on 27 Oct 09:51-14:05", "buy 2
// adapters for Dad") with regular expressions, and offers fixed demo inputs
// for photos/receipts. Real photos, PDFs and voice need OpenAI.
import type { DraftItem, DraftLeg, ImportDraft } from "@/lib/import/draft";
import { EMPTY_DRAFT } from "@/lib/import/draft";
import { guessZone } from "@/lib/import/places";
import { guessCategory } from "@/lib/categorize";
import { isDemo } from "@/lib/demo";
import { ImportError, type ImportContext, type ImportInput, type ImportParser } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NUMBER = /\b(ICE|IC|EC|RE|RB|IRE|S|U|LH|AI|EK|QR|6E|UK|TK|BA|AF|KL|LX|OS)\s?(\d{1,4})\b/;

function findDate(s: string, ctx: ImportContext): string | null {
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const [sy, sm] = ctx.startDate.split("-").map(Number);
  const build = (day: number, month: number) => {
    const year = month < sm - 6 ? sy + 1 : sy; // "3 Jan" on a December trip -> next year
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const dm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (dm) return build(Number(dm[1]), MONTHS.indexOf(dm[2].toLowerCase().slice(0, 3)) + 1);
  const md = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (md) return build(Number(md[2]), MONTHS.indexOf(md[1].toLowerCase().slice(0, 3)) + 1);
  const dotted = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
  if (dotted) return dotted[3] ? `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}` : build(Number(dotted[1]), Number(dotted[2]));
  return null;
}

function parseText(text: string, ctx: ImportContext): ImportDraft {
  const legs: DraftLeg[] = [];
  const items: DraftItem[] = [];
  const warnings: string[] = [];

  for (const sentence of text.split(/[\n;]+|(?<=[a-z0-9)])\.\s+/i).map((s) => s.trim()).filter(Boolean)) {
    // Items: "buy 2 adapters for Dad", "pack the passport"
    const item = sentence.match(/^(?:i\s+(?:need|have)\s+to\s+|need\s+to\s+|remember\s+to\s+|don'?t\s+forget\s+to\s+)?(buy|get|pack|bring)\s+(?:(\d{1,3})\s*x?\s+)?(.+?)(?:\s+for\s+(?:my\s+)?([A-Za-z]+))?\s*$/i);
    if (item && !NUMBER.test(sentence)) {
      const name = item[3].replace(/^(?:a|an|the|some|my)\s+/i, "").trim();
      const list = /pack|bring/i.test(item[1]) ? "PACK" : "BUY";
      items.push({
        list, name: name.charAt(0).toUpperCase() + name.slice(1), quantity: item[2] ? Number(item[2]) : 1,
        category: guessCategory(name) as DraftItem["category"],
        person: item[4] ? item[4].charAt(0).toUpperCase() + item[4].slice(1).toLowerCase() : null, price: null, currency: null,
      });
      continue;
    }
    // Legs: a train/flight number, "from X to Y", a date and one or two times
    const coded = sentence.match(NUMBER); // "ICE 597", "LH 752"
    // Indian Railways trains are plain 5-digit numbers: "Train 12795".
    const indian = coded ? null : sentence.match(/\btrain\s+(?:no\.?\s*)?(\d{5})\b/i);
    const number = coded ? `${coded[1].toUpperCase()} ${coded[2]}` : indian ? `Train ${indian[1]}` : null;
    const route = sentence.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:on|at|departing|leaving|arriving|,)\b|[,.]|$)/i);
    if (!number && !route) continue;
    const date = findDate(sentence, ctx);
    const times = [...sentence.matchAll(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/g)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
    const isFlight = coded ? /^(LH|AI|EK|QR|6E|UK|TK|BA|AF|KL|LX|OS)$/i.test(coded[1]) : /\bfl(y|ight)\b/i.test(sentence);
    const fromName = route?.[1].trim() ?? "?";
    const toName = route?.[2].trim() ?? "?";
    legs.push({
      mode: isFlight ? "FLIGHT" : number || /\btrain\b/i.test(sentence) ? "TRAIN" : /\bbus\b/i.test(sentence) ? "BUS" : "OTHER",
      fromName, toName,
      departureLocal: date && times[0] ? `${date}T${times[0]}` : null,
      arrivalLocal: date && times[1] ? `${date}T${times[1]}` : null,
      fromTimeZone: guessZone(fromName), toTimeZone: guessZone(toName),
      carrier: indian ? "Indian Railways" : null,
      number,
      bookingRef: sentence.match(/\b(?:ref(?:erence)?|booking|pnr)[:\s#]+([A-Z0-9-]{5,})/i)?.[1] ?? null,
      platform: sentence.match(/\b(?:platform|gleis|gate)\s+([A-Z]?\d{1,3}[A-Z]?)\b/i)?.[1] ?? null,
      seat: sentence.match(/\bseat\s+([0-9]{1,3}[A-K]?)\b/i)?.[1] ?? null,
      price: null, currency: null, confidence: "medium",
    });
    if (times.length === 1) warnings.push(`${number ?? "A leg"}: only one time found — add the arrival.`);
  }

  // "...from Berlin to Hyderabad from 27 Oct to 10 Nov" / "back on 10 Nov" -> trip dates for a new trip
  const range = text.match(/\bfrom\s+(\d{1,2}(?:st|nd|rd|th)?\.?\s+[a-z]{3,9}|[a-z]{3,9}\s+\d{1,2})\s+(?:to|until|till)\s+(\d{1,2}(?:st|nd|rd|th)?\.?\s+[a-z]{3,9}|[a-z]{3,9}\s+\d{1,2})/i);
  const back = text.match(/\b(?:back|return(?:ing)?|coming back)\s+(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\.?\s+[a-z]{3,9}|[a-z]{3,9}\s+\d{1,2})/i);
  const trip = {
    ...EMPTY_DRAFT.trip,
    startDate: range ? findDate(range[1], ctx) : null,
    endDate: range ? findDate(range[2], ctx) : back ? findDate(back[1], ctx) : null,
  };

  return {
    ...EMPTY_DRAFT,
    trip,
    kind: legs.length ? "booking" : items.length ? "notes" : "unknown",
    summary: legs.length || items.length
      ? `Found ${legs.length} leg${legs.length === 1 ? "" : "s"} and ${items.length} item${items.length === 1 ? "" : "s"} (simple text reader — add an OpenAI key for better results).`
      : "Nothing recognised. The simple text reader understands lines like “ICE 597 from Berlin to Frankfurt on 27 Oct 09:51–14:05” or “buy 2 adapters for Dad”.",
    legs, items, warnings,
  };
}

/** Fixed demo inputs so the review screen can be tried without a key. */
export const DEMOS = {
  receipt: (): ImportDraft => ({
    ...EMPTY_DRAFT,
    kind: "receipt",
    summary: "Demo receipt from a supermarket (sample data).",
    shopName: "Supermarket, Berlin-Kreuzberg (demo)",
    purchases: [
      { name: "RITTER SPORT VOLLMILCH 100G", quantity: 10, totalPrice: 14.9, currency: "EUR", buyListItem: null },
      { name: "HARIBO GOLDBAEREN 200G", quantity: 5, totalPrice: 6.45, currency: "EUR", buyListItem: null },
      { name: "ZAHNPASTA SENSITIVE 75ML", quantity: 1, totalPrice: 1.95, currency: "EUR", buyListItem: null },
    ],
  }),
  voice: (): string => "I need to buy 2 power adapters for Dad. Pack my sunglasses. On the 9th I take the train from Hyderabad to Vijayawada at 07:10, arriving 12:40.",
  /** A spoken description of a whole new trip. */
  newTripVoice: (year: number): string =>
    `I'm visiting my family in Hyderabad. I leave Berlin on 27 Oct ${year} and I'm back on 10 Nov. ` +
    `ICE 597 from Berlin Hbf to Frankfurt (Main) Hbf on 27 Oct ${year}, 09:51-14:05. ` +
    `LH 752 from Frankfurt Airport to Hyderabad Airport on 27 Oct ${year} at 17:30. ` +
    `Buy chocolates for Mom.`,
};

export class MockParser implements ImportParser {
  readonly name = "mock";

  async parse(input: ImportInput, ctx: ImportContext): Promise<ImportDraft> {
    if (input.kind === "text") return parseText(input.text, ctx);
    throw new ImportError(
      isDemo()
        ? "This public demo doesn’t read real files (to keep it free). Try the sample receipt or paste some text."
        : "Reading photos and PDFs needs OpenAI: add OPENAI_API_KEY to .env. You can still paste text or try the demo receipt.",
      503,
    );
  }
}

export { parseText as parseTextForTests };
