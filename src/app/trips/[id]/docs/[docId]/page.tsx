import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { deleteDocument } from "@/app/trips/doc-actions";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { formatBytes } from "@/components/docs/DocList";
import { modeLabel } from "@/lib/format";
import { PdfViewer } from "@/components/docs/PdfViewer";

export const dynamic = "force-dynamic";

export default async function DocPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const doc = await prisma.document.findUnique({ where: { id: docId, tripId: id } });
  if (!doc) notFound();
  const src = `/api/documents/${doc.id}/file`;
  return (
    <div className="space-y-4">
      <PageHeader backHref={`/trips/${id}/docs`} backLabel="Documents" title={doc.title} />
      <p className="text-xs text-muted">{modeLabel(doc.kind)} · {doc.fileName} · {formatBytes(doc.sizeBytes)}</p>
      {doc.mimeType.startsWith("image/") && doc.mimeType !== "image/heic" ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored file, served by our own route
        <img src={src} alt={doc.title} className="w-full rounded-2xl border border-line" />
      ) : doc.mimeType === "application/pdf" ? (
        <PdfViewer src={src} title={doc.title} />
      ) : (
        <p className="rounded-2xl border border-line p-4 text-sm">Preview not available for this file type.</p>
      )}
      <a href={src} target="_blank" rel="noopener" className="block w-full rounded-full border border-accent py-3 text-center text-sm font-semibold text-accent">
        Open full screen
      </a>
      <DeleteButton action={deleteDocument.bind(null, id, docId)} what="document" />
    </div>
  );
}
