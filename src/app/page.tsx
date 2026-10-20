import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const trips = await prisma.trip.findMany({
    orderBy: { startDate: "asc" },
    include: { _count: { select: { legs: true, stays: true, tasks: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your trips</h1>
        <Link href="/trips/new" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white dark:text-[#04201c]">
          + New trip
        </Link>
      </div>

      {trips.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No trips yet. Create one, or run <code className="font-mono">npm run db:seed</code> for the demo trip.
        </p>
      )}

      <ul className="space-y-3">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link href={`/trips/${trip.id}`} className="block rounded-2xl border border-line bg-surface p-4 active:scale-[0.99]">
              <p className="font-semibold">{trip.name}</p>
              <p className="text-sm text-muted">
                {trip.origin} → {trip.destination}
              </p>
              <p className="mt-2 text-xs text-muted">
                {trip.startDate} – {trip.endDate} · {trip._count.legs} legs · {trip._count.stays} stays ·{" "}
                {trip._count.tasks} list items
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
