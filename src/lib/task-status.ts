// Shared by the server and the offline outbox in the browser.
import { guessCategory } from "./categorize";

/** Tap the circle: Buy goes to buy -> bought -> packed -> to buy; Pack goes todo <-> packed. */
export function nextTaskStatus(list: string, status: string): string {
  if (list === "BUY") return ({ TO_BUY: "BOUGHT", BOUGHT: "PACKED", PACKED: "TO_BUY" } as Record<string, string>)[status] ?? "TO_BUY";
  return status === "PACKED" ? "TODO" : "PACKED";
}

/** "3x Haribo" or "3 × Haribo" -> quantity 3. Category guessed from the name. */
export function parseQuickAdd(raw: string) {
  const name = raw.trim();
  const m = name.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i);
  const clean = m ? m[2].trim() : name;
  return { name: clean, quantity: m ? Number(m[1]) : 1, category: guessCategory(clean) };
}

/** Phone clocks drift: an offline tap this close to a later server change still counts. */
export const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Last write wins for offline status taps: skip the tap only if the status was
 * changed on the server after it (by more than the clock-skew allowance).
 * Edits to other fields (price, notes) don't count.
 */
export function isStaleStatusTap(statusChangedAt: Date, tappedAt: number, skewMs = CLOCK_SKEW_MS): boolean {
  return statusChangedAt.getTime() > tappedAt + skewMs;
}

/** The fields to write for a new status: `statusChangedAt` moves only if the status really changes. */
export function statusUpdate(current: string | null, next: string, now = new Date()) {
  return current === next ? { status: next } : { status: next, statusChangedAt: now };
}
