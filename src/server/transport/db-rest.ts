// Deutsche Bahn live departures via the free public API v6.db.transport.rest
// (no key needed). Docs: https://v6.db.transport.rest/
//
// How we find "our" train: ask for departures at the leg's start station
// around the planned time, then match the line name ("ICE 597") and the
// planned departure. Arrival delay comes from the arrivals board at the
// destination, matched by the same tripId.
import type { Leg } from "@prisma/client";
import { getJson, type FetchLike } from "./http";
import type { Alternative, LegStatusProvider, StatusResult } from "./types";

type HafasStop = {
  tripId: string;
  when: string | null;
  plannedWhen: string | null;
  delay: number | null; // seconds
  platform: string | null;
  plannedPlatform: string | null;
  cancelled?: boolean;
  line?: { name?: string; fahrtNr?: string };
};
type Board = HafasStop[] | { departures?: HafasStop[]; arrivals?: HafasStop[] };
type Journeys = {
  journeys?: {
    legs: {
      departure: string | null;
      plannedDeparture: string | null;
      arrival: string | null;
      plannedArrival: string | null;
      departurePlatform?: string | null;
      cancelled?: boolean;
      walking?: boolean;
      line?: { name?: string };
    }[];
  }[];
};

const BACKOFF_MS = 10 * 60_000;
const norm = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();

export class DbRestProvider implements LegStatusProvider {
  readonly name = "db-rest";
  private downUntil = 0;

  constructor(
    private readonly baseUrl = process.env.DB_REST_URL || "https://v6.db.transport.rest",
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  supports(leg: Leg): boolean {
    return leg.mode === "TRAIN" && Boolean(leg.fromStopId && /^\d{6,9}$/.test(leg.fromStopId) && leg.number);
  }

  private unavailable(): StatusResult | null {
    if (this.now() < this.downUntil) {
      const mins = Math.max(1, Math.ceil((this.downUntil - this.now()) / 60_000));
      return { ok: false, source: this.name, note: `DB live data unavailable — trying again in about ${mins} min. Showing the timetable.` };
    }
    return null;
  }

  private board(kind: "departures" | "arrivals", stopId: string, around: Date) {
    const when = new Date(around.getTime() - 5 * 60_000).toISOString();
    const url = `${this.baseUrl}/stops/${encodeURIComponent(stopId)}/${kind}?when=${encodeURIComponent(when)}&duration=20&results=60&remarks=false&linesOfStops=false`;
    return getJson<Board>(url, { fetchImpl: this.fetchImpl }).then((b) => (Array.isArray(b) ? b : (b[kind] ?? [])));
  }

  private match(list: HafasStop[], leg: Leg, planned: Date, tripId?: string): HafasStop | undefined {
    if (tripId) {
      const byTrip = list.find((d) => d.tripId === tripId);
      if (byTrip) return byTrip;
    }
    const number = norm(leg.number);
    const digits = number.replace(/\D/g, "");
    return list.find((d) => {
      const nameOk = norm(d.line?.name) === number || (digits && d.line?.fahrtNr === digits && norm(d.line?.name).startsWith(number.replace(/\d+$/, "")));
      const plannedOk = d.plannedWhen && Math.abs(Date.parse(d.plannedWhen) - planned.getTime()) <= 2 * 60_000;
      return nameOk && plannedOk;
    });
  }

  async getStatus(leg: Leg): Promise<StatusResult> {
    const down = this.unavailable();
    if (down) return down;
    try {
      const deps = await this.board("departures", leg.fromStopId!, leg.departureAt);
      const dep = this.match(deps, leg, leg.departureAt);
      if (!dep) return { ok: true, found: false, source: this.name, note: `${leg.number} not found in DB live data — showing the timetable.` };

      const depDelay = dep.delay != null ? Math.round(dep.delay / 60) : 0;
      let arrDelay = depDelay; // best guess if we can't read the arrival board
      if (leg.toStopId && /^\d{6,9}$/.test(leg.toStopId)) {
        try {
          const arrs = await this.board("arrivals", leg.toStopId, leg.arrivalAt);
          const arr = this.match(arrs, leg, leg.arrivalAt, dep.tripId);
          if (arr?.delay != null) arrDelay = Math.round(arr.delay / 60);
        } catch {
          // keep the departure-based guess
        }
      }
      return {
        ok: true, found: true, source: this.name,
        departureDelayMin: Math.max(0, depDelay), arrivalDelayMin: Math.max(0, arrDelay),
        cancelled: Boolean(dep.cancelled),
        platform: dep.platform ?? dep.plannedPlatform ?? null,
      };
    } catch (e) {
      this.downUntil = this.now() + BACKOFF_MS;
      console.warn(`[db-rest] ${leg.number}: ${(e as Error).message}; backing off 10 min`);
      return { ok: false, source: this.name, note: "DB live data unavailable right now — showing the timetable." };
    }
  }

  async findAlternative(leg: Leg, earliest: Date): Promise<Alternative | null> {
    if (this.unavailable() || !leg.fromStopId || !leg.toStopId) return null;
    try {
      const url = `${this.baseUrl}/journeys?from=${leg.fromStopId}&to=${leg.toStopId}&departure=${encodeURIComponent(earliest.toISOString())}&results=3&stopovers=false&remarks=false`;
      // The traveler is waiting on this one (it runs inside "what does this break"),
      // so: one try, short timeout, then the estimate takes over.
      const data = await getJson<Journeys>(url, { fetchImpl: this.fetchImpl, timeoutMs: 6_000, retries: 0 });
      for (const j of data.journeys ?? []) {
        const rides = j.legs.filter((l) => !l.walking);
        const first = rides[0];
        const last = rides[rides.length - 1];
        if (!first || !last || rides.some((l) => l.cancelled)) continue;
        const dep = new Date(first.departure ?? first.plannedDeparture!);
        const arr = new Date(last.arrival ?? last.plannedArrival!);
        if (dep < earliest) continue;
        const name = rides.map((l) => l.line?.name).filter(Boolean).join(" + ") || "Next train";
        return { departureAt: dep, arrivalAt: arr, label: name, platform: first.departurePlatform ?? null, source: "live" };
      }
      return null;
    } catch {
      this.downUntil = this.now() + BACKOFF_MS;
      return null;
    }
  }
}
