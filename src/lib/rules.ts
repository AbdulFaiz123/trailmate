// Country rules: suggestions and customs/airline reminders, driven by
// src/data/country-rules.json. Pure functions, like checks.ts.
import rulesFile from "@/data/country-rules.json";
import type { Severity } from "./checks";

export type Suggestion = {
  id: string;
  list: "BUY" | "PACK" | "DO";
  name: string;
  category: string;
  weightG?: number;
  priceMinor?: number;
  currency?: string;
  bag?: "CHECKED" | "CABIN";
  keywords?: string[];
  notes?: string;
};

export type CustomsRule = {
  id: string;
  kind: "entry" | "return" | "airline";
  type: "info" | "match" | "quantity" | "value" | "bag";
  severity?: Severity;
  title: string;
  detail: string;
  keywords?: string[];
  lists?: string[];
  maxQuantity?: number;
  maxValue?: { amountMinor: number; currency: string };
  forbiddenBag?: "CHECKED" | "CABIN";
  exceptKeywords?: string[]; // e.g. "travel size" for the liquids rule
  sourceLabel?: string;
};

type CountryRules = {
  name?: string;
  currency?: string;
  plugs?: string[];
  voltage?: string;
  officialUrl?: string;
  officialLabel?: string;
  suggestions?: Suggestion[];
  customs?: CustomsRule[];
};

const file = rulesFile as unknown as Record<string, CountryRules> & {
  approxRates: Record<string, Record<string, number>>;
};

export function countryRules(code: string | null | undefined): CountryRules | null {
  if (!code) return null;
  const rules = file[code.toUpperCase()];
  return rules && typeof rules === "object" && "suggestions" in rules ? rules : null;
}

/** Rough conversion for comparing totals against limits. Returns null if unknown. */
export function approxConvert(amountMinor: number, from: string, to: string): number | null {
  if (from === to) return amountMinor;
  const rate = file.approxRates[from]?.[to];
  return rate == null ? null : Math.round(amountMinor * rate);
}

type TaskLike = {
  id: string;
  list: string;
  name: string;
  notes?: string | null;
  quantity: number;
  status: string;
  bag?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  suggestionId?: string | null;
};

/**
 * Whole-word keyword match on name + notes, allowing a plural ending.
 * Plain `includes` would be wrong: "gin" is inside "original", "ors" inside "doors".
 */
function matches(task: TaskLike, keywords: string[] | undefined): boolean {
  if (!keywords?.length) return false;
  const text = `${task.name} ${task.notes ?? ""}`.toLowerCase();
  return keywords.some((k) => keywordRegex(k).test(text));
}

