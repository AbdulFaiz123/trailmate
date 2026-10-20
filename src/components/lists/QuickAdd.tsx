"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { enqueue, flushOutbox, OUTBOX_EVENT, readOutbox } from "@/lib/outbox";

/** Sticky one-line "add item" bar. "3x Haribo" sets the quantity. Works offline. */
export function QuickAdd({ tripId, list, newHref }: { tripId: string; list: "BUY" | "PACK"; newHref: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [waiting, setWaiting] = useState<string[]>([]);

  useEffect(() => {
    const read = () =>
      setWaiting(readOutbox().flatMap((o) => (o.kind === "addTask" && o.tripId === tripId && o.list === list ? [o.name] : [])));
    read();
    window.addEventListener(OUTBOX_EVENT, read);
    return () => window.removeEventListener(OUTBOX_EVENT, read);
  }, [tripId, list]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {waiting.length > 0 && (
        <p className="mb-2 truncate text-xs text-amber-700 dark:text-amber-400">⏳ Waiting to sync: {waiting.join(", ")}</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const name = inputRef.current?.value.trim();
          if (!name) return;
          enqueue({ kind: "addTask", tripId, list, name, clientId: crypto.randomUUID() });
          inputRef.current!.value = "";
          if ((await flushOutbox()).applied > 0) router.refresh();
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          name="name"
          required
          autoComplete="off"
          placeholder={list === "BUY" ? "Add to buy… e.g. 3x Haribo" : "Add to pack…"}
          aria-label={list === "BUY" ? "Add an item to buy" : "Add an item to pack"}
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-full bg-accent px-5 text-sm font-semibold text-white dark:text-[#04201c]">Add</button>
        <a href={newHref} aria-label="Add with details" className="flex items-center rounded-full border border-line px-3 text-sm text-muted">⋯</a>
      </form>
    </div>
  );
}
