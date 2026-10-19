import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { saveTask } from "@/app/trips/task-actions";
import { TaskForm } from "@/components/forms/TaskForm";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ list?: string }>;
}) {
  const { id } = await params;
  const { list } = await searchParams;
  const trip = await prisma.trip.findUnique({ where: { id }, include: { people: true } });
  if (!trip) notFound();
  const l = list === "PACK" ? "PACK" : "BUY";
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}/lists?tab=${l}`} backLabel="Lists" title="Add an item" />
      <TaskForm
        save={saveTask.bind(null, id, null)}
        defaults={{ list: l, currency: trip.homeCurrency, bag: "CHECKED" }}
        people={trip.people.map((p) => p.name)}
      />
    </div>
  );
}
