import type { Severity, TripWarning } from "@/lib/checks";

const STYLE: Record<Severity, { box: string; icon: string }> = {
  CRITICAL: { box: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40", icon: "⛔" },
  WARNING: { box: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40", icon: "⚠️" },
  INFO: { box: "border-line bg-surface", icon: "ℹ️" },
};

export function TripChecks({ warnings, tripId, title = "Trip checks" }: { warnings: TripWarning[]; tripId: string; title?: string }) {
  if (warnings.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-3 text-sm">
        <span aria-hidden>✅</span> All nights covered and every connection looks fine.
      </p>
    );
  }
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold">{title} · {warnings.length}</h2>
      <ul className="space-y-2">
        {warnings.map((w) => {
          const s = STYLE[w.severity];
          const href = w.href
            ? `/trips/${tripId}/${w.href}`
            : w.itemKind
              ? `/trips/${tripId}#${w.itemKind.toLowerCase()}-${w.itemId}`
              : undefined;
          const body = (
            <>
              <p className="text-sm font-medium">
                <span aria-hidden className="mr-1">{s.icon}</span>
                {w.title}
              </p>
              <p className="mt-0.5 text-xs text-muted">{w.detail}</p>
            </>
          );
          return (
            <li key={w.id} className={`rounded-2xl border p-3 ${s.box}`}>
              {href ? <a href={href} className="block">{body}</a> : body}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Inline warning shown under a timeline card. */
export function InlineWarning({ warning }: { warning: TripWarning }) {
  const s = STYLE[warning.severity];
  return (
    <p className={`mt-1 rounded-xl border px-3 py-2 text-xs ${s.box}`}>
      <span aria-hidden className="mr-1">{s.icon}</span>
      {warning.title}
    </p>
  );
}
