// Picks the status source for a leg.
//   TRAIN with a DB station id -> Deutsche Bahn live (unless DB_REST_MODE=mock|off)
//   FLIGHT                     -> flight mock (a real provider comes in Phase 2)
//   everything else            -> mock
import type { Leg } from "@prisma/client";
import { DbRestProvider } from "./db-rest";
import { MockProvider } from "./mock";
import type { LegStatusProvider } from "./types";

const g = globalThis as unknown as { trailmateProviders?: { db: DbRestProvider; flight: MockProvider; mock: MockProvider } };
const providers = (g.trailmateProviders ??= { db: new DbRestProvider(), flight: new MockProvider("flight-mock"), mock: new MockProvider() });

export function providerFor(leg: Leg): LegStatusProvider | null {
  const dbMode = process.env.DB_REST_MODE || "live";
  if (leg.mode === "TRAIN" && dbMode === "live" && providers.db.supports(leg)) return providers.db;
  if (leg.mode === "FLIGHT") return providers.flight;
  if (dbMode === "off" && leg.mode === "TRAIN") return null;
  return providers.mock;
}

export { providers };
