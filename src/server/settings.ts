import { prisma } from "@/lib/db";

/** The single settings row, created with defaults the first time. */
export async function getSettings() {
  return prisma.settings.upsert({ where: { id: "me" }, update: {}, create: { id: "me" } });
}

/** "Pretend time" tools: always on in development, opt-in with DEMO_TOOLS=1 elsewhere. */
export function demoToolsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_TOOLS === "1";
}
