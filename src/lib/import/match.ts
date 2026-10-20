// Match receipt lines to the Buy list: "RITTER SPORT VOLLM. 100G x10" should
// tick off "Ritter Sport chocolates (mixed)". Pure functions.
import type { DraftPurchase } from "./draft";

type BuyTask = { id: string; name: string; quantity: number; status: string; list: string };

export type PurchaseMatch = {
  purchaseIndex: number;
  taskId: string | null; // null = not on the list
  taskName: string | null;
  score: number; // 0..1
  unitPrice: number | null; // major units
};

const STOP = new Set(["the", "and", "for", "with", "mixed", "pack", "set", "x", "g", "kg", "ml", "l", "st", "stk", "stück", "pcs"]);

/** Lower-case words of 3+ letters, umlauts folded, units and numbers dropped. */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** How much of the shorter name's words appear in the other (prefix matches count: "choc" ~ "chocolates"). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hits = small.filter((w) => big.some((v) => v === w || (w.length >= 4 && (v.startsWith(w) || w.startsWith(v))))).length;
  return hits / small.length;
}

export const MATCH_THRESHOLD = 0.5;

/** Best Buy-list item for each receipt line; each task is used at most once. */
export function matchPurchases(purchases: DraftPurchase[], tasks: BuyTask[]): PurchaseMatch[] {
  const open = tasks.filter((t) => t.list === "BUY" && t.status === "TO_BUY");
  const candidates = purchases.flatMap((p, i) => open.map((t) => ({ i, t, score: similarity(p.name, t.name) })));
  candidates.sort((x, y) => y.score - x.score);

  const usedTask = new Set<string>();
  const byPurchase = new Map<number, { t: BuyTask; score: number }>();
  for (const c of candidates) {
    if (c.score < MATCH_THRESHOLD || usedTask.has(c.t.id) || byPurchase.has(c.i)) continue;
    usedTask.add(c.t.id);
    byPurchase.set(c.i, { t: c.t, score: c.score });
  }

  return purchases.map((p, i) => {
    const m = byPurchase.get(i);
    return {
      purchaseIndex: i,
      taskId: m?.t.id ?? null,
      taskName: m?.t.name ?? null,
      score: m?.score ?? 0,
      unitPrice: p.totalPrice != null && p.quantity > 0 ? Math.round((p.totalPrice / p.quantity) * 100) / 100 : null,
    };
  });
}
