"use client";

import { useActionState } from "react";
import { saveBaggage } from "@/app/trips/task-actions";
import type { FormState } from "@/app/trips/actions";
import { Field, inputClass } from "@/components/form";

export function BaggageForm({ tripId, defaults }: { tripId: string; defaults: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBaggage.bind(null, tripId), {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};
  return (
    <form action={action} className="mt-3 grid grid-cols-2 gap-3">
      <Field label="Checked allowance (kg)" error={err.checkedAllowance}>
        <input name="checkedAllowance" defaultValue={v.checkedAllowance} inputMode="decimal" className={inputClass} />
      </Field>
      <Field label="Cabin allowance (kg)" error={err.cabinAllowance}>
        <input name="cabinAllowance" defaultValue={v.cabinAllowance} inputMode="decimal" className={inputClass} />
      </Field>
      <Field label="Empty suitcase (kg)" error={err.checkedTare}>
        <input name="checkedTare" defaultValue={v.checkedTare} inputMode="decimal" className={inputClass} />
      </Field>
      <Field label="Empty cabin bag (kg)" error={err.cabinTare}>
        <input name="cabinTare" defaultValue={v.cabinTare} inputMode="decimal" className={inputClass} />
      </Field>
      <p className="col-span-2 text-xs text-muted">Find the allowance on your e-ticket. Weigh the empty bag once; it counts too.</p>
      <button type="submit" disabled={pending} className="col-span-2 rounded-full border border-accent py-2 text-sm font-semibold text-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save baggage"}
      </button>
    </form>
  );
}
