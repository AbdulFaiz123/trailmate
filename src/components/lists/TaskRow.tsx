import Link from "next/link";
import type { Person, Task } from "@prisma/client";
import { cycleTaskStatus } from "@/app/trips/task-actions";
import { formatMoney, formatWeight } from "@/lib/format";
import { formatDay, relativeFromNow } from "@/lib/time";

const STATUS_UI: Record<string, { icon: string; label: string; next: string }> = {
  TO_BUY: { icon: "○", label: "To buy", next: "Mark as bought" },
  BOUGHT: { icon: "✓", label: "Bought", next: "Mark as packed" },
  PACKED: { icon: "🧳", label: "Packed", next: "Mark as not done" },
  TODO: { icon: "○", label: "Not packed", next: "Mark as packed" },
};

export function TaskRow({ task, tripId, homeTimeZone, now }: {
  task: Task & { person: Person | null }; tripId: string; homeTimeZone: string; now: Date;
}) {
  const ui = STATUS_UI[task.status] ?? STATUS_UI.TODO;
  const done = task.status === "PACKED" || (task.list === "BUY" && task.status === "BOUGHT");
  const overdue = task.list === "BUY" && task.status === "TO_BUY" && task.buyBy && task.buyBy < now;
  const weight = formatWeight(task.weightG != null ? task.weightG * task.quantity : null);
  const price = formatMoney(task.priceMinor != null ? task.priceMinor * task.quantity : null, task.currency);

  return (
    <li className="flex items-center gap-2 rounded-2xl border border-line bg-surface pr-3">
      <form action={cycleTaskStatus.bind(null, tripId, task.id)}>
        <button
          type="submit"
          aria-label={`${ui.label}. ${ui.next}`}
          title={ui.next}
          className={`flex h-12 w-12 items-center justify-center text-lg ${
            task.status === "PACKED" ? "" : task.status === "BOUGHT" ? "font-bold text-accent" : "text-muted"
          }`}
        >
          {ui.icon}
        </button>
      </form>
      <Link href={`/trips/${tripId}/lists/${task.id}`} className="min-w-0 flex-1 py-2.5">
        <p className={`truncate text-sm font-medium ${done ? "text-muted line-through decoration-1" : ""}`}>
          {task.quantity > 1 && <span className="tabular-nums">{task.quantity} × </span>}
          {task.name}
          {task.person && <span className="font-normal text-muted"> · for {task.person.name}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
          {task.list === "BUY" && <span className={task.status === "TO_BUY" ? "" : "text-accent"}>{ui.label}</span>}
          {task.bag && task.bag !== "NONE" && <span>{task.bag === "CABIN" ? "🎒 cabin" : "🧳 checked"}</span>}
          {weight && <span>{weight}</span>}
          {price && <span>{price}</span>}
          {task.list === "BUY" && task.buyBy && task.status === "TO_BUY" && (
            <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>
              by {formatDay(task.buyBy, homeTimeZone)} ({relativeFromNow(task.buyBy, now)})
            </span>
          )}
        </p>
      </Link>
    </li>
  );
}
