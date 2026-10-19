import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildTimeline, findNextUp, groupByDay, isEntryDone } from "@/lib/timeline";
import { dayDiff, formatDay, localDateKey } from "@/lib/time";
import { NextUpCard } from "@/components/NextUpCard";
import { TimelineEntryCard } from "@/components/TimelineEntryCard";
import { ConnectionLine } from "@/components/ConnectionLine";
import { InlineWarning, TripChecks } from "@/components/TripChecks";
import { runTripChecks, type TripWarning } from "@/lib/checks";
import { baggageWarnings, summarizeBag } from "@/lib/baggage";
import { customsReminders } from "@/lib/rules";
import { TripTabs } from "@/components/TripTabs";
import { ScrollToSaved } from "@/components/ScrollToSaved";
import type { TimelineEntry } from "@/lib/timeline";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      legs: true,
      stays: true,
      dependencies: true,
      tasks: { include: { person: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!trip) notFound();

  const now = new Date();
  const entries = buildTimeline(trip);
  const days = groupByDay(entries);
  const { next, current } = findNextUp(entries, now);
  const { connections, warnings: timelineWarnings } = runTripChecks(trip);
  // Lists feed the same "Trip checks" panel: overweight bags and serious
  // customs/airline problems (e.g. a power bank in the checked bag).
  const listWarnings: TripWarning[] = [
    ...baggageWarnings([summarizeBag(trip, trip.tasks, "CHECKED"), summarizeBag(trip, trip.tasks, "CABIN")]),
    ...customsReminders(trip, trip.tasks)
      .filter((r) => r.severity !== "INFO")
      .map((r) => ({
        id: `customs-${r.id}`, type: "CUSTOMS" as const, severity: r.severity, title: r.title,
        detail: r.finding ?? r.detail, href: "lists",
      })),
  ];
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const warnings = [...timelineWarnings, ...listWarnings].sort((a, b) => order[a.severity] - order[b.severity]);
  const connectionAfter = new Map(connections.map((c) => [c.fromLegId, c]));

  const buyLeft = trip.tasks.filter((t) => t.list === "BUY" && t.status === "TO_BUY").length;
  const packLeft = trip.tasks.filter((t) => t.list === "PACK" && t.status !== "PACKED").length;
  const todayKey = localDateKey(now, trip.homeTimeZone);
  const daysToGo = dayDiff(todayKey, trip.startDate);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-xs text-muted">← All trips</Link>
        <h1 className="mt-1 text-xl font-semibold leading-tight">{trip.name}</h1>
        <p className="text-sm text-muted">
          {trip.origin} → {trip.destination}
        </p>
        <p className="mt-1 text-xs text-muted">
          {trip.startDate} – {trip.endDate}
          {daysToGo > 0 && <> · leaves in {daysToGo} day{daysToGo === 1 ? "" : "s"}</>}
        </p>
      </div>

      <TripTabs tripId={trip.id} active="timeline" />
      <ScrollToSaved target={saved} />
      <NextUpCard next={next} current={current} now={now} isEmpty={entries.length === 0} />

      <TripChecks warnings={warnings} tripId={trip.id} />

      <dl className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Legs" value={trip.legs.length} />
        <Stat label="Stays" value={trip.stays.length} />
        <Stat label="To buy" value={buyLeft} href={`/trips/${trip.id}/lists?tab=BUY`} />
        <Stat label="To pack" value={packLeft} href={`/trips/${trip.id}/lists?tab=PACK`} />
      </dl>

      <section aria-label="Timeline" className="space-y-5">
        {days.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
            No stays, legs or deadlines yet.
          </p>
        )}
        {days.map((day) => {
          const n = dayDiff(trip.startDate, day.dateKey);
          const label = n < 0 ? "Before you leave" : `Day ${n + 1}`;
          const isToday = day.dateKey === todayKey;
          return (
            <div key={day.dateKey}>
              <h2 className="sticky top-[53px] z-[5] -mx-4 flex items-baseline justify-between bg-background/95 px-4 py-1.5 backdrop-blur">
                <span className="text-sm font-semibold">
                  {formatDay(day.entries[0].at, day.tz)}
                  {isToday && <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">Today</span>}
                </span>
                <span className="text-xs text-muted">{label}</span>
              </h2>
              <ol className="mt-2 space-y-2">
                {day.entries.map((entry) => {
                  const link = editLink(trip.id, entry);
                  const card = <TimelineEntryCard entry={entry} done={isEntryDone(entry, now)} />;
                  const connection = entry.kind === "LEG" ? connectionAfter.get(entry.leg.id) : undefined;
                  const stayWarnings =
                    entry.kind === "STAY_IN" ? warnings.filter((w) => w.itemKind === "STAY" && w.itemId === entry.stay.id) : [];
                  return (
                    <li key={entry.key} id={anchor(entry)} className="scroll-mt-28">
                      {link ? <Link href={link} className="block active:scale-[0.99]">{card}</Link> : card}
                      {stayWarnings.map((w) => <InlineWarning key={w.id} warning={w} />)}
                      {connection && <ConnectionLine connection={connection} />}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </section>

      <nav
        aria-label="Add to trip"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md gap-2 border-t border-line bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
      >
        <Link href={`/trips/${trip.id}/legs/new`} className="flex-1 rounded-full bg-accent py-3 text-center text-sm font-semibold text-white dark:text-[#04201c]">
          + Leg
        </Link>
        <Link href={`/trips/${trip.id}/stays/new`} className="flex-1 rounded-full border border-accent py-3 text-center text-sm font-semibold text-accent">
          + Stay
        </Link>
      </nav>
    </div>
  );
}

function anchor(entry: TimelineEntry): string | undefined {
  if (entry.kind === "LEG") return `leg-${entry.leg.id}`;
  if (entry.kind === "STAY_IN") return `stay-${entry.stay.id}`;
  return undefined;
}

function editLink(tripId: string, entry: TimelineEntry): string | null {
  if (entry.kind === "LEG") return `/trips/${tripId}/legs/${entry.leg.id}`;
  if (entry.kind === "STAY_IN" || entry.kind === "STAY_OUT") return `/trips/${tripId}/stays/${entry.stay.id}`;
  return null;
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-muted">{label}</dt>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border border-line bg-surface py-2">{body}</Link>
  ) : (
    <div className="rounded-xl border border-line bg-surface py-2">{body}</div>
  );
}
