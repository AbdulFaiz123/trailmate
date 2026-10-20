import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Find or create a gift recipient by name ("Mom"). Pass `db` to run inside a transaction. */
export async function personIdFor(
  tripId: string,
  name: string | null | undefined,
  db: Prisma.TransactionClient = prisma,
): Promise<string | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const existing = await db.person.findFirst({ where: { tripId, name: clean } });
  return (existing ?? (await db.person.create({ data: { tripId, name: clean } }))).id;
}
