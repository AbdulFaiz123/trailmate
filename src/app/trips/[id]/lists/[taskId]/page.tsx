import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { deleteTask, saveTask } from "@/app/trips/task-actions";
import { taskToForm } from "@/lib/form-defaults";
import { TaskForm } from "@/components/forms/TaskForm";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const task = await prisma.task.findUnique({
    where: { id: taskId, tripId: id },
    include: { person: true, trip: { include: { people: true } } },
  });
  if (!task) notFound();
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}/lists?tab=${task.list}`} backLabel="Lists" title={`Edit ${task.name}`} />
      <TaskForm
        save={saveTask.bind(null, id, taskId)}
        defaults={taskToForm(task, task.trip.homeTimeZone)}
        people={task.trip.people.map((p) => p.name)}
      />
      <DeleteButton action={deleteTask.bind(null, id, taskId)} what="item" />
    </div>
  );
}
