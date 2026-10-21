"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportDraft } from "@/lib/import/draft";
import type { PurchaseMatch } from "@/lib/import/match";
import { applyImport, createTripFromImport } from "@/app/trips/import-actions";
import { TripCard, tripFieldsFrom } from "./TripCard";
import { Recorder } from "./Recorder";
import { ReviewDraft, type EditItem, type EditLeg, type EditPurchase, type EditStay } from "./ReviewDraft";

type Result = { draft: ImportDraft; matches: PurchaseMatch[]; transcript: string | null; engine: "openai" | "mock" | "demo" };
type Tab = "voice" | "file" | "text";

/**
 * `tripId` = add to that trip. `tripId = null` = create a new trip from what
 * the traveler says or uploads (the review screen then starts with a Trip card).
 */
export function ImportFlow({ tripId, engine, model, zones, openTasks, initialTab = "file", demo = false }: {
  tripId: string | null; engine: "openai" | "mock"; model: string; zones: string[]; openTasks: { id: string; name: string }[]; initialTab?: Tab; demo?: boolean;
}) {
  const router = useRouter();
  const newTrip = tripId === null;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [tripFields, setTripFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string>();
  const [text, setText] = useState("");
  const [source, setSource] = useState<File | null>(null);
  const [keepFile, setKeepFile] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [legs, setLegs] = useState<EditLeg[]>([]);
  const [stays, setStays] = useState<EditStay[]>([]);
  const [items, setItems] = useState<EditItem[]>([]);
  const [purchases, setPurchases] = useState<EditPurchase[]>([]);

  async function read(form: FormData, file: File | null) {
    if (!navigator.onLine) return setError("You’re offline. Reading a file needs a connection — try again when you’re back online.");
    setBusy("reading");
    setError("");
    setResult(null);
    if (tripId) form.set("tripId", tripId);
    else form.set("newTrip", "1");
    try {
      const res = await fetch("/api/import", { method: "POST", body: form, signal: AbortSignal.timeout(150_000) });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setSource(file);
      setResult(data);
      if (newTrip) setTripFields(tripFieldsFrom(data.draft.trip));
      const dupes = data.draft.warnings.filter((w) => /already in your trip/.test(w)).join(" ");
      setLegs(data.draft.legs.map((l) => ({ ...l, include: !(l.number && dupes.includes(l.number)) })));
      setStays(data.draft.stays.map((s) => ({ ...s, include: true })));
      setItems(data.draft.items.map((i) => ({ ...i, include: true })));
      setPurchases(data.draft.purchases.map((p, i) => ({
        action: data.matches[i]?.taskId ? "MARK" : "IGNORE", taskId: data.matches[i]?.taskId ?? null,
        name: p.name, quantity: p.quantity, unitPrice: data.matches[i]?.unitPrice ?? null, currency: p.currency,
      })));
    } catch (e) {
      setError((e as Error).name === "TimeoutError" ? "That took too long. Try a smaller file or a shorter recording." : (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const sendFile = (file: File, mode: "file" | "audio") => {
    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("file", file);
    void read(fd, mode === "file" ? file : null);
  };
  const sendDemo = (demo: "receipt" | "voice") => {
    const fd = new FormData();
    fd.set("mode", "demo");
    fd.set("demo", demo);
    void read(fd, null);
  };

  const tripCount = newTrip ? 1 : 0;
  const count = tripCount + legs.filter((l) => l.include).length + stays.filter((s) => s.include).length + items.filter((i) => i.include).length + purchases.filter((p) => p.action !== "IGNORE").length;

  /** Store the original file in the trip's Docs, attached to `attachTo` ("LEG:id" / "STAY:id" / "TRIP"). */
  async function keepOriginal(targetTripId: string, attachTo: string): Promise<string | null> {
    if (!source || !keepFile) return null;
    const fd = new FormData();
    fd.set("tripId", targetTripId);
    fd.set("attachTo", attachTo);
    fd.set("file", source);
    fd.set("kind", result?.draft.kind === "receipt" ? "OTHER" : legs.some((l) => l.include) ? "TICKET" : "BOOKING");
    const d = result?.draft;
    const firstLeg = legs.find((l) => l.include);
    const firstStay = stays.find((x) => x.include);
    fd.set("title",
      d?.kind === "receipt" ? `Receipt${d.shopName ? ` · ${d.shopName}` : ""}`
      : firstLeg ? `${firstLeg.number ?? firstLeg.mode.toLowerCase()} ${firstLeg.fromName} → ${firstLeg.toName}`.slice(0, 120)
      : firstStay ? `Booking · ${firstStay.name}`.slice(0, 120)
      : source.name.replace(/\.[^.]+$/, ""));
    const up = await fetch("/api/documents", { method: "POST", body: fd });
    return up.ok ? ((await up.json()) as { id: string }).id : null;
  }

  async function save() {
    setBusy("saving");
    setError("");
    setErrorField(undefined);
    try {
      const payload = {
        // Missing values become "" so the server's checks name exactly what to fix.
        legs: legs.map((l) => ({ ...l, fromTimeZone: l.fromTimeZone ?? "", toTimeZone: l.toTimeZone ?? "", departureLocal: l.departureLocal ?? "", arrivalLocal: l.arrivalLocal ?? "" })),
        stays: stays.map((s) => ({ ...s, timeZone: s.timeZone ?? "", checkInLocal: s.checkInLocal ?? "", checkOutLocal: s.checkOutLocal ?? "" })),
        items, purchases, documentId: null,
      };

      if (newTrip) {
        const r = await createTripFromImport(tripFields, payload);
        if (!r.ok) {
          setError(r.error);
          setErrorField(r.field?.split(".").slice(0, 2).join("."));
          return;
        }
        // The trip exists now: keep the ticket, linked to the first leg/stay it created.
        const [kind, id] = r.focus?.split(/-(.+)/) ?? [];
        await keepOriginal(r.tripId, kind && id ? `${kind.toUpperCase()}:${id}` : "TRIP");
        router.push(`/trips/${r.tripId}${r.focus ? `?saved=${r.focus}` : ""}`);
        router.refresh();
        return;
      }

      const documentId = await keepOriginal(tripId!, "TRIP");
      const r = await applyImport(tripId!, { ...payload, documentId });
      if (!r.ok) {
        setError(r.error);
        setErrorField(r.field?.split(".").slice(0, 2).join("."));
        return;
      }
      router.push(`/trips/${tripId}${r.focus ? `?saved=${r.focus}` : ""}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
      className={`flex-1 rounded-full py-2 text-sm font-medium ${tab === t ? "bg-surface shadow-sm" : "text-muted"}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      {!result && (
        <>
          <div className="flex gap-1 rounded-full bg-line/60 p-1">{tabBtn("voice", "🎤 Voice")}{tabBtn("file", "📷 Photo / PDF")}{tabBtn("text", "📝 Paste")}</div>

          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            {tab === "voice" && (
              <>
                {engine === "openai" ? (
                  <>
                    <Recorder disabled={!!busy} onDone={(f) => sendFile(f, "audio")} hint={newTrip
                      ? "Tap and tell me about the trip: where you go, when you leave and come back, how you travel — e.g. “I fly from Berlin to Hyderabad on 27 October to visit family and I’m back on 10 November.”"
                      : undefined} />
                    <label className="block text-center text-xs text-accent underline">
                      or choose an audio file
                      <input type="file" accept="audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0], "audio")} />
                    </label>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    {demo ? "This public demo doesn’t record (to keep it free). Try the sample voice note below — in the full app, OpenAI turns your recording into text."
                      : <>Voice messages need OpenAI to turn speech into text. Add <code className="font-mono">OPENAI_API_KEY</code> to <code className="font-mono">.env</code>.</>}
                  </p>
                )}
                <button type="button" onClick={() => sendDemo("voice")} className="w-full rounded-full border border-line py-2 text-xs">
                  {newTrip ? "Try a demo: a spoken trip description" : "Try the voice demo (sample transcript)"}
                </button>
              </>
            )}
            {tab === "file" && (
              <>
                <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-line p-6 text-center">
                  <span className="block text-3xl" aria-hidden>📄</span>
                  <span className="mt-1 block text-sm font-medium">Choose or take a photo, or pick a PDF</span>
                  <span className="block text-xs text-muted">{newTrip ? "Flight or train ticket, hotel or Airbnb booking, itinerary" : "Ticket, booking confirmation or shop receipt"} · up to 15 MB</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={!!busy}
                    onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0], "file")} />
                </label>
                {engine !== "openai" && (
                  <p className="text-xs text-muted">
                    {demo ? "This public demo doesn’t read real files (to keep it free) — try the sample receipt. In the full app, OpenAI reads tickets, bookings and receipts."
                      : <>Reading photos and PDFs needs <code className="font-mono">OPENAI_API_KEY</code> in <code className="font-mono">.env</code>.</>}
                  </p>
                )}
                {!newTrip && <button type="button" onClick={() => sendDemo("receipt")} className="w-full rounded-full border border-line py-2 text-xs">Try the demo receipt</button>}
              </>
            )}
            {tab === "text" && (
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("mode", "text"); fd.set("text", text); void read(fd, null); }} className="space-y-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste a booking email, or type: ICE 597 from Berlin Hbf to Frankfurt (Main) Hbf on 27 Oct, 09:51–14:05. Buy 2 adapters for Dad."
                  className="w-full rounded-xl border border-line bg-background p-3 text-sm outline-none focus:border-accent" />
                <button type="submit" disabled={!!busy || !text.trim()} className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#04201c]">Read it</button>
              </form>
            )}
          </section>
          <p className="text-[11px] leading-snug text-muted">
            {engine === "openai"
              ? `Your recording, photo or text is sent to OpenAI (${model}) to read it, with storage turned off for the request. Nothing is added to your trip until you confirm.`
              : "Using the simple built-in text reader (no AI key). Nothing is added to your trip until you confirm."}
          </p>
        </>
      )}

      {busy === "reading" && <p role="status" className="rounded-2xl bg-accent-soft p-4 text-center text-sm text-accent">Reading… this can take up to a minute for a PDF.</p>}
      {error && <p role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {result && (
        <>
          <section className="space-y-2 rounded-2xl border border-line bg-surface p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {result.engine === "openai" ? `Read by OpenAI · ${model}` : result.engine === "demo" ? "Demo data" : "Simple text reader"}
            </p>
            <p className="text-sm">{result.draft.summary || "Here’s what I found."}</p>
            {result.transcript && (
              <details className="text-xs"><summary className="cursor-pointer text-muted">What I heard</summary><p className="mt-1 italic">“{result.transcript}”</p></details>
            )}
            {result.draft.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">{result.draft.warnings.map((w) => <li key={w}>⚠️ {w}</li>)}</ul>
            )}
          </section>

          {newTrip && <TripCard fields={tripFields} setFields={setTripFields} zones={zones} error={errorField?.startsWith("trip")} />}

          {!newTrip && count === 0 && legs.length + stays.length + items.length + purchases.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing to add from this one.</p>
          ) : (
            <ReviewDraft draft={result.draft} legs={legs} setLegs={setLegs} stays={stays} setStays={setStays} items={items} setItems={setItems}
              purchases={purchases} setPurchases={setPurchases} matches={result.matches} openTasks={openTasks} zones={zones} errorField={errorField} />
          )}

          {source && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} className="h-5 w-5" />
              Keep “{source.name}” in this trip’s Docs (readable offline)
            </label>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => { setResult(null); setError(""); }} className="rounded-full border border-line px-4 py-3 text-sm">Start over</button>
            <button type="button" onClick={save} disabled={busy === "saving" || count === 0}
              className="flex-1 rounded-full bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#04201c]">
              {busy === "saving" ? "Saving…" : newTrip ? `Create trip${count > 1 ? ` with ${count - 1} item${count === 2 ? "" : "s"}` : ""}` : `Save ${count} change${count === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
