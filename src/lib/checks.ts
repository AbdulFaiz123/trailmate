// Trip checks: pure functions that look at legs + stays and report problems.
//
// They take plain objects and return plain objects, with no database and no
// clock unless you pass one, so they are easy to unit-test. Step 5 (live disruption
// tracking) reuses exactly the same functions: a delay just changes
// `departureDelayMin` / `arrivalDelayMin`, and we run the checks again.
import type { Dependency, Leg, Stay } from "@prisma/client";
import { addDays } from "date-fns";
import { formatDay, formatDuration, formatTime, localToUtc, tzAbbrev, utcOffsetLabel } from "./time";

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export type TripWarning = {
  id: string; // stable, so the UI (and later, alerts) can de-duplicate
  type: "GAP" | "OVERLAP" | "LATE_ARRIVAL" | "EARLY_ARRIVAL" | "TIGHT_CONNECTION" | "BROKEN_CONNECTION";
  severity: Severity;
  title: string;
  detail: string;
  itemKind?: "LEG" | "STAY";
  itemId?: string;
};

export type Connection = {
  fromLegId: string;
  toLegId: string;
  transferMin: number; // can be negative when the next leg leaves before you arrive
  requiredMin: number; // below this you will miss it
  tightMin: number; // below this it is risky
  status: "OK" | "TIGHT" | "BROKEN";
  reason?: string;
};

type LegLike = Pick<
  Leg,
  | "id" | "mode" | "fromName" | "toName" | "fromTimeZone" | "toTimeZone" | "departureAt" | "arrivalAt"
  | "departureDelayMin" | "arrivalDelayMin" | "status" | "number"
>;
type StayLike = Pick<Stay, "id" | "name" | "timeZone" | "checkInAt" | "latestCheckInAt" | "checkOutAt">;
type DepLike = Pick<Dependency, "fromKind" | "fromId" | "toKind" | "toId" | "minBufferMin">;

const MIN = 60_000;
const HOUR = 60 * MIN;

// Two legs only count as a "connection" if the second one leaves within this
// window after the first arrives, with no stay in between.
const CONNECTION_WINDOW_MS = 12 * HOUR;
// Waiting between two legs for up to this long counts as "in transit" for the
// night check (e.g. a few hours at the airport before a 02:35 flight).
const LAYOVER_MAX_MS = 6 * HOUR;

/** Departure/arrival including any live delay. */
export function effectiveDeparture(leg: LegLike): Date {
  return new Date(leg.departureAt.getTime() + leg.departureDelayMin * MIN);
}
export function effectiveArrival(leg: LegLike): Date {
  return new Date(leg.arrivalAt.getTime() + leg.arrivalDelayMin * MIN);
}

function isInternational(leg: LegLike): boolean {
  // We don't store countries per stop, so "different UTC offset" is our proxy.
  // It is right for Germany <-> India; Phase 2 adds real airport/country data.
  return utcOffsetLabel(leg.departureAt, leg.fromTimeZone) !== utcOffsetLabel(leg.arrivalAt, leg.toTimeZone);
}

/**
 * Minimum transfer times.
 * - tight: below this we warn ("risky")
 * - required: below this the connection is broken ("you will miss it")
 *   An explicit Dependency.minBufferMin overrides the default.
 */
export function transferRules(a: LegLike, b: LegLike, dep?: DepLike): { tightMin: number; requiredMin: number } {
  let tightMin: number;
  let requiredMin: number;

  if (b.mode === "FLIGHT") {
    tightMin = isInternational(b) ? 90 : 45;
    requiredMin = isInternational(b) ? 60 : 30; // bag drop / gate closes
  } else if (b.mode === "TRAIN" || b.mode === "BUS" || b.mode === "FERRY") {
    tightMin = 15;
    requiredMin = 3;
  } else {
    tightMin = 5;
    requiredMin = 0;
  }
  // Getting off a plane takes time: passport control, bags.
  if (a.mode === "FLIGHT") {
    tightMin = Math.max(tightMin, 45);
    requiredMin = Math.max(requiredMin, 20);
  }
  if (dep) requiredMin = dep.minBufferMin;
  return { tightMin: Math.max(tightMin, requiredMin), requiredMin };
}

function findDependency(deps: DepLike[], fromKind: string, fromId: string, toKind: string, toId: string) {
  return deps.find((d) => d.fromKind === fromKind && d.fromId === fromId && d.toKind === toKind && d.toId === toId);
}

