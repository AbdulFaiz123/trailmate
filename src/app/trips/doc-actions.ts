"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { deleteStoredFile } from "@/server/storage";

export async function deleteDocument(tripId: string, docId: string) {
  // The public demo is shared: keep the sample documents for every visitor.
  if (isDemo()) redirect(`/trips/${tripId}/docs`);
  const doc = await prisma.document.delete({ where: { id: docId, tripId } });
  await deleteStoredFile(doc.storagePath);
  revalidatePath(`/trips/${tripId}`, "layout");
  redirect(`/trips/${tripId}/docs`);
}
