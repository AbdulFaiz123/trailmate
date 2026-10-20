// Validation for a trip's details. Used by the "New trip" form and by
// "create a trip from a voice message / ticket", so both check the same way.
import { z } from "zod";
import { isValidTimeZone } from "./time";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const TripInput = z
  .object({
    name: z.string().trim().min(1, "Give the trip a name").max(80),
    origin: z.string().trim().min(1, "Where do you start?"),
    destination: z.string().trim().min(1, "Where are you going?"),
    originCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/, "Use a 2-letter country code, e.g. DE")
      .transform((v) => v || null),
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
