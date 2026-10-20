"use client";

import { useActionState } from "react";
import { simulateLeg, type LiveState } from "@/app/trips/live-actions";

const TONE = {
  CRITICAL: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/50",
  WARNING: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50",
  INFO: "border-line bg-surface",
} as const;

/** Dev/demo buttons that pretend the live source reported a change. */
export function SimulateControls({ tripId, legId, isFlight }: { tripId: string; legId: string; isFlight: boolean }) {
  const [state, action, pending] = useActionState<LiveState, FormData>(async (prev, fd) => {
    const r = await simulateLeg(tripId, legId, prev, fd);
    window.dispatchEvent(new Event("trailmate:alerts-changed"));
    return r;
  }, {});
  const chip = "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[10, 20, 40, 60].map((m) => (
          <button key={m} type="submit" name="preset" value={m} disabled={pending} className={chip}>+{m} min</button>
        ))}
        <button type="submit" name="preset" value="cancel" disabled={pending} className={`${chip} text-red-600 dark:text-red-400`}>Cancel</button>
        <button type="submit" name="preset" value="reset" disabled={pending} className={chip}>Reset</button>
      </div>
      <div className="flex gap-1.5">
        <input name="platform" placeholder={isFlight ? "New gate, e.g. Z50" : "New platform, e.g. 12"} className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs" />
        <button type="submit" name="preset" value="platform" disabled={pending} className={chip}>{isFlight ? "Gate" : "Platform"} change</button>
      </div>
      {pending && <p className="text-xs text-muted">Checking what this breaks…</p>}
      {!pending && state.message && (
        <p role="status" className={`rounded-xl border px-3 py-2 text-xs ${TONE[state.severity ?? "INFO"]}`}>{state.message}</p>
      )}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
