// Smart import orchestration: pick a parser, add trip context, transcribe
// voice, sanitize, and match receipt lines to the Buy list.
import { prisma } from "@/lib/db";
import { legName } from "@/lib/checks";
import { localDateKey, toLocalInput } from "@/lib/time";
import { travelerZone } from "@/lib/reminders";
import { sanitizeDraft } from "@/lib/import/sanitize";
import { matchPurchases, type PurchaseMatch } from "@/lib/import/match";
import type { ImportDraft } from "@/lib/import/draft";
import { OpenAIParser } from "./openai";
import { DEMOS, MockParser } from "./mock";
import { ImportError, type ImportContext, type ImportParser } from "./types";
import { getSettings } from "../settings";

export function importEngine(): "openai" | "mock" {
  return process.env.OPENAI_API_KEY && process.env.IMPORT_MODE !== "mock" ? "openai" : "mock";
}

function parser(): ImportParser {
  return importEngine() === "openai" ? new OpenAIParser() : new MockParser();
}

export type ImportResult = {
  draft: ImportDraft;
  matches: PurchaseMatch[];
  transcript: string | null;
  engine: "openai" | "mock" | "demo";
};

export type ImportRequest =
  | { kind: "text"; text: string }
  | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string }
  | { kind: "audio"; bytes: Buffer; mimeType: string; fileName: string }
  | { kind: "demo"; demo: "receipt" | "voice" };

/**
 * Read an input into a draft. `tripId` = add to that trip; `null` = the
 * traveler is creating a new trip from this input.
 */
export async function runImport(tripId: string | null, req: ImportRequest, focusList?: "BUY" | "PACK"): Promise<ImportResult> {
  const now = new Date();
  let ctx: ImportContext;
  let legKeys: string[] = [];
  let tasks: { id: string; name: string; quantity: number; status: string; list: string }[] = [];
  let newTrip: { homeTimeZone: string; homeCurrency: string } | undefined;

  if (tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { legs: { orderBy: { departureAt: "asc" } }, stays: true, tasks: true, people: true },
    });
    if (!trip) throw new ImportError("Trip not found", 404);
    ctx = {
      newTrip: false,
      focusList,
      today: localDateKey(now, travelerZone(trip, now)),
      tripName: trip.name, origin: trip.origin, destination: trip.destination,
      startDate: trip.startDate, endDate: trip.endDate, homeTimeZone: trip.homeTimeZone, homeCurrency: trip.homeCurrency,
      existingLegs: trip.legs.map((l) => `${legName(l)} ${l.fromName} -> ${l.toName}, ${toLocalInput(l.departureAt, l.fromTimeZone)}`),
      existingStays: trip.stays.map((s) => `${s.name}, ${toLocalInput(s.checkInAt, s.timeZone).slice(0, 10)}`),
      buyList: trip.tasks.filter((t) => t.list === "BUY" && t.status === "TO_BUY").map((t) => t.name),
      people: trip.people.map((p) => p.name),
    };
    legKeys = trip.legs.map((l) => `${(l.number ?? "").replace(/\s+/g, "").toUpperCase()}|${localDateKey(l.departureAt, l.fromTimeZone)}`);
    tasks = trip.tasks;
  } else {
    const settings = await getSettings();
    const today = localDateKey(now, settings.homeTimeZone);
    // A currency guess from the home zone; the review screen lets you change it.
    const homeCurrency = settings.homeTimeZone.startsWith("Europe/London") ? "GBP" : settings.homeTimeZone.startsWith("Europe/") ? "EUR"
      : settings.homeTimeZone === "Asia/Kolkata" ? "INR" : settings.homeTimeZone.startsWith("America/") ? "USD" : "EUR";
    newTrip = { homeTimeZone: settings.homeTimeZone, homeCurrency };
    ctx = {
      newTrip: true, today, tripName: "", origin: "", destination: "",
      // The simple reader resolves "27 Oct" against these: the next one after today.
      startDate: today, endDate: today,
      homeTimeZone: settings.homeTimeZone, homeCurrency, existingLegs: [], existingStays: [], buyList: [], people: [],
    };
  }

  let raw: ImportDraft;
  let transcript: string | null = null;
  let engine: ImportResult["engine"] = importEngine();
  const p = parser();

  if (req.kind === "demo") {
    engine = "demo";
    if (req.demo === "receipt") raw = DEMOS.receipt();
    else {
      transcript = tripId ? DEMOS.voice() : DEMOS.newTripVoice(Number(ctx.today.slice(0, 4)) + (ctx.today.slice(5) > "10-27" ? 1 : 0));
      raw = await new MockParser().parse({ kind: "text", text: transcript }, ctx);
    }
  } else if (req.kind === "audio") {
    if (!p.transcribe) throw new ImportError("Voice messages need OpenAI: add OPENAI_API_KEY to .env. Try the voice demo meanwhile.", 503);
    transcript = await p.transcribe(req.bytes, req.mimeType, req.fileName);
    raw = await p.parse({ kind: "text", text: transcript }, ctx);
  } else if (req.kind === "file") {
    raw = await p.parse({ kind: "file", bytes: req.bytes, mimeType: req.mimeType, fileName: req.fileName }, ctx);
  } else {
    raw = await p.parse({ kind: "text", text: req.text }, ctx);
  }

  const draft = sanitizeDraft(raw, { legKeys }, newTrip);
  const matches = matchPurchases(draft.purchases, tasks);
  return { draft, matches, transcript, engine };
}
