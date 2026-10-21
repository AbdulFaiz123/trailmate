import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { legName } from "@/lib/checks";
import { modeLabel } from "@/lib/format";
import { DOCUMENT_KINDS } from "@/lib/types";
import { ACCEPT } from "@/server/storage";
import { isDemo } from "@/lib/demo";
import { TripTabs } from "@/components/TripTabs";
import { Section } from "@/components/form";
import { DocList } from "@/components/docs/DocList";
import { UploadForm } from "@/components/docs/UploadForm";

export const dynamic = "force-dynamic";

export default async function DocsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ attach?: string }>;
}) {
  const { id } = await params;
  const { attach } = await searchParams;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: "desc" } }, legs: { orderBy: { departureAt: "asc" } }, stays: { orderBy: { checkInAt: "asc" } } },
  });
  if (!trip) notFound();

  const itemLabels: Record<string, string> = {};
  for (const l of trip.legs) itemLabels[l.id] = legName(l);
  for (const s of trip.stays) itemLabels[s.id] = s.name;
  const attachOptions = [
    { value: "TRIP", label: "Whole trip" },
    ...trip.legs.map((l) => ({ value: `LEG:${l.id}`, label: `${legName(l)} → ${l.toName}` })),
    ...trip.stays.map((s) => ({ value: `STAY:${s.id}`, label: s.name })),
  ];
  const groups = DOCUMENT_KINDS.map((k) => ({ kind: k, docs: trip.documents.filter((d) => d.kind === k) })).filter((g) => g.docs.length);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-xs text-muted">← All trips</Link>
        <h1 className="mt-1 text-xl font-semibold leading-tight">{trip.name}</h1>
      </div>
      <TripTabs tripId={trip.id} active="docs" />

      {groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No documents yet. Add your tickets, bookings, visa and insurance so they open even without internet.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.kind} aria-label={g.kind}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{modeLabel(g.kind)}</h2>
          <DocList docs={g.docs} tripId={trip.id} itemLabels={itemLabels} />
        </section>
      ))}

      <Section title="Add a document">
        {isDemo() ? (
          <p className="text-sm text-muted">Uploads are switched off in this public demo. Open the sample tickets above — they work offline too.</p>
        ) : (
          <UploadForm tripId={trip.id} accept={ACCEPT} attachOptions={attachOptions} defaultAttach={attach && attachOptions.some((o) => o.value === attach) ? attach : "TRIP"} />
        )}
      </Section>
      <p className="text-[11px] text-muted">
        Files are stored on this Trailmate server ({trip.documents.length} file{trip.documents.length === 1 ? "" : "s"}) and saved on your phone for offline use. Passport copies are sensitive — only upload them on a device you trust.
      </p>
    </div>
  );
}
