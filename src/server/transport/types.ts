// The contract every live-status source implements. The rest of the app only
// knows this interface, so swapping the mock for a real flight API (Phase 2)
// touches one file.
import type { Leg } from "@prisma/client";

export type StatusResult =
  | {
      ok: true;
      found: true;
      source: string;
      departureDelayMin: number;
      arrivalDelayMin: number;
      cancelled: boolean;
      platform: string | null; // live platform / gate, if known
    }
  | { ok: true; found: false; source: string; note: string } // source works, trip not in its data
  | { ok: false; source: string; note: string }; // source down / timed out

export type Alternative = {
  departureAt: Date;
  arrivalAt: Date;
  label: string; // "S8 at 15:01"
  platform?: string | null;
  source: "live" | "estimate";
};

export interface LegStatusProvider {
  readonly name: string;
  supports(leg: Leg): boolean;
  getStatus(leg: Leg): Promise<StatusResult>;
  /** Next service from the leg's start to its end leaving at or after `earliest`. */
  findAlternative?(leg: Leg, earliest: Date): Promise<Alternative | null>;
}
