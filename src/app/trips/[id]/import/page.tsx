import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { allTimeZones } from "@/lib/time";
import { importEngine } from "@/server/ai/import";
import { PageHeader } from "@/components/PageHeader";
import { ImportFlow } from "@/components/import/ImportFlow";
import { isDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({ where: { id }, include: { tasks: { where: { list: "BUY", status: "TO_BUY" }, select: { id: true, name: true } } } });
  if (!trip) notFound();
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}`} backLabel={trip.name} title="✨ Smart import" />
      <p className="text-sm text-muted">Say it, snap it or paste it: tickets, booking confirmations, shop receipts or a quick voice note. You check everything before it’s saved.</p>
      <ImportFlow tripId={id} engine={importEngine()} model={process.env.OPENAI_MODEL || "gpt-6.1-sol"} zones={allTimeZones()} openTasks={trip.tasks} demo={isDemo()} />
    </div>
  );
}
