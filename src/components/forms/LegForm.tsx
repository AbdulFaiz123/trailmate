"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/trips/actions";
import { Field, inputClass, Section, TimeZoneInput } from "@/components/form";
import { MODE_ICON, modeLabel } from "@/lib/format";
import { LEG_MODES } from "@/lib/types";
import { useZoneHint } from "./useZoneHint";

type SaveAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function LegForm({ save, defaults, zones }: { save: SaveAction; defaults: Record<string, string>; zones: string[] }) {
  const [state, action, pending] = useActionState(save, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};
  const [mode, setMode] = useState(v.mode ?? "TRAIN");
  const from = useZoneHint(v.fromTimeZone, v.departure);
  const to = useZoneHint(v.toTimeZone, v.arrival);
  const isFlight = mode === "FLIGHT";
  const isPublic = mode === "TRAIN" || mode === "FLIGHT" || mode === "BUS" || mode === "FERRY";

  return (
    <form action={action} className="space-y-4">
      <div role="radiogroup" aria-label="Mode" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {LEG_MODES.map((m) => (
          <label
            key={m}
            className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-3 py-2 text-sm ${
              mode === m ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface"
            }`}
          >
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
            <span aria-hidden>{MODE_ICON[m]}</span>
            {modeLabel(m)}
          </label>
        ))}
      </div>

      <Section title="From">
        <Field label="Place" error={err.fromName}>
          <input name="fromName" defaultValue={v.fromName} placeholder={isFlight ? "Frankfurt Airport (FRA)" : "Berlin Hbf"} className={inputClass} />
        </Field>
        <Field label="Time zone" error={err.fromTimeZone}>
          <TimeZoneInput name="fromTimeZone" defaultValue={v.fromTimeZone} zones={zones} onChange={from.onZoneChange} />
        </Field>
        <Field label="Departure" hint={from.hint} error={err.departure}>
          <input type="datetime-local" name="departure" defaultValue={v.departure} onChange={from.onDateChange} className={inputClass} />
        </Field>
      </Section>

      <Section title="To">
        <Field label="Place" error={err.toName}>
          <input name="toName" defaultValue={v.toName} placeholder={isFlight ? "Hyderabad Airport (HYD)" : "Frankfurt (Main) Hbf"} className={inputClass} />
        </Field>
        <Field label="Time zone" error={err.toTimeZone}>
          <TimeZoneInput name="toTimeZone" defaultValue={v.toTimeZone} zones={zones} onChange={to.onZoneChange} />
        </Field>
        <Field label="Arrival" hint={to.hint} error={err.arrival}>
          <input type="datetime-local" name="arrival" defaultValue={v.arrival} onChange={to.onDateChange} className={inputClass} />
        </Field>
      </Section>

      <Section title="Ticket">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Carrier" error={err.carrier}>
            <input name="carrier" defaultValue={v.carrier} placeholder={isFlight ? "Lufthansa" : "Deutsche Bahn"} className={inputClass} />
          </Field>
          <Field label={isFlight ? "Flight no." : "Train / line"} error={err.number}>
            <input name="number" defaultValue={v.number} placeholder={isFlight ? "LH 752" : "ICE 597"} className={inputClass} />
          </Field>
          {isPublic && (
            <Field label={isFlight ? "Gate" : "Platform"} error={err.platform}>
              <input name="platform" defaultValue={v.platform} className={inputClass} />
            </Field>
          )}
          {isPublic && (
            <Field label="Seat" error={err.seat}>
              <input name="seat" defaultValue={v.seat} className={inputClass} />
            </Field>
          )}
          <Field label="Booking ref" error={err.bookingRef} className="col-span-2">
            <input name="bookingRef" defaultValue={v.bookingRef} autoCapitalize="characters" className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Cost" error={err.cost}>
            <input name="cost" defaultValue={v.cost} inputMode="decimal" placeholder="59.90" className={inputClass} />
          </Field>
          <Field label="Currency" error={err.currency}>
            <input name="currency" defaultValue={v.currency} maxLength={3} className={`${inputClass} uppercase`} />
          </Field>
        </div>
        <Field label="Notes" error={err.notes}>
          <textarea name="notes" defaultValue={v.notes} rows={2} className={inputClass} />
        </Field>
      </Section>

      {mode === "TRAIN" && (
        <details className="rounded-2xl border border-line p-3 text-sm">
          <summary className="cursor-pointer font-medium">Live tracking (optional)</summary>
          <p className="mt-2 text-xs text-muted">
            Deutsche Bahn station IDs (EVA numbers), e.g. Berlin Hbf = 8011160. Used in step 5 to fetch live delays.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="From station ID">
              <input name="fromStopId" defaultValue={v.fromStopId} inputMode="numeric" className={inputClass} />
            </Field>
            <Field label="To station ID">
              <input name="toStopId" defaultValue={v.toStopId} inputMode="numeric" className={inputClass} />
            </Field>
          </div>
        </details>
      )}

      <SubmitButton pending={pending} label="Save leg" />
    </form>
  );
}

export function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-accent py-3 text-base font-semibold text-white disabled:opacity-60 dark:text-[#04201c]"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
