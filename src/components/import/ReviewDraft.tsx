"use client";

import type { DraftLeg, DraftStay, ImportDraft } from "@/lib/import/draft";
import type { PurchaseMatch } from "@/lib/import/match";
import { modeLabel } from "@/lib/format";
import { LEG_MODES, STAY_KINDS } from "@/lib/types";

export type EditLeg = DraftLeg & { include: boolean };
export type EditStay = DraftStay & { include: boolean };
export type EditItem = ImportDraft["items"][number] & { include: boolean };
export type EditPurchase = { action: "MARK" | "ADD" | "IGNORE"; taskId: string | null; name: string; quantity: number; unitPrice: number | null; currency: string | null };

const input = "w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";
const CONF = { high: "", medium: "text-amber-700 dark:text-amber-400", low: "text-red-600 dark:text-red-400" } as const;

function Card({ include, onToggle, title, badge, children, error }: {
  include: boolean; onToggle: (v: boolean) => void; title: string; badge?: React.ReactNode; children: React.ReactNode; error?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${error ? "border-red-400" : include ? "border-accent/60 bg-surface" : "border-line bg-surface/40 opacity-60"}`}>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={include} onChange={(e) => onToggle(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {badge}
      </label>
      {include && <div className="mt-3 grid grid-cols-2 gap-2">{children}</div>}
    </div>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block space-y-0.5 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function ReviewDraft(props: {
  draft: ImportDraft;
  legs: EditLeg[]; setLegs: (v: EditLeg[]) => void;
  stays: EditStay[]; setStays: (v: EditStay[]) => void;
  items: EditItem[]; setItems: (v: EditItem[]) => void;
  purchases: EditPurchase[]; setPurchases: (v: EditPurchase[]) => void;
  matches: PurchaseMatch[];
  openTasks: { id: string; name: string }[];
  zones: string[];
  errorField?: string;
}) {
  const { legs, stays, items, purchases, zones } = props;
  const upd = <T,>(arr: T[], set: (v: T[]) => void, i: number, patch: Partial<T>) => set(arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const text = (v: string | null) => v ?? "";
  const nul = (v: string) => (v.trim() ? v : null);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  return (
    <div className="space-y-3">
      <datalist id="import-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>

      {legs.map((l, i) => (
        <Card key={`l${i}`} include={l.include} onToggle={(v) => upd(legs, props.setLegs, i, { include: v })} error={props.errorField === `legs.${i}`}
          title={`${l.mode === "FLIGHT" ? "✈️" : l.mode === "TRAIN" ? "🚆" : "➡️"} ${l.number ?? modeLabel(l.mode)}: ${l.fromName} → ${l.toName}`}
          badge={<span className={`text-[11px] ${CONF[l.confidence]}`}>{l.confidence} confidence</span>}>
          <F label="Mode"><select className={input} value={l.mode} onChange={(e) => upd(legs, props.setLegs, i, { mode: e.target.value as EditLeg["mode"] })}>{LEG_MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}</select></F>
          <F label="Number"><input className={input} value={text(l.number)} onChange={(e) => upd(legs, props.setLegs, i, { number: nul(e.target.value) })} /></F>
          <F label="From" wide><input className={input} value={l.fromName} onChange={(e) => upd(legs, props.setLegs, i, { fromName: e.target.value })} /></F>
          <F label="Departs (local time)"><input type="datetime-local" className={input} value={text(l.departureLocal)} onChange={(e) => upd(legs, props.setLegs, i, { departureLocal: nul(e.target.value) })} /></F>
          <F label="Time zone"><input list="import-zones" className={input} value={text(l.fromTimeZone)} onChange={(e) => upd(legs, props.setLegs, i, { fromTimeZone: nul(e.target.value) })} /></F>
          <F label="To" wide><input className={input} value={l.toName} onChange={(e) => upd(legs, props.setLegs, i, { toName: e.target.value })} /></F>
          <F label="Arrives (local time)"><input type="datetime-local" className={input} value={text(l.arrivalLocal)} onChange={(e) => upd(legs, props.setLegs, i, { arrivalLocal: nul(e.target.value) })} /></F>
          <F label="Time zone"><input list="import-zones" className={input} value={text(l.toTimeZone)} onChange={(e) => upd(legs, props.setLegs, i, { toTimeZone: nul(e.target.value) })} /></F>
          <F label="Carrier"><input className={input} value={text(l.carrier)} onChange={(e) => upd(legs, props.setLegs, i, { carrier: nul(e.target.value) })} /></F>
          <F label="Booking ref"><input className={`${input} font-mono`} value={text(l.bookingRef)} onChange={(e) => upd(legs, props.setLegs, i, { bookingRef: nul(e.target.value) })} /></F>
          <F label={l.mode === "FLIGHT" ? "Gate" : "Platform"}><input className={input} value={text(l.platform)} onChange={(e) => upd(legs, props.setLegs, i, { platform: nul(e.target.value) })} /></F>
          <F label="Seat"><input className={input} value={text(l.seat)} onChange={(e) => upd(legs, props.setLegs, i, { seat: nul(e.target.value) })} /></F>
          <F label="Price"><input inputMode="decimal" className={input} value={l.price ?? ""} onChange={(e) => upd(legs, props.setLegs, i, { price: num(e.target.value) })} /></F>
          <F label="Currency"><input maxLength={3} className={`${input} uppercase`} value={text(l.currency)} onChange={(e) => upd(legs, props.setLegs, i, { currency: nul(e.target.value.toUpperCase()) })} /></F>
        </Card>
      ))}

      {stays.map((s, i) => (
        <Card key={`s${i}`} include={s.include} onToggle={(v) => upd(stays, props.setStays, i, { include: v })} error={props.errorField === `stays.${i}`}
          title={`🏨 ${s.name}`} badge={<span className={`text-[11px] ${CONF[s.confidence]}`}>{s.confidence} confidence</span>}>
          <F label="Kind"><select className={input} value={s.kind} onChange={(e) => upd(stays, props.setStays, i, { kind: e.target.value as EditStay["kind"] })}>{STAY_KINDS.map((k) => <option key={k} value={k}>{modeLabel(k)}</option>)}</select></F>
          <F label="Time zone"><input list="import-zones" className={input} value={text(s.timeZone)} onChange={(e) => upd(stays, props.setStays, i, { timeZone: nul(e.target.value) })} /></F>
          <F label="Name" wide><input className={input} value={s.name} onChange={(e) => upd(stays, props.setStays, i, { name: e.target.value })} /></F>
          <F label="Address" wide><input className={input} value={text(s.address)} onChange={(e) => upd(stays, props.setStays, i, { address: nul(e.target.value) })} /></F>
          <F label="Check-in from"><input type="datetime-local" className={input} value={text(s.checkInLocal)} onChange={(e) => upd(stays, props.setStays, i, { checkInLocal: nul(e.target.value) })} /></F>
          <F label="Check-out by"><input type="datetime-local" className={input} value={text(s.checkOutLocal)} onChange={(e) => upd(stays, props.setStays, i, { checkOutLocal: nul(e.target.value) })} /></F>
          <F label="Booking ref"><input className={`${input} font-mono`} value={text(s.bookingRef)} onChange={(e) => upd(stays, props.setStays, i, { bookingRef: nul(e.target.value) })} /></F>
          <F label="Price"><input inputMode="decimal" className={input} value={s.price ?? ""} onChange={(e) => upd(stays, props.setStays, i, { price: num(e.target.value) })} /></F>
        </Card>
      ))}

      {items.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-sm font-semibold">🧳 For your lists</p>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={`i${i}`} className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Add ${it.name}`} checked={it.include} onChange={(e) => upd(items, props.setItems, i, { include: e.target.checked })} className="h-5 w-5 shrink-0" />
                <select aria-label="List" className={`${input} w-20 shrink-0`} value={it.list} onChange={(e) => upd(items, props.setItems, i, { list: e.target.value as "BUY" | "PACK" })}>
                  <option value="BUY">Buy</option><option value="PACK">Pack</option>
                </select>
                <input aria-label="Quantity" inputMode="numeric" className={`${input} w-12 shrink-0`} value={it.quantity} onChange={(e) => upd(items, props.setItems, i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                <input aria-label="Item" className={input} value={it.name} onChange={(e) => upd(items, props.setItems, i, { name: e.target.value })} />
                <input aria-label="For" placeholder="for…" className={`${input} w-20 shrink-0`} value={text(it.person)} onChange={(e) => upd(items, props.setItems, i, { person: nul(e.target.value) })} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {purchases.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-1 text-sm font-semibold">🧾 Receipt{props.draft.shopName ? ` · ${props.draft.shopName}` : ""}</p>
          <p className="mb-2 text-[11px] text-muted">Matched lines tick off your Buy list and save the real price.</p>
          <ul className="space-y-2">
            {purchases.map((pu, i) => {
              const m = props.matches[i];
              return (
                <li key={`p${i}`} className="space-y-1 rounded-xl bg-background p-2">
                  <p className="text-xs"><span className="font-medium">{pu.quantity} × {pu.name}</span>
                    {pu.unitPrice != null && <span className="text-muted"> · {pu.unitPrice.toFixed(2)} {pu.currency ?? ""} each</span>}</p>
                  <select aria-label={`What to do with ${pu.name}`} className={input}
                    value={pu.action === "MARK" ? `MARK:${pu.taskId}` : pu.action}
                    onChange={(e) => {
                      const v = e.target.value;
                      upd(purchases, props.setPurchases, i, v.startsWith("MARK:") ? { action: "MARK", taskId: v.slice(5) } : { action: v as "ADD" | "IGNORE", taskId: null });
                    }}>
                    {m?.taskId && <option value={`MARK:${m.taskId}`}>✓ Bought: {m.taskName}</option>}
                    {props.openTasks.filter((t) => t.id !== m?.taskId).map((t) => <option key={t.id} value={`MARK:${t.id}`}>✓ Bought: {t.name}</option>)}
                    <option value="ADD">+ Add as a bought item</option>
                    <option value="IGNORE">Ignore this line</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