/** Pair up consecutive legs and measure each transfer. */
export function findConnections(legs: LegLike[], stays: StayLike[], deps: DepLike[] = []): Connection[] {
  const sorted = [...legs].sort((x, y) => x.departureAt.getTime() - y.departureAt.getTime());
  const result: Connection[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const arr = effectiveArrival(a);
    const dep = effectiveDeparture(b);
    const dependency = findDependency(deps, "LEG", a.id, "LEG", b.id);

    // Not a connection if there is a long gap or a night at a stay in between,
    // unless the user explicitly linked them with a Dependency.
    const stayBetween = stays.some((s) => s.checkInAt >= a.arrivalAt && s.checkInAt <= b.departureAt);
    if (!dependency && (dep.getTime() - arr.getTime() > CONNECTION_WINDOW_MS || stayBetween)) continue;

    const transferMin = Math.round((dep.getTime() - arr.getTime()) / MIN);
    const { tightMin, requiredMin } = transferRules(a, b, dependency);

    let status: Connection["status"] = "OK";
    let reason: string | undefined;
    if (a.status === "CANCELLED" || b.status === "CANCELLED") {
      status = "BROKEN";
      reason = `${legName(a.status === "CANCELLED" ? a : b)} is cancelled`;
    } else if (transferMin < requiredMin) {
      status = "BROKEN";
      reason =
        transferMin < 0
          ? `${legName(b)} leaves ${formatDuration(-transferMin)} before you arrive`
          : `${transferMin} min is less than the ${requiredMin} min you need`;
    } else if (transferMin < tightMin) {
      status = "TIGHT";
      reason = `under ${tightMin} min for ${b.mode === "FLIGHT" ? "a flight" : "this change"}`;
    }
    result.push({ fromLegId: a.id, toLegId: b.id, transferMin, requiredMin, tightMin, status, reason });
  }
  return result;
}

export function legName(leg: Pick<LegLike, "number" | "mode" | "toName">): string {
  return leg.number ?? `${leg.mode.charAt(0)}${leg.mode.slice(1).toLowerCase()} to ${leg.toName}`;
}

/** Which time zone is the traveler in at instant `t`? */
function zoneAt(t: Date, legs: LegLike[], homeTz: string): string {
  let tz = homeTz;
  for (const leg of legs) {
    if (leg.departureAt > t) break;
    tz = leg.arrivalAt <= t ? leg.toTimeZone : leg.fromTimeZone;
  }
  return tz;
}

function isInTransit(t: Date, legs: LegLike[]): boolean {
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (effectiveDeparture(leg) <= t && effectiveArrival(leg) >= t) return true; // on board
    const next = legs[i + 1];
    if (next && effectiveArrival(leg) <= t && effectiveDeparture(next) >= t) {
      const wait = effectiveDeparture(next).getTime() - effectiveArrival(leg).getTime();
      if (wait <= LAYOVER_MAX_MS) return true; // short layover
    }
  }
  return false;
}

/**
 * Check every night of the trip. "The night of the 27th" is tested at 02:00
 * local time on the 28th, in whatever zone the traveler is in at that moment.
 */
export function checkNights(input: {
  startDate: string;
  endDate: string;
  homeTimeZone: string;
  legs: LegLike[];
  stays: StayLike[];
}): TripWarning[] {
  const legs = [...input.legs].sort((x, y) => x.departureAt.getTime() - y.departureAt.getTime());
  const warnings: TripWarning[] = [];
  const gapNights: Night[] = [];
  const overlapNights: (Night & { stays: StayLike[] })[] = [];

  const start = new Date(`${input.startDate}T12:00:00Z`);
  const end = new Date(`${input.endDate}T12:00:00Z`);
  for (let day = start; day < end; day = addDays(day, 1)) {
    const dateKey = day.toISOString().slice(0, 10);
    const morning = addDays(day, 1).toISOString().slice(0, 10);
    const guess = localToUtc(morning, "02:00", input.homeTimeZone);
    const tz = zoneAt(guess, legs, input.homeTimeZone);
    const t = localToUtc(morning, "02:00", tz);

    const staysTonight = input.stays.filter((s) => s.checkInAt <= t && s.checkOutAt > t);
    if (staysTonight.length > 1) {
      overlapNights.push({ dateKey, at: day, stays: staysTonight });
    } else if (staysTonight.length === 0 && !isInTransit(t, legs)) {
      gapNights.push({ dateKey, at: day });
    }
  }

  for (const run of consecutiveRuns(gapNights, () => "gap")) {
    warnings.push({
      id: `gap-${run.first.dateKey}`,
      type: "GAP",
      severity: "WARNING",
      title: `No place to sleep ${describeNights(run)}`,
      detail: "Add a stay, or a leg if you are travelling overnight.",
    });
  }

  const staysKey = (n: (typeof overlapNights)[number]) => n.stays.map((s) => s.id).join("+");
  for (const run of consecutiveRuns(overlapNights, staysKey)) {
    warnings.push({
      id: `overlap-${run.first.dateKey}`,
      type: "OVERLAP",
      severity: "WARNING",
      title: `Two stays ${describeNights(run)}`,
      detail: `${run.first.stays.map((s) => s.name).join(" and ")} both cover ${run.count === 1 ? "this night" : "these nights"}. Are you paying twice?`,
      itemKind: "STAY",
      itemId: run.first.stays[1].id,
    });
  }
  return warnings;
}

