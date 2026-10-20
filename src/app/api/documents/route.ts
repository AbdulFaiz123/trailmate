import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/db";
import { formValues } from "@/lib/form-utils";
import { DOCUMENT_KINDS } from "@/lib/types";
import { MAX_UPLOAD_BYTES, declaredTooLarge, detectType, saveFile } from "@/server/storage";

const Fields = z.object({
  tripId: z.string().min(1),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().trim().max(120).optional(),
  attachTo: z.string().regex(/^(TRIP|(LEG|STAY|TASK):[a-z0-9]+)$/i).default("TRIP"),
});

/** Upload a document (multipart form). Route handler, not a server action: files can be 15 MB. */
export async function POST(req: Request) {
  if (declaredTooLarge(req, MAX_UPLOAD_BYTES)) return NextResponse.json({ error: "Files can be up to 15 MB" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a form upload" }, { status: 400 });
  const file = form.get("file");
  const parsed = Fields.safeParse(formValues(form));
  if (!parsed.success) return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files can be up to 15 MB" }, { status: 413 });

  const { tripId, kind, title, attachTo } = parsed.data;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectType(bytes, file.type);
  if (!mimeType) return NextResponse.json({ error: "Only PDF, JPG, PNG, WebP or HEIC files" }, { status: 415 });

  const [itemKind, itemId] = attachTo === "TRIP" ? [null, null] : attachTo.split(":");
  if (itemKind && itemId) {
    const exists =
      itemKind === "LEG" ? await prisma.leg.count({ where: { id: itemId, tripId } })
      : itemKind === "STAY" ? await prisma.stay.count({ where: { id: itemId, tripId } })
      : await prisma.task.count({ where: { id: itemId, tripId } });
    if (!exists) return NextResponse.json({ error: "That item isn't on this trip" }, { status: 400 });
  }

  const id = createId();
  const storagePath = await saveFile(tripId, id, mimeType, bytes);
  const doc = await prisma.document.create({
    data: {
      id, tripId, kind, itemKind, itemId,
      title: title || file.name.replace(/\.[^.]+$/, "").slice(0, 120),
      fileName: file.name.slice(0, 200), mimeType, sizeBytes: bytes.length, storagePath,
    },
  });
  revalidatePath(`/trips/${tripId}`, "layout");
  return NextResponse.json({ id: doc.id });
}
