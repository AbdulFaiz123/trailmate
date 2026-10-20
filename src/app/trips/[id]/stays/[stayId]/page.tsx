import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { allTimeZones } from "@/lib/time";
import { stayToForm } from "@/lib/form-defaults";
import { deleteStay, saveStay } from "@/app/trips/item-actions";
import { StayForm } from "@/components/forms/StayForm";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { ItemDocs } from "@/components/docs/ItemDocs";

export const dynamic = "force-dynamic";

export default async function EditStayPage({ params }: { params: Promise<{ id: string; stayId: string }> }) {
  const { id, stayId } = await params;
  const stay = await prisma.stay.findUnique({ where: { id: stayId, tripId: id }, include: { trip: true } });
  if (!stay) notFound();
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}#stay-${stayId}`} backLabel={stay.trip.name} title={`Edit ${stay.name}`} />
      <ItemDocs tripId={id} kind="STAY" itemId={stayId} />
      <StayForm save={saveStay.bind(null, id, stayId)} defaults={stayToForm(stay)} zones={allTimeZones()} />
      <DeleteButton action={deleteStay.bind(null, id, stayId)} what="stay" />
    </div>
  );
}
