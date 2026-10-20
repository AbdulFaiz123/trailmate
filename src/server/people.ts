import { prisma } from "@/lib/db";

/** Find or create a gift recipient by name ("Mom"). */
export async function personIdFor(tripId: string, name: string | null | undefined): Promise<string | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const existing = await prisma.person.findFirst({ where: { tripId, name: clean } });
  return (existing ?? (await prisma.person.create({ data: { tripId, name: clean } }))).id;
}
