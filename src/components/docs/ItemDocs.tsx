import Link from "next/link";
import { prisma } from "@/lib/db";
import { DocList } from "./DocList";

/** Documents attached to one leg or stay, with a link to add another. */
export async function ItemDocs({ tripId, kind, itemId }: { tripId: string; kind: "LEG" | "STAY"; itemId: string }) {
  const docs = await prisma.document.findMany({ where: { tripId, itemKind: kind, itemId }, orderBy: { createdAt: "desc" } });
  return (
    <section aria-label="Documents" className="space-y-2 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">📎 Documents</h2>
        <Link href={`/trips/${tripId}/docs?attach=${kind}:${itemId}`} className="text-xs font-semibold text-accent">+ Attach</Link>
      </div>
      {docs.length ? <DocList docs={docs} tripId={tripId} /> : <p className="text-xs text-muted">No ticket or booking attached yet.</p>}
    </section>
  );
}
