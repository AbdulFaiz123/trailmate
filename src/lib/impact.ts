// Impact check: a leg changed (delay, cancellation, platform). What does it
// break, and what should the traveler do?
//
//   "Your ICE 597 is +40 min (now arrives 14:45 CET). You will miss the 14:16
//    S8. Your flight LH 752 is still reachable via the S8 at 15:01 (arrives
//    15:13, 2h 17m before departure)."
//
// Pure functions. The connection maths is the same findConnections() the
// trip checks use; a delay simply shifts effective times.
import type { Dependency, Leg, Stay } from "@prisma/client";
import {
  checkStayArrivals, effectiveArrival, effectiveDeparture, findConnections, legName, transferRules, type Severity,
} from "./checks";
import { formatDuration, formatTime, tzAbbrev } from "./time";

export type Alternative = {
  departureAt: Date;
  arrivalAt: Date;
  label: string;
  platform?: string | null;
  source: "live" | "estimate";
};

export type Impact = {
  legId: string;
  severity: Severity;
  headline: string; // what happened
  lines: string[]; // what it breaks / what still works
  action?: string; // what to do now
  missedLegId?: string; // the leg you need a replacement for
  earliest?: Date; // the replacement must leave at/after this
  alternative?: Alternative | null;
};

type TripLike = { legs: Leg[]; stays: Stay[]; dependencies?: Dependency[] };

const at = (d: Date, tz: string) => `${formatTime(d, tz)} ${tzAbbrev(d, tz)}`;
const MIN = 60_000;

/** A change worth telling someone about. */
export function isDisrupted(leg: Pick<Leg, "status" | "departureDelayMin" | "arrivalDelayMin" | "livePlatform" | "platform">): boolean {
  return (
    leg.status === "CANCELLED" ||
    Math.max(leg.departureDelayMin, leg.arrivalDelayMin) >= 5 ||
    Boolean(leg.livePlatform && leg.platform && leg.livePlatform !== leg.platform)
  );
}

/** How often a service runs, for estimating "the next one". */
function headwayMin(leg: Leg): number | null {
  const n = (leg.number ?? "").toUpperCase().replace(/\s+/g, "");
  if (leg.mode === "TAXI" || leg.mode === "WALK") return 0; // just go / call another
  if (leg.mode === "FLIGHT" || leg.mode === "FERRY" || leg.mode === "OTHER") return null; // rebooking, not "next one"
  if (/^S\d/.test(n)) return 15; // S-Bahn
  if (/^(U|TRAM|STR)\d/.test(n)) return 10;
  if (/^(RE|RB|IRE|MEX)\d/.test(n)) return 30;
  if (leg.mode === "BUS") return 20;
  return 60; // ICE / IC / EC and long-distance trains: roughly hourly
}

/**
 * Estimate the next service when no live journey planner answered: same line,
 * same travel time, one headway later. Clearly marked as an estimate in the UI.
 */
export function estimateAlternative(missed: Leg, earliest: Date): Alternative | null {
  const headway = headwayMin(missed);
  if (headway == null) return null;
  const duration = missed.arrivalAt.getTime() - missed.departureAt.getTime();
  let dep: Date;
  if (headway === 0) dep = earliest;
  else {
    const steps = Math.max(1, Math.ceil((earliest.getTime() - missed.departureAt.getTime()) / (headway * MIN)));
    dep = new Date(missed.departureAt.getTime() + steps * headway * MIN);
  }
  const what = missed.number ?? (missed.mode === "TAXI" ? "Another taxi" : "Next service");
  return {
    departureAt: dep,
    arrivalAt: new Date(dep.getTime() + duration),
    label: missed.mode === "TAXI" ? "another taxi" : `${what} at ${formatTime(dep, missed.fromTimeZone)}`,
    source: "estimate",
  };
}

/**
 * Step 1: what does this change break? Returns the impact without an
 * alternative yet, plus which leg needs replacing and from when. The server
 * can then ask a live planner for that replacement before step 2.
 */
