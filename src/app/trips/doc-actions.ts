"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { deleteStoredFile } from "@/server/storage";

export async function deleteDocument(tripId: string, docId: string) {
  const doc = await prisma.document.delete({ where: { id: docId, tripId } });
  await deleteStoredFile(doc.storagePath);
  revalidatePath(`/trips/${tripId}`, "layout");
  redirect(`/trips/${tripId}/docs`);
}
