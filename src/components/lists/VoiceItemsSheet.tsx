"use client";

import Link from "next/link";
import { useState } from "react";
import type { DraftItem } from "@/lib/import/draft";

export type SheetItem = DraftItem & { include: boolean };

// No width here: each box sets its own (a shared w-full would beat w-11).
const box = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

/** Slides up after a voice note on the Pack/Buy list: check what was heard, then add. */
export function VoiceItemsSheet({ tripId, transcript, items: initial, extras, onAdd, onClose }: {
  tripId: string;
  transcript: string | null;
  items: DraftItem[];
  /** Travel details heard as well (legs/stays), which belong on the Import screen. */
  extras: number;
  onAdd: (items: SheetItem[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<SheetItem[]>(initial.map((i) => ({ ...i, include: true })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upd = (i: number, patch: Partial<SheetItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const count = items.filter((i) => i.include && i.name.trim()).length;

  return (
    <div role="dialog" aria-modal="true" aria-label="Items from your voice note" className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div className="mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
        <p className="text-sm font-semibold">🎤 Here’s what I heard</p>
        {transcript && <p className="mt-1 text-xs italic text-muted">“{transcript}”</p>}

        {items.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">No items to add. Try again, e.g. “pack sunscreen and two chargers”.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((it, i) => (
              <li key={i} className={`flex items-center gap-1.5 ${it.include ? "" : "opacity-50"}`}>
                <input type="checkbox" aria-label={`Add ${it.name}`} checked={it.include} onChange={(e) => upd(i, { include: e.target.checked })} className="h-5 w-5 shrink-0" />
                <input aria-label="Quantity" inputMode="numeric" className={`${box} w-11 shrink-0 text-center`} value={it.quantity}
                  onChange={(e) => upd(i, { quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })} />
                <input aria-label="Item" className={`${box} min-w-0 flex-1`} value={it.name} onChange={(e) => upd(i, { name: e.target.value })} />
                <button type="button" onClick={() => upd(i, { list: it.list === "PACK" ? "BUY" : "PACK" })}
                  aria-label={`On the ${it.list === "PACK" ? "Pack" : "Buy"} list, tap to switch`}
                  className="shrink-0 rounded-full border border-line px-2 py-1.5 text-xs">{it.list === "PACK" ? "🧳 Pack" : "🛍️ Buy"}</button>
              </li>
            ))}
          </ul>
        )}
        {items.some((i) => i.person) && (
          <p className="mt-2 text-[11px] text-muted">For: {items.filter((i) => i.person).map((i) => `${i.name} → ${i.person}`).join(", ")}</p>
        )}
        {extras > 0 && (
          <p className="mt-3 rounded-xl bg-accent-soft p-2 text-xs">
            I also heard travel details. Add those with <Link href={`/trips/${tripId}/import`} className="font-semibold text-accent underline">✨ Import</Link>.
          </p>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-3 text-sm">Cancel</button>
          <button type="button" disabled={busy || count === 0}
            onClick={async () => { setBusy(true); setError((await onAdd(items)) ?? ""); setBusy(false); }}
            className="flex-1 rounded-full bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#04201c]">
            {busy ? "Adding…" : `Add ${count} item${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
