import Link from "next/link";
import type { Alert } from "@prisma/client";

/** The newest unread alerts for this trip, shown above "Next up". */
export function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="New alerts" className="space-y-2">
      {alerts.map((a) => (
        <Link
          key={a.id}
          href={`/alerts/open/${a.id}`}
          className={`block rounded-2xl border p-3 ${
            a.severity === "CRITICAL"
              ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/50"
              : a.severity === "WARNING"
                ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50"
                : "border-accent/40 bg-accent-soft"
          }`}
        >
          <p className="text-sm font-semibold">🔔 {a.title}</p>
          <p className="mt-0.5 text-xs text-muted">{a.body}</p>
          {a.action && <p className="mt-1 text-xs font-medium">→ {a.action}</p>}
        </Link>
      ))}
    </section>
  );
}
