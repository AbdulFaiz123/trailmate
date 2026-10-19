"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/trips/actions";
import { Field, inputClass } from "@/components/form";
import { modeLabel } from "@/lib/format";
import { TASK_CATEGORIES } from "@/lib/types";
import { SubmitButton } from "./LegForm";

type SaveAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function TaskForm({ save, defaults, people }: { save: SaveAction; defaults: Record<string, string>; people: string[] }) {
  const [state, action, pending] = useActionState(save, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};
  const [list, setList] = useState(v.list ?? "BUY");

  const statuses = list === "BUY" ? [["TO_BUY", "To buy"], ["BOUGHT", "Bought"], ["PACKED", "Packed"]] : [["TODO", "Not packed"], ["PACKED", "Packed"]];

  return (
    <form action={action} className="space-y-4">
      <div role="radiogroup" aria-label="List" className="flex gap-1 rounded-full bg-line/60 p-1">
        {[["BUY", "🛍️ Buy"], ["PACK", "🧳 Pack"]].map(([key, label]) => (
          <label key={key} className={`flex-1 cursor-pointer rounded-full py-2 text-center text-sm font-medium ${list === key ? "bg-surface shadow-sm" : "text-muted"}`}>
            <input type="radio" name="list" value={key} checked={list === key} onChange={() => setList(key)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <Field label="Item" error={err.name}>
          <input name="name" defaultValue={v.name} placeholder="Ritter Sport chocolates" className={inputClass} />
        </Field>
        <Field label="Qty" error={err.quantity}>
          <input name="quantity" type="number" min={1} defaultValue={v.quantity ?? "1"} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={err.category}>
          <select name="category" defaultValue={v.category ?? "OTHER"} className={inputClass}>
            {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{modeLabel(c)}</option>)}
          </select>
        </Field>
        <Field label="Status" error={err.status}>
          <select name="status" key={list} defaultValue={statuses.some(([s]) => s === v.status) ? v.status : statuses[0][0]} className={inputClass}>
            {statuses.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="For someone? (optional)" hint="e.g. Mom. Gifts are grouped by person later." error={err.person}>
        <input name="person" defaultValue={v.person} list="people" autoComplete="off" className={inputClass} />
        <datalist id="people">{people.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Which bag?</legend>
        <div className="flex gap-1.5">
          {[["CHECKED", "🧳 Checked"], ["CABIN", "🎒 Cabin"], ["NONE", "Not in a bag"]].map(([key, label]) => (
            <label key={key} className="flex-1 cursor-pointer">
              <input type="radio" name="bag" value={key} defaultChecked={(v.bag || "CHECKED") === key} className="peer sr-only" />
              <span className="block rounded-full border border-line bg-surface py-2 text-center text-sm peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Weight (g, each)" error={err.weightG}>
          <input name="weightG" defaultValue={v.weightG} inputMode="numeric" placeholder="350" className={inputClass} />
        </Field>
        <Field label="Price (each)" error={err.price}>
          <input name="price" defaultValue={v.price} inputMode="decimal" placeholder="12.99" className={inputClass} />
        </Field>
        <Field label="Currency" error={err.currency}>
          <input name="currency" defaultValue={v.currency} maxLength={3} className={`${inputClass} uppercase`} />
        </Field>
      </div>

      {list === "BUY" && (
        <Field label="Buy by (optional)" hint="You'll get a reminder (step 4). Counts as 20:00 at home that day." error={err.buyBy}>
          <input type="date" name="buyBy" defaultValue={v.buyBy} className={inputClass} />
        </Field>
      )}

      <Field label="Notes" error={err.notes}>
        <textarea name="notes" defaultValue={v.notes} rows={2} className={inputClass} />
      </Field>

      <SubmitButton pending={pending} label="Save item" />
    </form>
  );
}
