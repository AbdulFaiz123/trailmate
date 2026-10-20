import Link from "next/link";
import type { Document } from "@prisma/client";

const ICON: Record<string, string> = { TICKET: "🎫", BOOKING: "🧾", VISA: "🛂", PASSPORT: "📘", INSURANCE: "🛡️", OTHER: "📄" };

export function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocList({ docs, tripId, itemLabels = {} }: { docs: Document[]; tripId: string; itemLabels?: Record<string, string> }) {
  if (docs.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {docs.map((d) => (
        <li key={d.id}>
          <Link href={`/trips/${tripId}/docs/${d.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <span aria-hidden className="text-xl">{ICON[d.kind] ?? "📄"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{d.title}</span>
              <span className="block truncate text-[11px] text-muted">
                {d.mimeType === "application/pdf" ? "PDF" : "Image"} · {formatBytes(d.sizeBytes)}
                {d.itemId && itemLabels[d.itemId] ? ` · ${itemLabels[d.itemId]}` : ""}
              </span>
            </span>
            <span aria-hidden className="text-muted">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
