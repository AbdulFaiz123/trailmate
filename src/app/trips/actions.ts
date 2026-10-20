"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TripInput } from "@/lib/trip-input";

export type FormState = { errors?: Record<string, string>; values?: Record<string, string> };

export async function createTrip(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
  const parsed = TripInput.safeParse(values);

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }

  const trip = await prisma.trip.create({ data: parsed.data });
  // Land on the Buy list so the destination's suggestions are the first thing you see.
  redirect(`/trips/${trip.id}/lists?tab=BUY`);
}
