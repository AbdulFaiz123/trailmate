import type { CustomsReminder } from "@/lib/rules";

const TONE = {
  CRITICAL: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
  WARNING: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  INFO: "border-line bg-surface",
} as const;
const ICON = { CRITICAL: "⛔", WARNING: "⚠️", INFO: "ℹ️" } as const;
const KIND_LABEL = { entry: "Arriving", return: "Coming home", airline: "Airline" } as const;

export function CustomsCard({ reminders }: { reminders: CustomsReminder[] }) {
  if (reminders.length === 0) return null;
  return (
    <section aria-label="Customs and airline reminders" className="space-y-2">
      <h2 className="text-sm font-semibold">Customs & airline reminders</h2>
      <p className="text-[11px] leading-snug text-muted">
        Rough reminders to help you check, <strong>not legal advice</strong>. Rules and limits change: always check the official source before you fly.
      </p>
      <ul className="space-y-2">
        {reminders.map((r) => (
          <li key={r.id} className={`rounded-2xl border p-3 ${TONE[r.severity]}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{KIND_LABEL[r.kind]}</p>
            <p className="text-sm font-medium">
              <span aria-hidden className="mr-1">{ICON[r.severity]}</span>
              {r.title}
            </p>
            <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
            {r.finding && <p className="mt-1.5 text-xs font-medium">{r.finding}</p>}
            {r.sourceUrl ? (
              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-medium text-accent underline">
                Check official rules: {r.sourceLabel} ↗
              </a>
            ) : (
              r.sourceLabel && <p className="mt-1.5 text-xs text-muted">Check {r.sourceLabel}.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
