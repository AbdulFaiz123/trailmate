import type { BagSummary } from "@/lib/baggage";
import { NEAR_LIMIT } from "@/lib/baggage";
import { BaggageForm } from "./BaggageForm";

const kg = (g: number) => (g / 1000).toFixed(1);

function Meter({ s }: { s: BagSummary }) {
  const label = s.bag === "CHECKED" ? "Checked bag" : "Cabin bag";
  const allowance = s.allowanceG;
  const ratio = allowance ? s.plannedG / allowance : 0;
  const tone = !allowance ? "bg-muted" : ratio > 1 ? "bg-red-500" : ratio >= NEAR_LIMIT ? "bg-amber-500" : "bg-accent";
  const pct = (g: number) => `${Math.min(100, allowance ? (g / allowance) * 100 : 0)}%`;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          <span className={ratio > 1 ? "font-semibold text-red-600 dark:text-red-400" : "font-semibold"}>{kg(s.plannedG)}</span>
          <span className="text-muted"> / {allowance ? `${kg(allowance)} kg` : "no limit set"}</span>
        </span>
      </div>
      <div
        className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label={`${label} weight`}
        aria-valuemin={0}
        aria-valuemax={allowance ?? undefined}
        aria-valuenow={s.plannedG}
      >
        {/* planned (light) with packed (solid) on top */}
        <div className={`absolute inset-y-0 left-0 ${tone} opacity-35`} style={{ width: pct(s.plannedG) }} />
        <div className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: pct(s.packedG) }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {kg(s.packedG)} kg packed · {s.itemCount} items · bag itself {kg(s.tareG)} kg
        {s.missingWeight > 0 && <> · <span className="text-amber-700 dark:text-amber-400">{s.missingWeight} without weight</span></>}
      </p>
    </div>
  );
}

export function BaggageCard({ tripId, checked, cabin }: { tripId: string; checked: BagSummary; cabin: BagSummary }) {
  return (
    <section aria-label="Baggage" className="space-y-3 rounded-2xl border border-line bg-surface p-3">
      <Meter s={checked} />
      <Meter s={cabin} />
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-accent">Edit allowance & bag weights</summary>
        <BaggageForm
          tripId={tripId}
          defaults={{
            checkedAllowance: checked.allowanceG ? kg(checked.allowanceG) : "",
            cabinAllowance: cabin.allowanceG ? kg(cabin.allowanceG) : "",
            checkedTare: kg(checked.tareG),
            cabinTare: kg(cabin.tareG),
          }}
        />
      </details>
    </section>
  );
}
