import Link from "next/link";
import type { Alert } from "@prisma/client";

/** Big banner for the newest live disruption on this trip, with the suggested action. */
export function DisruptionBanner({ alert }: { alert: Alert | null }) {
  if (!alert) return null;
  const critical = alert.severity === "CRITICAL";
  return (
    <section
      aria-label="Disruption"
      role="alert"
      className={`rounded-3xl border-2 p-4 ${critical ? "border-red-500 bg-red-50 dark:bg-red-950/60" : "border-amber-500 bg-amber-50 dark:bg-amber-950/60"}`}
    >
      <p className={`text-xs font-bold uppercase tracking-wide ${critical ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
        {critical ? "⛔ Disruption" : "⚠️ Disruption"}
      </p>
      <p className="mt-1 text-base font-semibold leading-snug">{alert.title}</p>
      <p className="mt-1 text-sm">{alert.body}</p>
      {alert.action && (
        <p className={`mt-3 inline-block rounded-full px-3 py-1.5 text-sm font-semibold text-white ${critical ? "bg-red-600" : "bg-amber-600"}`}>
          → {alert.action}
        </p>
      )}
      {alert.itemId && (
        <Link href={`/trips/${alert.tripId}/legs/${alert.itemId}#live`} className="mt-3 block text-xs font-medium underline">
          See live status
        </Link>
      )}
    </section>
  );
}
