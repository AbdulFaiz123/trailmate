import Link from "next/link";
import { prisma } from "@/lib/db";
import { markAllAlertsRead } from "../alert-actions";
import { relativeFromNow } from "@/lib/time";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = {
  BUY_BY: "🛍️", NEARBY_SHOP: "📍", PACKING: "🧳", LEAVE_NOW: "🏃", CHECK_IN: "🛂",
  DELAY: "⏱️", CANCELLATION: "⛔", PLATFORM_CHANGE: "🔀", MISSED_CONNECTION: "⚠️",
};

export default async function AlertsPage() {
  const now = new Date();
  const alerts = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { trip: { select: { name: true } } } });
  const unread = alerts.filter((a) => !a.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        {unread > 0 && (
          <form action={markAllAlertsRead}>
            <button type="submit" className="text-sm font-medium text-accent">Mark all read</button>
          </form>
        )}
      </div>
      {alerts.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No alerts yet. Reminders appear here when they’re due.
        </p>
      )}
      <ul className="space-y-2">
        {alerts.map((a) => {
          const stale = a.expiresAt != null && a.expiresAt < now;
          return (
            <li key={a.id}>
              <Link
                href={`/alerts/open/${a.id}`}
                className={`block rounded-2xl border p-3 ${a.readAt || stale ? "border-line bg-surface/50 opacity-70" : "border-accent/50 bg-surface"}`}
              >
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-lg leading-6">{ICON[a.type] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${a.readAt ? "" : "font-semibold"}`}>{a.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{a.body}</p>
                    {a.action && <p className="mt-1 text-xs font-medium text-accent">→ {a.action}</p>}
                    <p className="mt-1 text-[11px] text-muted">
                      {a.trip.name} · {relativeFromNow(a.createdAt, now)}
                      {a.pushedAt ? " · sent as a notification" : ""}
                      {stale ? " · no longer relevant" : ""}
                    </p>
                  </div>
                  {!a.readAt && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
