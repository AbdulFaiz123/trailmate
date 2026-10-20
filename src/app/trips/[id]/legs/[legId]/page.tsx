import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { allTimeZones } from "@/lib/time";
import { legToForm } from "@/lib/form-defaults";
import { deleteLeg, saveLeg } from "@/app/trips/item-actions";
import { LegForm } from "@/components/forms/LegForm";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { LegLiveStatus } from "@/components/live/LegLiveStatus";
import { ItemDocs } from "@/components/docs/ItemDocs";
import { demoToolsEnabled } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function EditLegPage({ params }: { params: Promise<{ id: string; legId: string }> }) {
  const { id, legId } = await params;
  const leg = await prisma.leg.findUnique({ where: { id: legId, tripId: id }, include: { trip: true } });
  if (!leg) notFound();
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}#leg-${legId}`} backLabel={leg.trip.name} title={`Edit ${leg.number ?? "leg"}`} />
      <LegLiveStatus leg={leg} demo={demoToolsEnabled()} />
      <ItemDocs tripId={id} kind="LEG" itemId={legId} />
      <LegForm save={saveLeg.bind(null, id, legId)} defaults={legToForm(leg)} zones={allTimeZones()} />
      <DeleteButton action={deleteLeg.bind(null, id, legId)} what="leg" />
    </div>
  );
}
