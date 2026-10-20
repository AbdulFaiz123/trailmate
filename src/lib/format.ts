export function formatMoney(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (minor == null || !currency) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 })
    .format(minor / 100);
}

export function formatWeight(grams: number | null | undefined): string | null {
  if (grams == null) return null;
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`;
}

export const MODE_ICON: Record<string, string> = {
  TRAIN: "🚆", FLIGHT: "✈️", BUS: "🚌", TAXI: "🚕", WALK: "🚶", FERRY: "⛴️", OTHER: "➡️",
};

export const STAY_ICON: Record<string, string> = {
  HOTEL: "🏨", AIRBNB: "🏠", FAMILY: "🏡", OTHER: "🛏️",
};

/** "TAXI" -> "Taxi" */
export function modeLabel(mode: string): string {
  return mode.charAt(0) + mode.slice(1).toLowerCase();
}
