import type { TimelineEntry } from "@/lib/timeline";
import { dayDiff, formatDuration, localDateKey, utcOffsetLabel } from "@/lib/time";
import { formatMoney, modeLabel, MODE_ICON, STAY_ICON } from "@/lib/format";
import { LocalTime } from "./LocalTime";

export function TimelineEntryCard({ entry, done }: { entry: TimelineEntry; done: boolean }) {
  const faded = done ? "opacity-55" : "";

  if (entry.kind === "LEG") {
    const { leg } = entry;
    const depKey = localDateKey(leg.departureAt, leg.fromTimeZone);
    const arrKey = localDateKey(leg.arrivalAt, leg.toTimeZone);
    const durationMin = (leg.arrivalAt.getTime() - leg.departureAt.getTime()) / 60_000;
    const crossesZones =
      utcOffsetLabel(leg.departureAt, leg.fromTimeZone) !== utcOffsetLabel(leg.arrivalAt, leg.toTimeZone);

    return (
      <article className={`rounded-2xl border border-line bg-surface p-3 ${faded}`}>
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>{MODE_ICON[leg.mode] ?? "➡️"}</span>
            <span className="font-medium text-foreground">{leg.number ?? modeLabel(leg.mode)}</span>
            {leg.carrier && <span>· {leg.carrier}</span>}
          </span>
          <span>{formatDuration(durationMin)}</span>
        </div>

        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <LocalTime date={leg.departureAt} tz={leg.fromTimeZone} />
          <span className="truncate">{leg.fromName}</span>
          <LocalTime date={leg.arrivalAt} tz={leg.toTimeZone} dayShift={dayDiff(depKey, arrKey)} />
          <span className="truncate">{leg.toName}</span>
        </div>

        {(leg.platform || leg.seat || leg.bookingRef || crossesZones) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {leg.platform && <Chip>{leg.mode === "FLIGHT" ? "Gate" : "Platform"} {leg.platform}</Chip>}
            {leg.seat && <Chip>Seat {leg.seat}</Chip>}
            {leg.bookingRef && <Chip mono>{leg.bookingRef}</Chip>}
            {crossesZones && (
              <Chip tone="accent">
                {utcOffsetLabel(leg.departureAt, leg.fromTimeZone)} → {utcOffsetLabel(leg.arrivalAt, leg.toTimeZone)}
              </Chip>
            )}
          </div>
        )}
      </article>
    );
  }

  if (entry.kind === "STAY_IN" || entry.kind === "STAY_OUT") {
    const { stay } = entry;
    const isIn = entry.kind === "STAY_IN";
    const nights = dayDiff(localDateKey(stay.checkInAt, stay.timeZone), localDateKey(stay.checkOutAt, stay.timeZone));
    return (
      <article className={`rounded-2xl border border-line bg-surface p-3 ${faded}`}>
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>{STAY_ICON[stay.kind] ?? "🛏️"}</span>
            <span className="font-medium text-foreground">{isIn ? "Check in" : "Check out"}</span>
          </span>
          {isIn && <span>{nights} night{nights === 1 ? "" : "s"}</span>}
        </div>
        <div className="mt-2 flex items-baseline gap-3 text-sm">
          <LocalTime date={entry.at} tz={stay.timeZone} />
          <span className="truncate font-medium">{stay.name}</span>
        </div>
        {isIn && (
          <>
            {stay.address && <p className="mt-1 text-xs text-muted">{stay.address}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {stay.latestCheckInAt && (
                <Chip>
                  Latest check-in <LocalTime date={stay.latestCheckInAt} tz={stay.timeZone} />
                </Chip>
              )}
              {stay.bookingRef && <Chip mono>{stay.bookingRef}</Chip>}
              {formatMoney(stay.costMinor, stay.currency) && <Chip>{formatMoney(stay.costMinor, stay.currency)}</Chip>}
            </div>
            {stay.notes && <p className="mt-2 text-xs text-muted">{stay.notes}</p>}
          </>
        )}
      </article>
    );
  }

  const { task } = entry;
  return (
    <article className={`flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/60 p-3 ${faded}`}>
      <span aria-hidden className="text-lg">{task.list === "BUY" ? "🛍️" : task.list === "PACK" ? "🧳" : "✅"}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className={`truncate font-medium ${done ? "line-through" : ""}`}>
          {task.list === "BUY" ? "Buy " : ""}
          {task.quantity > 1 ? `${task.quantity} × ` : ""}
          {task.name}
          {task.person && <span className="font-normal text-muted"> for {task.person.name}</span>}
        </p>
        <p className="text-xs text-muted">
          by <LocalTime date={entry.at} tz={entry.tz} />
        </p>
      </div>
    </article>
  );
}

function Chip({ children, mono, tone }: { children: React.ReactNode; mono?: boolean; tone?: "accent" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-background text-muted"
      } ${mono ? "font-mono" : ""}`}
    >
      {children}
    </span>
  );
}
