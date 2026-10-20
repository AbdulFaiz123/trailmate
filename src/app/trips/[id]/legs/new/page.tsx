import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { allTimeZones } from "@/lib/time";
import { newLegDefaults } from "@/lib/form-defaults";
import { saveLeg } from "@/app/trips/item-actions";
import { LegForm } from "@/components/forms/LegForm";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function NewLegPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({ where: { id }, include: { legs: true } });
  if (!trip) notFound();
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}`} backLabel={trip.name} title="Add a leg" />
      <LegForm save={saveLeg.bind(null, id, null)} defaults={newLegDefaults(trip, trip.legs)} zones={allTimeZones()} />
    </div>
  );
}
