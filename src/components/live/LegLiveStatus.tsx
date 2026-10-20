import type { Leg } from "@prisma/client";
import { relativeFromNow } from "@/lib/time";
import { CheckNowButton } from "./CheckNowButton";
import { SimulateControls } from "./SimulateControls";

const SOURCE_LABEL: Record<string, string> = {
  "db-rest": "Deutsche Bahn live",
  mock: "mock data",
  "flight-mock": "flight mock (real flight status in Phase 2)",
  simulated: "simulated",
};

/** Live status panel on the leg's page. */
export function LegLiveStatus({ leg, demo }: { leg: Leg; demo: boolean }) {
  const delay = Math.max(leg.departureDelayMin, leg.arrivalDelayMin);
  const tracked = leg.mode === "TRAIN" && leg.fromStopId ? "Deutsche Bahn live data" : leg.mode === "FLIGHT" ? "the flight mock" : "mock data";
  return (
    <section id="live" aria-label="Live status" className="scroll-mt-24 space-y-3 rounded-2xl border border-line bg-surface p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Live status</h2>
      <p className="text-sm font-medium">
        {leg.status === "CANCELLED" ? "⛔ Cancelled" : delay >= 1 ? `⏱️ +${delay} min` : "✅ On time"}
        {leg.livePlatform && leg.livePlatform !== leg.platform && ` · ${leg.mode === "FLIGHT" ? "gate" : "platform"} ${leg.livePlatform}`}
      </p>
      <p className="text-xs text-muted">
        {leg.lastCheckedAt
          ? `Checked ${relativeFromNow(leg.lastCheckedAt)} via ${SOURCE_LABEL[leg.statusSource ?? ""] ?? leg.statusSource}.`
          : `Tracked with ${tracked}: every 5 min from 24 h before departure, every 2 min in the last 2 h.`}
        {leg.statusNote && ` ${leg.statusNote}`}
      </p>
      <CheckNowButton tripId={leg.tripId} legId={leg.id} />
      {demo && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs font-semibold">Simulate delay <span className="font-normal text-muted">(dev & demo)</span></p>
          <SimulateControls tripId={leg.tripId} legId={leg.id} isFlight={leg.mode === "FLIGHT"} />
        </div>
      )}
    </section>
  );
}
