"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputClass } from "@/components/form";
import { modeLabel } from "@/lib/format";
import { DOCUMENT_KINDS } from "@/lib/types";

type Option = { value: string; label: string };

/** Upload a ticket / booking / visa... from the phone (camera or files). */
export function UploadForm({ tripId, accept, attachOptions, defaultAttach = "TRIP", defaultKind = "TICKET" }: {
  tripId: string; accept: string; attachOptions: Option[]; defaultAttach?: string; defaultKind?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (!navigator.onLine) return setMessage("You're offline. Upload when you're back online — your saved documents still open.");
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/documents", { method: "POST", body: data, signal: AbortSignal.timeout(60_000) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
      form.reset();
      setMessage("Saved ✓ It's available offline on this device once the page refreshes.");
      router.refresh();
    } catch (err) {
      setMessage((err as Error).name === "TimeoutError" ? "Upload timed out. Try again on a better connection." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />
      <label className="block">
        <span className="text-sm font-medium">File</span>
        <input type="file" name="file" required accept={accept} className="mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent" />
        <span className="mt-1 block text-xs text-muted">PDF or photo, up to 15 MB. On a phone you can take a picture.</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Type</span>
          <select name="kind" defaultValue={defaultKind} className={inputClass}>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{modeLabel(k)}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Belongs to</span>
          <select name="attachTo" defaultValue={defaultAttach} className={inputClass}>
            {attachOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Title (optional)</span>
        <input name="title" placeholder="e.g. LH 752 e-ticket" className={inputClass} />
      </label>
      <button type="submit" disabled={busy} className="w-full rounded-full bg-accent py-3 font-semibold text-white disabled:opacity-60 dark:text-[#04201c]">
        {busy ? "Uploading…" : "Upload"}
      </button>
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </form>
  );
}
