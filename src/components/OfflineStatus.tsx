"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { flushOutbox, OUTBOX_EVENT, readOutbox } from "@/lib/outbox";

/**
 * Shows when you're offline and how many changes are waiting, and sends them
 * as soon as the connection is back (then refreshes the page's numbers).
 */
export function OfflineStatus() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const sync = async () => {
      if ((await flushOutbox()) > 0) router.refresh();
    };
    const update = () => {
      setOnline(navigator.onLine);
      setWaiting(readOutbox().length);
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

  if (online && waiting === 0) return null;
  return (
    <div role="status" className={`px-4 py-1.5 text-center text-xs font-medium ${online ? "bg-accent-soft text-accent" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
      {online
        ? `Syncing ${waiting} change${waiting === 1 ? "" : "s"}…`
        : `Offline — showing your saved copy.${waiting ? ` ${waiting} change${waiting === 1 ? "" : "s"} will sync when you're back online.` : ""}`}
    </div>
  );
}
