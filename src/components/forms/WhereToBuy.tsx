"use client";

import { useRef, useState } from "react";
import { Field, inputClass } from "@/components/form";

/**
 * Optional "where to buy" for a Buy item. Coordinates let Trailmate nudge you
 * when one of your stays is close to the shop. Paste them from Google Maps
 * (long-press a spot, tap the coordinates to copy) or use your current position.
 */
export function WhereToBuy({ defaults, error }: { defaults: Record<string, string>; error?: string }) {
  const locationRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  function useHere() {
    if (!("geolocation" in navigator)) return setStatus("Location isn't available in this browser.");
    setStatus("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locationRef.current) locationRef.current.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setStatus("");
      },
      () => setStatus("Couldn't get your location. Paste coordinates instead."),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <details className="rounded-2xl border border-line p-3" open={Boolean(defaults.placeName || defaults.location)}>
      <summary className="cursor-pointer text-sm font-medium">📍 Where to buy (optional)</summary>
      <div className="mt-3 space-y-3">
        <Field label="Shop">
          <input name="placeName" defaultValue={defaults.placeName} placeholder="Apollo Pharmacy, Banjara Hills" className={inputClass} />
        </Field>
        <Field label="Coordinates" hint="Paste from Google Maps, e.g. 17.4170, 78.4380" error={error}>
          <div className="flex gap-2">
            <input ref={locationRef} name="location" defaultValue={defaults.location} inputMode="decimal" className={inputClass} />
            <button type="button" onClick={useHere} className="shrink-0 rounded-xl border border-line px-3 text-sm">Here</button>
          </div>
        </Field>
        {status && <p className="text-xs text-muted">{status}</p>}
        <p className="text-xs text-muted">You’ll get a nudge when one of your stays is within 2 km of the shop.</p>
      </div>
    </details>
  );
}
