"use client";

import { useState, useTransition } from "react";
import { checkLegNow } from "@/app/trips/live-actions";

export function CheckNowButton({ tripId, legId }: { tripId: string; legId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setMessage((await checkLegNow(tripId, legId)).message ?? ""))}
        className="rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check live status now"}
      </button>
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </div>
  );
}
