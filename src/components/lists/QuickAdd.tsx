"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { enqueue, flushOutbox, OUTBOX_EVENT, readOutbox } from "@/lib/outbox";
import type { ImportDraft } from "@/lib/import/draft";
import { applyImport } from "@/app/trips/import-actions";
import { useVoiceRecorder } from "@/components/import/useVoiceRecorder";
import { VoiceItemsSheet, type SheetItem } from "./VoiceItemsSheet";

type Heard = { transcript: string | null; draft: ImportDraft };

/**
 * Sticky "add item" bar. Type ("3x Haribo" sets the quantity, works offline)
 * or tap 🎤 and say several things at once ("pack sunscreen, two chargers and
 * my passport"); a sheet shows what was heard before anything is added.
 */
export function QuickAdd({ tripId, list, newHref, voice }: { tripId: string; list: "BUY" | "PACK"; newHref: string; voice: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("");
  const [heard, setHeard] = useState<Heard | null>(null);

  const recorder = useVoiceRecorder(async (audio) => {
    setReading(true);
    setNote("");
    try {
      const fd = new FormData();
      fd.set("tripId", tripId);
      fd.set("mode", "audio");
      fd.set("list", list);
      fd.set("file", audio);
      const res = await fetch("/api/import", { method: "POST", body: fd, signal: AbortSignal.timeout(120_000) });
      const data = (await res.json()) as Heard & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setHeard({ transcript: data.transcript, draft: data.draft });
    } catch (e) {
      setNote((e as Error).name === "TimeoutError" ? "That took too long. Try a shorter note." : (e as Error).message);
    } finally {
      setReading(false);
    }
  }, 60);

  function onMic() {
    if (!voice) return setNote("Voice needs OpenAI: add OPENAI_API_KEY to .env. You can still type.");
    if (recorder.state !== "recording" && !navigator.onLine) return setNote("Voice needs a connection. Type instead — that works offline.");
    if (recorder.state === "unsupported") return setNote("This browser can’t record audio.");
    if (recorder.state === "denied") return setNote("Microphone blocked. Allow it in the browser’s site settings.");
    setNote("");
    void recorder.toggle();
  }

  async function addHeard(items: SheetItem[]): Promise<string | null> {
    const r = await applyImport(tripId, { legs: [], stays: [], purchases: [], documentId: null, items: items.filter((i) => i.include && i.name.trim()) });
    if (!r.ok) return r.error;
    setHeard(null);
    setNote(r.summary);
    router.refresh();
    return null;
  }

  useEffect(() => {
    const read = () =>
      setWaiting(readOutbox().flatMap((o) => (o.kind === "addTask" && o.tripId === tripId && o.list === list ? [o.name] : [])));
    read();
    window.addEventListener(OUTBOX_EVENT, read);
    return () => window.removeEventListener(OUTBOX_EVENT, read);
  }, [tripId, list]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {heard && (
        <VoiceItemsSheet tripId={tripId} transcript={heard.transcript} items={heard.draft.items}
          extras={heard.draft.legs.length + heard.draft.stays.length} onAdd={addHeard} onClose={() => setHeard(null)} />
      )}
      {(recorder.state === "recording" || reading || note) && (
        <p role="status" className={`mb-2 truncate text-xs ${recorder.state === "recording" ? "font-medium text-red-600 dark:text-red-400" : "text-muted"}`}>
          {recorder.state === "recording" ? `● Listening… ${recorder.clock} — tap ■ when you’re done` : reading ? "Reading what you said…" : note}
        </p>
      )}
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
        <button type="submit" className="rounded-full bg-accent px-4 text-sm font-semibold text-white dark:text-[#04201c]">Add</button>
        <button type="button" onClick={onMic} disabled={reading}
          aria-label={recorder.state === "recording" ? "Stop recording" : list === "PACK" ? "Say what to pack" : "Say what to buy"}
          className={`flex w-11 shrink-0 items-center justify-center rounded-full text-lg disabled:opacity-50 ${
            recorder.state === "recording" ? "animate-pulse bg-red-600 text-white" : "border border-accent text-accent"}`}>
          {recorder.state === "recording" ? "■" : "🎤"}
        </button>
        <a href={newHref} aria-label="Add with details" className="flex items-center rounded-full border border-line px-2.5 text-sm text-muted">⋯</a>
      </form>
    </div>
  );
}
