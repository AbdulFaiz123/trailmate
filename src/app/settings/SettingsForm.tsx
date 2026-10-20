"use client";

import { useActionState } from "react";
import { saveSettings } from "../alert-actions";
import type { FormState } from "../trips/actions";
import { Field, inputClass, Section } from "@/components/form";

const TOGGLES: [string, string, string][] = [
  ["alertLeaveNow", "Leave now", "Departure minus your travel buffer, updated with delays"],
  ["alertCheckIn", "Check-in", "Flights 24 h before; hotels on arrival day"],
  ["alertBuyBy", "Buy-by", "3 days before, the morning of, and if you missed it"],
  ["alertPacking", "Packing", "The evening before you leave, with what's not packed"],
  ["alertNearbyShop", "Shop nearby", "When a stay is close to a shop on your Buy list"],
  ["alertDelay", "Delays & changes", "Live train/flight status (step 5)"],
  ["alertConnection", "Missed connections", "What a delay breaks (step 5)"],
];

export function SettingsForm({ defaults }: { defaults: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Section title="Alerts">
        <ul className="divide-y divide-line">
          {TOGGLES.map(([name, label, hint]) => (
            <li key={name}>
              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
                <input type="checkbox" name={name} defaultChecked={v[name] === "true" || v[name] === "on"} className="peer sr-only" />
                <span
                  aria-hidden
                  className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                />
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Timing">
        <Field label="Travel buffer for “Leave now” (minutes)" hint="How long it takes you to get to the station or airport. Taxis use 5 min." error={err.leaveBufferMin}>
          <input name="leaveBufferMin" type="number" min={0} max={240} defaultValue={v.leaveBufferMin} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quiet from" error={err.quietHoursStart}>
            <input type="time" name="quietHoursStart" defaultValue={v.quietHoursStart} className={inputClass} />
          </Field>
          <Field label="Quiet until" error={err.quietHoursEnd}>
            <input type="time" name="quietHoursEnd" defaultValue={v.quietHoursEnd} className={inputClass} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          In the time zone you’re in at that moment. During quiet hours only urgent alerts (leave now, cancellations) are pushed; the rest wait until morning.
        </p>
      </Section>

      <button type="submit" disabled={pending} className="w-full rounded-full bg-accent py-3 font-semibold text-white disabled:opacity-60 dark:text-[#04201c]">
        {pending ? "Saving…" : v.saved ? "Saved ✓" : "Save settings"}
      </button>
    </form>
  );
}
