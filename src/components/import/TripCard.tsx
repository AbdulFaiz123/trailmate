"use client";

import type { DraftTrip } from "@/lib/import/draft";

const input = "w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

/** Form values (strings) from a draft's trip details. */
export function tripFieldsFrom(t: DraftTrip): Record<string, string> {
  return {
    name: t.name ?? "", origin: t.origin ?? "", destination: t.destination ?? "",
    originCountry: t.originCountry ?? "", destinationCountry: t.destinationCountry ?? "",
    startDate: t.startDate ?? "", endDate: t.endDate ?? "",
    homeCurrency: t.homeCurrency ?? "EUR", homeTimeZone: t.homeTimeZone ?? "Europe/Berlin",
  };
}

/** The new trip's details, editable, at the top of the review screen. */
export function TripCard({ fields, setFields, zones, error }: {
  fields: Record<string, string>; setFields: (f: Record<string, string>) => void; zones: string[]; error?: boolean;
}) {
  const f = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => (
    <label className={`block space-y-0.5 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] text-muted">{label}</span>
      <input className={input} value={fields[key] ?? ""} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} {...props} />
    </label>
  );
  return (
    <section aria-label="New trip" className={`rounded-2xl border-2 p-3 ${error ? "border-red-400" : "border-accent"} bg-accent-soft/40`}>
      <p className="text-sm font-semibold">🧭 Your new trip</p>
      <p className="mb-2 text-[11px] text-muted">Check the details. Missing ones are filled from your legs; fix anything that’s off.</p>
      <div className="grid grid-cols-2 gap-2">
        {f("name", "Trip name", { placeholder: "Family visit to Hyderabad" }, true)}
        {f("origin", "From", { placeholder: "Berlin, Germany" })}
        {f("destination", "To", { placeholder: "Hyderabad, India" })}
        {f("originCountry", "Home country", { maxLength: 2, placeholder: "DE", className: `${input} uppercase` })}
        {f("destinationCountry", "Destination country", { maxLength: 2, placeholder: "IN", className: `${input} uppercase` })}
        {f("startDate", "Leave on", { type: "date" })}
        {f("endDate", "Back on", { type: "date" })}
        {f("homeCurrency", "Home currency", { maxLength: 3, className: `${input} uppercase` })}
        {f("homeTimeZone", "Home time zone", { list: "trip-zones" })}
      </div>
      <datalist id="trip-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
    </section>
  );
}
