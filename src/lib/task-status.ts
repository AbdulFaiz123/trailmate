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
