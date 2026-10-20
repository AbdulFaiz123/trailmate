import { formatTime, tzAbbrev, utcOffsetLabel } from "@/lib/time";

/**
 * A time shown in the zone of the place it happens, always with its zone
 * label. `dayShift` adds "+1" when the time falls on a later local date than
 * a reference (e.g. a flight that lands the next morning).
 */
export function LocalTime({
  date, tz, dayShift = 0, className = "",
}: { date: Date; tz: string; dayShift?: number; className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`} title={`${tz} (${utcOffsetLabel(date, tz)})`}>
      <span className="font-mono tabular-nums">{formatTime(date, tz)}</span>
      {dayShift > 0 && <sup className="ml-0.5 text-[10px] font-semibold text-accent">+{dayShift}</sup>}
      <span className="ml-1 text-[11px] font-medium text-muted">{tzAbbrev(date, tz)}</span>
    </span>
  );
}
