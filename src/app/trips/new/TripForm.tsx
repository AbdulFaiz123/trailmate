"use client";

import { useActionState } from "react";
import { createTrip, type FormState } from "../actions";
import { COMMON_TIME_ZONES } from "@/lib/time";

const input =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent";

export function TripForm({ defaults }: { defaults: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTrip, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};

  return (
    <form action={action} className="space-y-4">
      <Field label="Trip name" error={err.name}>
        <input name="name" defaultValue={v.name} placeholder="Family visit to Hyderabad" className={input} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" error={err.origin}>
          <input name="origin" defaultValue={v.origin} placeholder="Berlin, Germany" className={input} />
        </Field>
        <Field label="To" error={err.destination}>
          <input name="destination" defaultValue={v.destination} placeholder="Hyderabad, India" className={input} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Home country" hint="Customs on the way back" error={err.originCountry}>
          <input name="originCountry" defaultValue={v.originCountry} placeholder="DE" maxLength={2} className={`${input} uppercase`} />
        </Field>
        <Field label="Destination country" hint="Packing suggestions" error={err.destinationCountry}>
          <input name="destinationCountry" defaultValue={v.destinationCountry} placeholder="IN" maxLength={2} className={`${input} uppercase`} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" error={err.startDate}>
          <input type="date" name="startDate" defaultValue={v.startDate} className={input} />
        </Field>
        <Field label="End date" error={err.endDate}>
          <input type="date" name="endDate" defaultValue={v.endDate} className={input} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Home currency" error={err.homeCurrency}>
          <input name="homeCurrency" defaultValue={v.homeCurrency} maxLength={3} className={`${input} uppercase`} />
        </Field>
        <Field label="Home time zone" error={err.homeTimeZone}>
          <select name="homeTimeZone" defaultValue={v.homeTimeZone} className={input}>
            {COMMON_TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </Field>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-accent py-3 text-base font-semibold text-white disabled:opacity-60 dark:text-[#04201c]"
      >
        {pending ? "Creating…" : "Create trip"}
      </button>
    </form>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