type Night = { dateKey: string; at: Date };

/** Group nights that follow each other (and share the same key) into runs. */
function consecutiveRuns<T extends Night>(nights: T[], key: (n: T) => string) {
  const runs: { first: T; last: T; count: number }[] = [];
  for (const night of nights) {
    const run = runs[runs.length - 1];
    if (run && addDays(run.last.at, 1).getTime() === night.at.getTime() && key(run.last) === key(night)) {
      run.last = night;
      run.count++;
    } else {
      runs.push({ first: night, last: night, count: 1 });
    }
  }
  return runs;
}

function describeNights(run: { first: Night; last: Night; count: number }): string {
  return run.count === 1
    ? `on the night of ${formatDay(run.first.at, "UTC")}`
    : `for ${run.count} nights (${formatDay(run.first.at, "UTC")} – ${formatDay(run.last.at, "UTC")})`;
}

/** Find the leg that brings you to a stay. */
function arrivalLegFor(stay: StayLike, legs: LegLike[], deps: DepLike[]): LegLike | undefined {
  const linked = deps.find((d) => d.toKind === "STAY" && d.toId === stay.id && d.fromKind === "LEG");
  if (linked) return legs.find((l) => l.id === linked.fromId);
  // Fallback: the first leg that arrives between 18 h before check-in and
  // check-out. Legs later in the stay (day trips) are ignored.
  return [...legs]
    .filter((l) => l.arrivalAt <= stay.checkOutAt && l.arrivalAt.getTime() >= stay.checkInAt.getTime() - 18 * HOUR)
    .sort((x, y) => x.arrivalAt.getTime() - y.arrivalAt.getTime())[0];
}

export function checkStayArrivals(stays: StayLike[], legs: LegLike[], deps: DepLike[] = []): TripWarning[] {
  const warnings: TripWarning[] = [];
  for (const stay of stays) {
    const leg = arrivalLegFor(stay, legs, deps);
    if (!leg) continue;
    const arr = effectiveArrival(leg);
    const at = (d: Date) => `${formatTime(d, stay.timeZone)} ${tzAbbrev(d, stay.timeZone)}`;

    if (stay.latestCheckInAt && arr > stay.latestCheckInAt) {
      warnings.push({
        id: `late-${stay.id}`,
        type: "LATE_ARRIVAL",
        severity: "CRITICAL",
        title: `You arrive after check-in closes at ${stay.name}`,
        detail: `${legName(leg)} gets you there at ${at(arr)}, but the latest check-in is ${at(stay.latestCheckInAt)}. Tell the host or arrange a late check-in.`,
        itemKind: "STAY",
        itemId: stay.id,
      });
    } else if (stay.checkInAt.getTime() - arr.getTime() > 3 * HOUR) {
      warnings.push({
        id: `early-${stay.id}`,
        type: "EARLY_ARRIVAL",
        severity: "INFO",
        title: `Early arrival at ${stay.name}`,
        detail: `You arrive ${at(arr)}, check-in is from ${at(stay.checkInAt)} (${formatDuration((stay.checkInAt.getTime() - arr.getTime()) / MIN)} wait). Ask for early check-in or luggage storage.`,
        itemKind: "STAY",
        itemId: stay.id,
      });
    }
  }
  return warnings;
}

export function connectionWarnings(connections: Connection[], legs: LegLike[]): TripWarning[] {
  const byId = new Map(legs.map((l) => [l.id, l]));
  return connections
    .filter((c) => c.status !== "OK")
    .map((c) => {
      const a = byId.get(c.fromLegId)!;
      const b = byId.get(c.toLegId)!;
      const where = a.toName;
      return {
        id: `conn-${c.fromLegId}-${c.toLegId}`,
        type: c.status === "BROKEN" ? "BROKEN_CONNECTION" : "TIGHT_CONNECTION",
        severity: c.status === "BROKEN" ? "CRITICAL" : "WARNING",
        title:
          c.status === "BROKEN"
            ? `You will miss ${legName(b)}`
            : `Tight connection: ${c.transferMin} min at ${where}`,
        detail: `${legName(a)} → ${legName(b)}: ${c.reason}.`,
        itemKind: "LEG",
        itemId: b.id,
      } satisfies TripWarning;
    });
}

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

/** Run every check for a trip. */
export function runTripChecks(input: {
  startDate: string;
  endDate: string;
  homeTimeZone: string;
  legs: LegLike[];
  stays: StayLike[];
  dependencies?: DepLike[];
}) {
  const deps = input.dependencies ?? [];
  const connections = findConnections(input.legs, input.stays, deps);
  const warnings = [
    ...connectionWarnings(connections, input.legs),
    ...checkStayArrivals(input.stays, input.legs, deps),
    ...checkNights(input),
  ].sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  return { connections, warnings };
}
