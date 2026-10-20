import type { TimelineEntry } from "@/lib/timeline";
import { formatDay, relativeFromNow } from "@/lib/time";
import { modeLabel, MODE_ICON, STAY_ICON } from "@/lib/format";
import { LocalTime } from "./LocalTime";

function describe(entry: TimelineEntry): { icon: string; title: string; subtitle: string } {
  switch (entry.kind) {
    case "LEG": {
      const { leg } = entry;
      const what = leg.number ?? modeLabel(leg.mode);
      return {
        icon: MODE_ICON[leg.mode] ?? "➡️",
        title: `${what} to ${leg.toName}`,
        subtitle: `Departs ${leg.fromName}${leg.platform ? ` · ${leg.mode === "FLIGHT" ? "gate" : "platform"} ${leg.platform}` : ""}`,
      };
    }
    case "STAY_IN":
      return { icon: STAY_ICON[entry.stay.kind] ?? "🛏️", title: `Check in: ${entry.stay.name}`, subtitle: entry.stay.address ?? "" };
    case "STAY_OUT":
      return { icon: STAY_ICON[entry.stay.kind] ?? "🛏️", title: `Check out: ${entry.stay.name}`, subtitle: "" };
    case "TASK": {
      const t = entry.task;
      return {
        icon: t.list === "BUY" ? "🛍️" : "🧳",
        title: `${t.list === "BUY" ? "Buy" : "Do"}: ${t.quantity > 1 ? `${t.quantity} × ` : ""}${t.name}`,
        subtitle: t.person ? `For ${t.person.name}` : t.notes ?? "",
      };
    }
  }
}

export function NextUpCard({
  next, current, now, isEmpty,
}: { next: TimelineEntry | null; current: TimelineEntry | null; now: Date; isEmpty: boolean }) {
  if (!next) {
    return (
      <section className="rounded-3xl bg-accent-soft p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next up</p>
        <p className="mt-1 text-sm">
          {isEmpty ? "Add a stay, a leg or a buy-by date to see what comes next." : "Nothing left on this trip. Welcome home!"}
        </p>
      </section>
    );
  }

  const d = describe(next);
  const overdue = next.at < now;

  return (
    <section className="rounded-3xl bg-accent p-4 text-white shadow-sm dark:text-[#04201c]">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide opacity-85">
        <span>{overdue ? "Overdue" : "Next up"}</span>
        <span className="normal-case">{relativeFromNow(next.at, now)}</span>
      </div>
      <div className="mt-2 flex gap-3">
        <span aria-hidden className="text-2xl leading-none">{d.icon}</span>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug">{d.title}</p>
          {d.subtitle && <p className="mt-0.5 truncate text-sm opacity-85">{d.subtitle}</p>}
          <p className="mt-2 text-sm">
            {formatDay(next.at, next.tz)} ·{" "}
            <LocalTime date={next.at} tz={next.tz} className="[&_span]:!text-inherit" />
          </p>
        </div>
      </div>
      {current && (
        <p className="mt-3 border-t border-white/25 pt-2 text-xs opacity-85">
          Right now:{" "}
          {current.kind === "LEG"
            ? `on ${current.leg.number ?? modeLabel(current.leg.mode)} to ${current.leg.toName}`
            : current.kind === "STAY_IN"
              ? `staying at ${current.stay.name}`
              : ""}
        </p>
      )}
    </section>
  );
}
