import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { allTimeZones } from "@/lib/time";
import { newStayDefaults } from "@/lib/form-defaults";
import { saveStay } from "@/app/trips/item-actions";
import { StayForm } from "@/components/forms/StayForm";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function NewStayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({ where: { id }, include: { legs: true, stays: true } });
  if (!trip) notFound();
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}`} backLabel={trip.name} title="Add a stay" />
      <StayForm save={saveStay.bind(null, id, null)} defaults={newStayDefaults(trip, trip.stays, trip.legs)} zones={allTimeZones()} />
    </div>
  );
}
