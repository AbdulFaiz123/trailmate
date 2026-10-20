// Baggage weight tracker. Pure functions.
//
// "Planned" = everything you intend to carry (bought or not, packed or not).
// "Packed"  = what is already in the bag.
// We warn on the planned total, so you find out *before* you buy the thing
// that pushes you over.
import type { TripWarning } from "./checks";

type TaskLike = { id: string; list: string; name: string; quantity: number; status: string; bag?: string | null; weightG?: number | null };
type TripLike = { checkedAllowanceG: number | null; cabinAllowanceG: number | null; checkedTareG: number; cabinTareG: number };

export type BagSummary = {
  bag: "CHECKED" | "CABIN";
  allowanceG: number | null;
  tareG: number;
  plannedG: number; // tare + all items assigned to this bag
  packedG: number; // tare + items already packed
  itemCount: number;
  missingWeight: number; // items in this bag with no weight entered
  heaviest: { name: string; grams: number }[];
};

/** Warn at this share of the allowance. */
export const NEAR_LIMIT = 0.9;

export function summarizeBag(trip: TripLike, tasks: TaskLike[], bag: "CHECKED" | "CABIN"): BagSummary {
  const inBag = tasks.filter((t) => t.list !== "DO" && t.bag === bag);
  const tareG = bag === "CHECKED" ? trip.checkedTareG : trip.cabinTareG;
  const lineWeight = (t: TaskLike) => (t.weightG ?? 0) * t.quantity;

  return {
    bag,
    allowanceG: bag === "CHECKED" ? trip.checkedAllowanceG : trip.cabinAllowanceG,
    tareG,
    plannedG: tareG + inBag.reduce((sum, t) => sum + lineWeight(t), 0),
    packedG: tareG + inBag.filter((t) => t.status === "PACKED").reduce((sum, t) => sum + lineWeight(t), 0),
    itemCount: inBag.length,
    missingWeight: inBag.filter((t) => t.weightG == null).length,
    heaviest: inBag
      .map((t) => ({ name: t.quantity > 1 ? `${t.quantity} × ${t.name}` : t.name, grams: lineWeight(t) }))
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 3),
  };
}

export function baggageWarnings(summaries: BagSummary[]): TripWarning[] {
  const warnings: TripWarning[] = [];
  for (const s of summaries) {
    if (!s.allowanceG) continue;
    const name = s.bag === "CHECKED" ? "Checked bag" : "Cabin bag";
    const kg = (g: number) => `${(g / 1000).toFixed(1)} kg`;
    const top = s.heaviest.filter((h) => h.grams > 0).map((h) => `${h.name} (${kg(h.grams)})`).join(", ");

    if (s.plannedG > s.allowanceG) {
      warnings.push({
        id: `bag-over-${s.bag}`,
        type: "BAG_OVER",
        severity: "CRITICAL",
        title: `${name} is ${kg(s.plannedG - s.allowanceG)} over the limit`,
        href: "lists",
        detail: `${kg(s.plannedG)} planned, ${kg(s.allowanceG)} allowed. Heaviest: ${top}. Move something to the other bag, leave it, or buy extra baggage before the airport.`,
      });
    } else if (s.plannedG >= s.allowanceG * NEAR_LIMIT) {
      warnings.push({
        id: `bag-near-${s.bag}`,
        type: "BAG_NEAR",
        severity: "WARNING",
        title: `${name} is close to the limit: ${kg(s.plannedG)} of ${kg(s.allowanceG)}`,
        href: "lists",
        detail: `Only ${kg(s.allowanceG - s.plannedG)} left. Home scales can be off by half a kilo.`,
      });
    }
  }
  return warnings;
}
