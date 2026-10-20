"use client";

import { useActionState } from "react";
import { clearAlerts, runSweepAt, type SweepState } from "../alert-actions";
import { inputClass } from "@/components/form";

/** Dev-only: run the reminder sweep as if it were another moment. */
export function DevTools({ suggestions }: { suggestions: { label: string; value: string }[] }) {
  const [state, action, pending] = useActionState<SweepState, FormData>(async (prev, fd) => {
    const r = await runSweepAt(prev, fd);
    window.dispatchEvent(new Event("trailmate:alerts-changed"));
    return r;
  }, {});

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Pretend it is… (home time)</span>
          <input type="datetime-local" name="at" list="sweep-times" className={inputClass} />
          <datalist id="sweep-times">
            {suggestions.map((s) => <option key={s.value} value={s.value} label={s.label} />)}
          </datalist>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s.value} type="submit" name="preset" value={s.value} disabled={pending} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs disabled:opacity-60">
              {s.label}
            </button>
          ))}
        </div>
        <button type="submit" disabled={pending} className="w-full rounded-full border border-accent py-2.5 text-sm font-semibold text-accent disabled:opacity-60">
          {pending ? "Running…" : "Run reminders at that time"}
        </button>
      </form>
      {state.result && (
        <p role="status" className="text-xs text-muted">
          At {state.result.at}: {state.result.created} new alert{state.result.created === 1 ? "" : "s"}, {state.result.pushed} pushed
          {state.result.quiet ? " (quiet hours: only urgent ones pushed)" : ""}.
        </p>
      )}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <form action={async () => { await clearAlerts(); window.dispatchEvent(new Event("trailmate:alerts-changed")); }}>
        <button type="submit" className="text-xs font-medium text-red-600 underline dark:text-red-400">Delete all alerts</button>
      </form>
    </div>
  );
}
