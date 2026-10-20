"use client";

import { useEffect, useState } from "react";
import { preloadPdfViewer } from "./docs/PdfViewer";

const key = (tripId: string) => `trailmate:offline:${tripId}`;
const RESAVE_MS = 10 * 60_000;

/**
 * Saves this trip for offline use: asks the service worker to keep its pages
 * and documents. Runs when you open the trip online — again whenever the
 * trip's data changed, or at most every 10 minutes.
 */
export function OfflineSaver({ tripId, version, pages, docs, hasPdf }: {
  tripId: string; version: string; pages: string[]; docs: string[]; hasPdf: boolean;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stored: { at: number; version: string } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(key(tripId)) ?? "null");
    } catch {}
    setSavedAt(stored?.at ?? null);

    if (!navigator.onLine || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    (async () => {
      // Don't trust localStorage alone: an app update can clear the cache.
      const inCache = "caches" in window && (await caches.match(`${location.origin}/trips/${tripId}`, { ignoreVary: true }));
      if (inCache && stored && stored.version === version && Date.now() - stored.at < RESAVE_MS) return;
      if (!inCache) setSavedAt(null);
      const reg = await navigator.serviceWorker.ready;
      const worker = reg.active;
      if (!worker || cancelled) return;
      setSaving(true);
      const channel = new MessageChannel();
      const done = new Promise<{ at: number; pages: number }>((resolve) => {
        channel.port1.onmessage = (e) => resolve(e.data);
        setTimeout(() => resolve({ at: 0, pages: 0 }), 60_000);
      });
      // Load the PDF viewer now, then hand the service worker every script this
      // page has loaded (including the viewer's on-demand files) to keep.
      if (hasPdf) await preloadPdfViewer();
      const assets = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(`${location.origin}/_next/static/`));
      worker.postMessage({ type: "SAVE_TRIP", tripId, pages, docs, assets }, [channel.port2]);
      const result = await done;
      if (cancelled) return;
      setSaving(false);
      if (result.pages > 0) {
        setSavedAt(result.at);
        try {
          localStorage.setItem(key(tripId), JSON.stringify({ at: result.at, version }));
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
    // pages/docs follow from version; re-run only when the trip changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, version]);

  if (process.env.NODE_ENV === "development") {
    return <p className="text-[11px] text-muted">Offline saving runs in production builds (npm run build && npm start).</p>;
  }
  return (
    <p className="text-[11px] text-muted">
      {saving
        ? "Saving this trip for offline…"
        : savedAt
          ? `✓ Available offline · saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Open this trip online once to save it for offline use."}
    </p>
  );
}
