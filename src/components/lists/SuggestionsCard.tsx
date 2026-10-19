import type { SuggestionState } from "@/lib/rules";
import { addAllSuggestions, addSuggestion, dismissSuggestion } from "@/app/trips/task-actions";

export function SuggestionsCard({ tripId, list, suggestions, countryName }: {
  tripId: string; list: "BUY" | "PACK"; suggestions: SuggestionState[]; countryName?: string;
}) {
  const open = suggestions.filter((s) => s.state === "open" && s.list === list);
  if (open.length === 0) return null;
  return (
    <section aria-label="Suggestions" className="rounded-2xl border border-accent/40 bg-accent-soft p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-accent">
          💡 Suggested{countryName ? ` for ${countryName}` : ""} · {open.length}
        </h2>
        {open.length > 1 && (
          <form action={addAllSuggestions.bind(null, tripId, list)}>
            <button type="submit" className="text-xs font-semibold text-accent underline">Add all</button>
          </form>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {open.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-xl bg-surface p-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              {s.notes && <p className="text-[11px] leading-snug text-muted">{s.notes}</p>}
            </div>
            <form action={addSuggestion.bind(null, tripId, s.id)}>
              <button type="submit" className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-[#04201c]">Add</button>
            </form>
            <form action={dismissSuggestion.bind(null, tripId, s.id)}>
              <button type="submit" aria-label={`Dismiss ${s.name}`} className="px-1.5 py-1.5 text-muted">✕</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
