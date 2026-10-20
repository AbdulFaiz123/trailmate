import { prisma } from "@/lib/db";
import { readStoredFile } from "@/server/storage";

/**
 * Serve a stored document. Files never change once uploaded (a new upload is
 * a new id), so the browser and the service worker may cache them forever —
 * that's what makes them readable offline.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readStoredFile(doc.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": doc.mimeType,
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
      },
    });
  } catch {
    return new Response("File missing from storage", { status: 410 });
  }
}
