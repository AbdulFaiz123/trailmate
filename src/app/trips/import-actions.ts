"use server";

// Save what the traveler confirmed on the import review screen.
import { prisma } from "@/lib/db";
import { describeIssue, Payload, type ImportPayload } from "@/lib/import/payload";
import { TripInput } from "@/lib/trip-input";
import { saveImport, type ApplyResult } from "@/server/import-save";

/** Add a reviewed import to an existing trip. */
export async function applyImport(tripId: string, input: ImportPayload): Promise<ApplyResult> {
  const parsed = Payload.safeParse(input);
  if (!parsed.success) return { ok: false, ...describeIssue(parsed.error, input) };
  return saveImport(tripId, parsed.data);
}

export type NewTripResult = { ok: true; tripId: string; focus: string | null } | { ok: false; error: string; field?: string };

/**
 * Create a trip from a voice message / ticket / booking: the trip details the
 * traveler confirmed, plus the legs, stays and items found in it.
 */
export async function createTripFromImport(tripFields: Record<string, string>, input: ImportPayload): Promise<NewTripResult> {
  const trip = TripInput.safeParse(tripFields);
  if (!trip.success) {
    const issue = trip.error.issues[0];
    return { ok: false, error: `Trip: ${issue.message.charAt(0).toLowerCase()}${issue.message.slice(1)}`, field: `trip.${String(issue.path[0])}` };
  }
  const parsed = Payload.safeParse(input);
  if (!parsed.success) return { ok: false, ...describeIssue(parsed.error, input) };

  const created = await prisma.trip.create({ data: trip.data });
  // A file can only be stored once its trip exists, so the review screen
  // uploads the original ticket after this returns, attached to `focus`.
  const saved = await saveImport(created.id, { ...parsed.data, documentId: null });
  if (!saved.ok) {
    // A leg failed its checks: don't leave a half-made trip behind.
    await prisma.trip.delete({ where: { id: created.id } });
    return saved;
  }
  return { ok: true, tripId: created.id, focus: saved.focus };
}
