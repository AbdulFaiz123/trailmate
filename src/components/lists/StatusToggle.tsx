"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { enqueue, flushOutbox, OUTBOX_EVENT, readOutbox } from "@/lib/outbox";
import { nextTaskStatus } from "@/lib/task-status";

const UI: Record<string, { icon: string; label: string; next: string }> = {
  TO_BUY: { icon: "○", label: "To buy", next: "Mark as bought" },
  BOUGHT: { icon: "✓", label: "Bought", next: "Mark as packed" },
  PACKED: { icon: "🧳", label: "Packed", next: "Mark as not done" },
  TODO: { icon: "○", label: "Not packed", next: "Mark as packed" },
};

/** The status circle. Works offline: the tap is queued and synced later. */
export function StatusToggle({ tripId, taskId, list, status }: { tripId: string; taskId: string; list: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  // What we showed after the tap, until the server's fresh status arrives.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  useEffect(() => setOptimistic(null), [status]);

  useEffect(() => {
    const read = () => {
      const op = readOutbox().find((o) => o.kind === "setStatus" && o.taskId === taskId);
      setPending(op && op.kind === "setStatus" ? op.status : null);
    };
    read();
    window.addEventListener(OUTBOX_EVENT, read);
    return () => window.removeEventListener(OUTBOX_EVENT, read);
  }, [taskId]);

  const current = pending ?? optimistic ?? status;
  const ui = UI[current] ?? UI.TODO;

  return (
    <button
      type="button"
      aria-label={`${ui.label}. ${ui.next}`}
      title={pending ? `${ui.next} (waiting to sync)` : ui.next}
      onClick={async () => {
        const next = nextTaskStatus(list, current);
        setOptimistic(next);
        enqueue({ kind: "setStatus", tripId, taskId, status: next });
        if ((await flushOutbox()) > 0) router.refresh(); // update counts and bag weights
      }}
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center text-lg ${
        current === "PACKED" ? "" : current === "BOUGHT" ? "font-bold text-accent" : "text-muted"
      }`}
    >
      {ui.icon}
      {pending && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" />}
    </button>
  );
}
