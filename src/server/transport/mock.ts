// Mock provider: used for flights (no real flight API yet), Indian rail and
// local transport, and for DB trains when DB_REST_MODE=mock. It reports the
// leg as it is stored, so the only way to change it is "Simulate delay".
import type { Leg } from "@prisma/client";
import type { LegStatusProvider, StatusResult } from "./types";

export class MockProvider implements LegStatusProvider {
  constructor(readonly name = "mock") {}

  supports(): boolean {
    return true;
  }

  async getStatus(leg: Leg): Promise<StatusResult> {
    return {
      ok: true, found: true, source: this.name,
      departureDelayMin: leg.departureDelayMin, arrivalDelayMin: leg.arrivalDelayMin,
      cancelled: leg.status === "CANCELLED", platform: leg.livePlatform,
    };
  }
}