export function assessImpact(trip: TripLike, legId: string, alternative?: Alternative | null): Impact | null {
  const leg = trip.legs.find((l) => l.id === legId);
  if (!leg || !isDisrupted(leg)) return null;
  const deps = trip.dependencies ?? [];
  const byId = new Map(trip.legs.map((l) => [l.id, l]));
  const name = legName(leg);
  const arr = effectiveArrival(leg);
  const dep = effectiveDeparture(leg);

  // --- headline
  let headline: string;
  const platformChanged = leg.livePlatform && leg.platform && leg.livePlatform !== leg.platform;
  const where = leg.mode === "FLIGHT" ? "gate" : "platform";
  if (leg.status === "CANCELLED") headline = `${name} is cancelled.`;
  else if (Math.max(leg.departureDelayMin, leg.arrivalDelayMin) >= 5)
    headline =
      `Your ${name} is +${Math.max(leg.departureDelayMin, leg.arrivalDelayMin)} min ` +
      `(now leaves ${at(dep, leg.fromTimeZone)}, arrives ${at(arr, leg.toTimeZone)}).` +
      (platformChanged ? ` New ${where}: ${leg.livePlatform}.` : "");
  else headline = `${name} now leaves from ${where} ${leg.livePlatform} (was ${leg.platform}).`;

  const lines: string[] = [];
  let severity: Severity = "INFO";
  let action: string | undefined = platformChanged ? `Go to ${where} ${leg.livePlatform}` : undefined;
  let missed: Leg | undefined;
  let earliest: Date | undefined;
  let alt: Alternative | null | undefined;

  const connections = findConnections(trip.legs, trip.stays, deps);
  const outgoing = connections.find((c) => c.fromLegId === leg.id);

  if (leg.status === "CANCELLED") {
    // The leg itself needs replacing.
    missed = leg;
    earliest = new Date(leg.departureAt.getTime() + MIN);
    severity = "CRITICAL";
  } else if (outgoing) {
    const next = byId.get(outgoing.toLegId)!;
    if (outgoing.status === "BROKEN") {
      lines.push(`You will miss the ${at(effectiveDeparture(next), next.fromTimeZone)} ${legName(next)}.`);
      missed = next;
      earliest = new Date(arr.getTime() + outgoing.requiredMin * MIN);
      severity = "CRITICAL";
    } else if (outgoing.status === "TIGHT") {
      lines.push(`Your change to ${legName(next)} is only ${outgoing.transferMin} min. Be at the door when the train stops.`);
      severity = "WARNING";
    } else {
      lines.push(`Your connection to ${legName(next)} still works (${formatDuration(outgoing.transferMin)}).`);
    }
  }

  // --- the replacement and what happens after it
  if (missed && earliest) {
    // `undefined` = nobody looked it up yet -> estimate; `null` = looked, nothing.
    alt = alternative === undefined ? estimateAlternative(missed, earliest) : alternative;
    const onwardConn = connections.find((c) => c.fromLegId === missed!.id);
    const onward = onwardConn ? byId.get(onwardConn.toLegId) : undefined;

    if (!alt) {
      action = missed.mode === "FLIGHT" ? `Contact ${missed.carrier ?? "the airline"} to rebook ${legName(missed)}` : `Find another way to ${missed.toName}`;
      lines.push(missed.mode === "FLIGHT" ? `There's no "next one" for a flight — you need to rebook.` : `No replacement found automatically.`);
    } else if (onward && onwardConn) {
      const rules = transferRules(missed, onward, deps.find((d) => d.fromId === missed!.id && d.toId === onward.id));
      const spare = Math.round((effectiveDeparture(onward).getTime() - alt.arrivalAt.getTime()) / MIN);
      const via = `${alt.label}${alt.source === "estimate" ? " (estimated — check the app)" : ""}`;
      if (spare >= rules.requiredMin) {
        lines.push(
          `Your ${legName(onward)} is still reachable via ${via}: arrives ${at(alt.arrivalAt, missed.toTimeZone)}, ` +
            `${formatDuration(spare)} before ${legName(onward)} leaves.`,
        );
        action = `Take ${alt.label}`;
        if (severity === "CRITICAL" && spare >= rules.tightMin) severity = "WARNING";
      } else {
        lines.push(`Even ${via} gets you there too late for ${legName(onward)} (${spare < 0 ? "after it leaves" : `only ${spare} min`}).`);
        action = onward.mode === "FLIGHT" ? `Call ${onward.carrier ?? "the airline"} now about ${legName(onward)}` : `Look for another route to ${onward.toName}`;
        severity = "CRITICAL";
      }
    } else {
      lines.push(`Next option: ${alt.label}${alt.source === "estimate" ? " (estimated — check the app)" : ""}, arriving ${at(alt.arrivalAt, missed.toTimeZone)}.`);
      action = `Take ${alt.label}`;
    }
  }

  // --- stays you'll now reach too late (only problems this delay created)
  const planned = trip.legs.map((l) => ({ ...l, departureDelayMin: 0, arrivalDelayMin: 0, status: "SCHEDULED" }));
  const before = new Set(checkStayArrivals(trip.stays, planned, deps).filter((w) => w.type === "LATE_ARRIVAL").map((w) => w.id));
  for (const w of checkStayArrivals(trip.stays, trip.legs, deps)) {
    if (w.type === "LATE_ARRIVAL" && !before.has(w.id)) {
      lines.push(w.detail);
      severity = "CRITICAL";
      action ??= "Tell your hotel you'll arrive late";
    }
  }

  if (lines.length === 0 && !platformChanged) lines.push("Nothing else on your trip is affected.");
  if (platformChanged && severity === "INFO") severity = "WARNING";

  return { legId: leg.id, severity, headline, lines, action, missedLegId: missed?.id, earliest, alternative: alt };
}

/** One readable message for a notification. */
export function impactMessage(impact: Impact): string {
  return [impact.headline, ...impact.lines].join(" ");
}
