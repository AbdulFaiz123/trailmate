"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/trips/actions";
import { Field, inputClass, Section, TimeZoneInput } from "@/components/form";
import { modeLabel, STAY_ICON } from "@/lib/format";
import { STAY_KINDS } from "@/lib/types";
import { SubmitButton } from "./LegForm";
import { useZoneHint } from "./useZoneHint";

type SaveAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function StayForm({ save, defaults, zones }: { save: SaveAction; defaults: Record<string, string>; zones: string[] }) {
  const [state, action, pending] = useActionState(save, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};
  const [kind, setKind] = useState(v.kind ?? "HOTEL");
  const zone = useZoneHint(v.timeZone, v.checkIn);

  return (
    <form action={action} className="space-y-4">
      <div role="radiogroup" aria-label="Kind" className="flex gap-1.5">
        {STAY_KINDS.map((k) => (
          <label
            key={k}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-full border px-2 py-2 text-sm ${
              kind === k ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface"
            }`}
          >
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            <span aria-hidden>{STAY_ICON[k]}</span>
            {k === "AIRBNB" ? "Airbnb" : modeLabel(k)}
          </label>
        ))}
      </div>

      <Section title="Place">
        <Field label="Name" error={err.name}>
          <input name="name" defaultValue={v.name} placeholder={kind === "FAMILY" ? "Family home" : "Novotel Hyderabad Airport"} className={inputClass} />
        </Field>
        <Field label="Address" error={err.address}>
          <input name="address" defaultValue={v.address} className={inputClass} />
        </Field>
        <Field label="Time zone" error={err.timeZone}>
          <TimeZoneInput name="timeZone" defaultValue={v.timeZone} zones={zones} onChange={zone.onZoneChange} />
        </Field>
      </Section>

      <Section title="Dates">
        <Field label="Check-in from" hint={zone.hint} error={err.checkIn}>
          <input type="datetime-local" name="checkIn" defaultValue={v.checkIn} onChange={zone.onDateChange} className={inputClass} />
        </Field>
        <Field label="Latest check-in (optional)" hint="When reception closes or your host goes to bed" error={err.latestCheckIn}>
          <input type="datetime-local" name="latestCheckIn" defaultValue={v.latestCheckIn} className={inputClass} />
        </Field>
        <Field label="Check-out by" error={err.checkOut}>
          <input type="datetime-local" name="checkOut" defaultValue={v.checkOut} className={inputClass} />
        </Field>
      </Section>

      <Section title="Booking">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Booking ref" error={err.bookingRef} className="col-span-2">
            <input name="bookingRef" defaultValue={v.bookingRef} autoCapitalize="characters" className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Booking link" error={err.bookingUrl} className="col-span-2">
            <input type="url" name="bookingUrl" defaultValue={v.bookingUrl} placeholder="https://" className={inputClass} />
          </Field>
          <Field label="Cost" error={err.cost}>
            <input name="cost" defaultValue={v.cost} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Currency" error={err.currency}>
            <input name="currency" defaultValue={v.currency} maxLength={3} className={`${inputClass} uppercase`} />
          </Field>
        </div>
        <Field label="Notes" error={err.notes}>
          <textarea name="notes" defaultValue={v.notes} rows={2} className={inputClass} />
        </Field>
      </Section>

      <SubmitButton pending={pending} label="Save stay" />
    </form>
  );
}
