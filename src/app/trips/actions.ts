"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isValidTimeZone } from "@/lib/time";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const TripInput = z
  .object({
    name: z.string().trim().min(1, "Give the trip a name").max(80),
    origin: z.string().trim().min(1, "Where do you start?"),
    destination: z.string().trim().min(1, "Where are you going?"),
    destinationCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/, "Use a 2-letter country code, e.g. IN")
      .transform((v) => v || null),
    startDate: dateKey,
    endDate: dateKey,
    homeCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "3-letter code, e.g. EUR"),
    homeTimeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  })
  .refine((t) => t.endDate >= t.startDate, { path: ["endDate"], message: "End date is before the start date" });

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
  redirect(`/trips/${trip.id}`);
}
