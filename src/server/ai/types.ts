import type { ImportDraft } from "@/lib/import/draft";

/** What the parser knows about the trip, to resolve "on the 27th" or "for Mom". */
export type ImportContext = {
  /** true = the traveler is creating a trip from this input (no trip yet). */
  newTrip: boolean;
  /** The list the traveler is adding to right now (voice button on the Pack/Buy list). */
  focusList?: "BUY" | "PACK";
  today: string; // YYYY-MM-DD in the traveler's current zone
  tripName: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  homeTimeZone: string;
  homeCurrency: string;
  existingLegs: string[]; // "ICE 597 Berlin Hbf -> Frankfurt (Main) Hbf, 2026-10-27"
  existingStays: string[];
  buyList: string[];
  people: string[];
};

export type ImportInput =
  | { kind: "text"; text: string }
  | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string };

export interface ImportParser {
  readonly name: string;
  parse(input: ImportInput, ctx: ImportContext): Promise<ImportDraft>;
  transcribe?(audio: Buffer, mimeType: string, fileName: string): Promise<string>;
}

export class ImportError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}
