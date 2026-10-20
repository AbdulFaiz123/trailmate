// Time zone helpers.
//
// Golden rule: the database stores UTC. We only convert to a local zone at
// the moment we display something, using the zone of *that item's place*.
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Short, familiar names. Intl only gives "GMT+5:30" for India in most
// locales, so we keep our own table and fall back to the UTC offset.
const ABBREVIATIONS: Record<string, { std: string; dst?: string }> = {
  "Europe/Berlin": { std: "CET", dst: "CEST" },
  "Europe/Paris": { std: "CET", dst: "CEST" },
  "Europe/Amsterdam": { std: "CET", dst: "CEST" },
  "Europe/Vienna": { std: "CET", dst: "CEST" },
  "Europe/Zurich": { std: "CET", dst: "CEST" },
  "Europe/London": { std: "GMT", dst: "BST" },
  "Asia/Kolkata": { std: "IST" },
  "Asia/Dubai": { std: "GST" },
  "Asia/Qatar": { std: "AST" },
  "America/New_York": { std: "EST", dst: "EDT" },
  UTC: { std: "UTC" },
};

/** UTC offset of `tz` at instant `date`, e.g. "UTC+1", "UTC+5:30". */
export function utcOffsetLabel(date: Date, tz: string): string {
  const raw = formatInTimeZone(date, tz, "xxx"); // "+05:30"
  const sign = raw[0];
  const [h, m] = raw.slice(1).split(":");
  const hours = String(Number(h));
  return m === "00" ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${m}`;
}

/** Is daylight saving time active in `tz` at `date`? */
function isDst(date: Date, tz: string): boolean {
  const year = Number(formatInTimeZone(date, tz, "yyyy"));
  const jan = formatInTimeZone(new Date(Date.UTC(year, 0, 1)), tz, "xxx");
  const jul = formatInTimeZone(new Date(Date.UTC(year, 6, 1)), tz, "xxx");
  if (jan === jul) return false;
  const now = formatInTimeZone(date, tz, "xxx");
  // The larger offset is the summer (DST) one in both hemispheres' zones we list.
  return now === (jan > jul ? jan : jul);
}

/** Short zone label for display, e.g. "CET", "CEST", "IST" or "UTC+4". */
export function tzAbbrev(date: Date, tz: string): string {
  const entry = ABBREVIATIONS[tz];
  if (!entry) return utcOffsetLabel(date, tz);
  return isDst(date, tz) && entry.dst ? entry.dst : entry.std;
}

/** "09:51" in the given zone. */
export function formatTime(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "HH:mm");
}

/** "Thu 12 Nov" in the given zone. */
export function formatDay(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EEE d MMM");
}

/** "2026-11-12" — the calendar date of `date` in the given zone. */
export function localDateKey(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

/**
 * Build a UTC instant from a wall-clock time in a zone.
 * localToUtc("2026-11-12", "09:51", "Europe/Berlin") -> 2026-11-12T08:51:00Z
 */
export function localToUtc(dateKey: string, hhmm: string, tz: string): Date {
  return fromZonedTime(`${dateKey}T${hhmm}:00`, tz);
}

/** Days between two "yyyy-MM-dd" keys (b - a). */
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "2h 05m", "45 min", "3 days". */
export function formatDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h ${String(rest).padStart(2, "0")}m` : `${h}h`;
  }
  return `${Math.round(m / 1440)} days`;
}

/** "in 3 days", "in 2h 05m", "45 min ago". */
export function relativeFromNow(date: Date, now = new Date()): string {
  const diffMin = (date.getTime() - now.getTime()) / 60_000;
  const text = formatDuration(diffMin);
  return diffMin >= 0 ? `in ${text}` : `${text} ago`;
}

/** Common zones for the "create trip" form. */
export const COMMON_TIME_ZONES = [
  "Europe/Berlin", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Dubai",
  "Asia/Qatar", "America/New_York", "UTC",
];

/** Value for <input type="datetime-local">: "2026-10-27T09:51" in the given zone. */
export function toLocalInput(date: Date | null | undefined, tz: string): string {
  return date ? formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Parse a datetime-local value as wall-clock time in `tz` and return the UTC instant. */
export function fromLocalInput(value: string, tz: string): Date {
  return fromZonedTime(value, tz);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** All zones for pickers: our common ones first, then everything Intl knows. */
export function allTimeZones(): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([...COMMON_TIME_ZONES, ...all])];
}
