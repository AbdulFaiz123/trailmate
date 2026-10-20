"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Latest = { id: string; title: string; body: string; severity: string; urgent: boolean };

const POLL_MS = 30_000;

/**
 * Header bell with the unread count. It also shows in-app pop-ups for new
 * alerts, which is the fallback when push notifications are off or blocked.
 */
export function AlertBell() {
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<Latest | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const res = await fetch("/api/alerts", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (!res.ok) return;
        const data = (await res.json()) as { unread: number; latest: Latest[] };
        setUnread(data.unread);
        const pushOn = typeof Notification !== "undefined" && Notification.permission === "granted";
        if (seen.current) {
          const fresh = data.latest.find((a) => !seen.current!.has(a.id));
          if (fresh && !pushOn) {
            setToast(fresh);
            clearTimeout(timer);
            timer = setTimeout(() => setToast(null), 8_000);
          }
        }
        seen.current = new Set([...(seen.current ?? []), ...data.latest.map((a) => a.id)]);
      } catch {
        // Offline or server busy: keep the last count, try again next poll.
      }
    };
    load();
    const interval = setInterval(load, POLL_MS);
    window.addEventListener("focus", load);
    window.addEventListener("trailmate:alerts-changed", load);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("trailmate:alerts-changed", load);
    };
  }, []);

  return (
    <>
      <Link href="/alerts" aria-label={`Alerts, ${unread} unread`} className="relative flex h-10 w-10 items-center justify-center rounded-full text-lg">
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      {toast && (
        <div role="status" className="fixed inset-x-0 top-2 z-50 mx-auto w-[calc(100%-2rem)] max-w-sm">
          <Link
            href={`/alerts/open/${toast.id}`}
            onClick={() => setToast(null)}
            className={`block rounded-2xl border p-3 shadow-lg ${
              toast.severity === "CRITICAL"
                ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950"
                : toast.severity === "WARNING"
                  ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
                  : "border-line bg-surface"
            }`}
          >
            <p className="text-sm font-semibold">{toast.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{toast.body}</p>
          </Link>
        </div>
      )}
    </>
  );
}