const regexCache = new Map<string, RegExp>();
function keywordRegex(keyword: string): RegExp {
  let re = regexCache.get(keyword);
  if (!re) {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:s|es)?(?![\\p{L}\\p{N}])`, "u");
    regexCache.set(keyword, re);
  }
  return re;
}

// ------------------------------------------------------------------ Suggestions

export type SuggestionState = Suggestion & { state: "open" | "added" | "dismissed" };

export function suggestionsFor(
  trip: { destinationCountry: string | null; dismissedSuggestions: string },
  tasks: TaskLike[],
): SuggestionState[] {
  const dismissed = new Set<string>(safeJsonArray(trip.dismissedSuggestions));
  const all = [...(file["*"].suggestions ?? []), ...(countryRules(trip.destinationCountry)?.suggestions ?? [])];
  return all.map((s) => {
    // "Already added" if a task came from this suggestion, or the traveler
    // already wrote something similar themselves ("power adapter" ~ "adapter").
    const added = tasks.some((t) => t.suggestionId === s.id || matches(t, s.keywords));
    return { ...s, state: added ? "added" : dismissed.has(s.id) ? "dismissed" : "open" };
  });
}

export function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function findSuggestion(id: string): Suggestion | undefined {
  for (const [key, rules] of Object.entries(file)) {
    if (key === "approxRates" || key === "_readme") continue;
    const found = (rules as CountryRules).suggestions?.find((s) => s.id === id);
    if (found) return found;
  }
  return undefined;
}

// ------------------------------------------------------------------ Customs

export type CustomsReminder = {
  id: string;
  kind: CustomsRule["kind"];
  severity: Severity;
  title: string;
  detail: string;
  /** What we found on your lists, e.g. "Your gifts: ≈ ₹38,400 of ₹50,000". */
  finding?: string;
  items: string[];
  sourceUrl?: string;
  sourceLabel?: string;
};

export function customsReminders(
  trip: { destinationCountry: string | null; originCountry: string | null; homeCurrency: string },
  tasks: TaskLike[],
): CustomsReminder[] {
  const dest = countryRules(trip.destinationCountry);
  const origin = countryRules(trip.originCountry);
  // Items you carry: everything on Buy and Pack lists.
  const carried = tasks.filter((t) => t.list !== "DO");

  const sources: { rules: CustomsRule[]; country: CountryRules | null; kinds: CustomsRule["kind"][] }[] = [
    { rules: file["*"].customs ?? [], country: null, kinds: ["airline"] },
    { rules: dest?.customs ?? [], country: dest, kinds: ["entry"] },
    // Return rules of your home country also matter for things you bring back.
    // Those items are rarely on your lists yet, so DO tasks are checked too.
    { rules: origin?.customs ?? [], country: origin, kinds: ["return"] },
  ];

  const result: CustomsReminder[] = [];
  for (const { rules, country, kinds } of sources) {
    for (const rule of rules) {
      if (!kinds.includes(rule.kind)) continue;
      const base = {
        id: rule.id,
        kind: rule.kind,
        title: rule.title,
        detail: rule.detail,
        sourceUrl: country?.officialUrl,
        sourceLabel: rule.sourceLabel ?? country?.officialLabel,
      };
      const pool = rule.kind === "return" ? tasks : carried;

      switch (rule.type) {
        case "info":
          result.push({ ...base, severity: "INFO", items: [] });
          break;

        case "match": {
          const hits = pool.filter((t) => matches(t, rule.keywords));
          if (hits.length) {
            result.push({
              ...base, severity: rule.severity ?? "WARNING", items: hits.map(label),
              finding: `On your lists: ${hits.map(label).join(", ")}`,
            });
          }
          break;
        }

        case "quantity": {
          const hits = pool.filter((t) => matches(t, rule.keywords));
          const total = hits.reduce((sum, t) => sum + t.quantity, 0);
          if (hits.length && rule.maxQuantity != null) {
            const over = total > rule.maxQuantity;
            result.push({
              ...base, severity: over ? "WARNING" : "INFO", items: hits.map(label),
              finding: `You have ${total} of about ${rule.maxQuantity}${over ? " — over the limit" : ""}`,
            });
          }
          break;
        }

        case "value": {
          if (!rule.maxValue) break;
          const hits = pool.filter((t) => !rule.lists || rule.lists.includes(t.list));
          let totalMinor = 0;
          let unpriced = 0;
          for (const t of hits) {
            if (t.priceMinor == null || !t.currency) { unpriced++; continue; }
            const converted = approxConvert(t.priceMinor * t.quantity, t.currency, rule.maxValue.currency);
            if (converted == null) unpriced++;
            else totalMinor += converted;
          }
          const limit = rule.maxValue.amountMinor;
          const ratio = totalMinor / limit;
          const fmt = (m: number) => formatCurrency(m, rule.maxValue!.currency);
          const homeTotal = approxConvert(totalMinor, rule.maxValue.currency, trip.homeCurrency);
          result.push({
            ...base,
            severity: ratio > 1 ? "WARNING" : "INFO",
            items: [],
            finding:
              `Your shopping list: ≈ ${fmt(totalMinor)}${homeTotal != null && trip.homeCurrency !== rule.maxValue.currency ? ` (${formatCurrency(homeTotal, trip.homeCurrency)})` : ""} of ${fmt(limit)}` +
              (ratio > 1 ? " — over the allowance" : ratio > 0.8 ? " — getting close" : "") +
              (unpriced ? `. ${unpriced} item${unpriced === 1 ? " has" : "s have"} no price yet.` : ""),
          });
          break;
        }

        case "bag": {
          const hits = pool.filter(
            (t) => matches(t, rule.keywords) && !matches(t, rule.exceptKeywords) && t.bag === rule.forbiddenBag,
          );
          if (hits.length) {
            result.push({
              ...base,
              severity: rule.forbiddenBag === "CHECKED" ? "CRITICAL" : "WARNING",
              items: hits.map(label),
              finding: `In your ${rule.forbiddenBag === "CHECKED" ? "checked" : "cabin"} bag: ${hits.map(label).join(", ")}`,
            });
          }
          break;
        }
      }
    }
  }

  const order: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return result.sort((a, b) => order[a.severity] - order[b.severity]);
}

function label(t: TaskLike): string {
  return t.quantity > 1 ? `${t.quantity} × ${t.name}` : t.name;
}

function formatCurrency(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}
