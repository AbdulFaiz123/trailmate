"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSkipped, flushOutbox, OUTBOX_EVENT, readOutbox, readSkipped } from "@/lib/outbox";

/**
 * Shows when you're offline and how many changes are waiting, and sends them
 * as soon as the connection is back (then refreshes the page's numbers).
 * Also says when the server didn't keep an offline change.
 */
export function OfflineStatus() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    const sync = async () => {
      const r = await flushOutbox();
      if (r.applied > 0 || r.skipped.length > 0) router.refresh();
    };
    const update = () => {
      setOnline(navigator.onLine);
      setWaiting(readOutbox().length);
      setSkipped(readSkipped());
    };
    const onOnline = () => { update(); void sync(); };
    update();
    void sync();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", update);
    window.addEventListener(OUTBOX_EVENT, update);
    // Belt and braces: retry every 30 s while something is waiting.
    const timer = setInterval(() => { if (readOutbox().length) void sync(); }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", update);
      window.removeEventListener(OUTBOX_EVENT, update);
      clearInterval(timer);
    };
  }, [router]);

  if (online && waiting === 0 && skipped === 0) return null;
  if (online && waiting === 0) {
    return (
      <div role="status" className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <span>
          {skipped === 1 ? "1 change made offline wasn't saved" : `${skipped} changes made offline weren't saved`} — the item was changed or removed in the meantime.
        </span>
        <button type="button" onClick={clearSkipped} className="shrink-0 underline">OK</button>
      </div>
    );
  }
  return (
    <div role="status" className={`px-4 py-1.5 text-center text-xs font-medium ${online ? "bg-accent-soft text-accent" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
      {online
        ? `Syncing ${waiting} change${waiting === 1 ? "" : "s"}…`
        : `Offline — showing your saved copy.${waiting ? ` ${waiting} change${waiting === 1 ? "" : "s"} will sync when you're back online.` : ""}`}
    </div>
  );
}
