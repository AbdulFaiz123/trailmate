"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TripInput } from "@/lib/trip-input";
import { formValues, zodErrors } from "@/lib/form-utils";

export type FormState = { errors?: Record<string, string>; values?: Record<string, string> };

export async function createTrip(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = TripInput.safeParse(values);

  if (!parsed.success) return { errors: zodErrors(parsed.error), values };

  const trip = await prisma.trip.create({ data: parsed.data });
  // Land on the Buy list so the destination's suggestions are the first thing you see.
  redirect(`/trips/${trip.id}/lists?tab=BUY`);
}
