// Shared by the server actions that validate a <form> with zod.
import type { z } from "zod";

/** The form's text fields as a plain object (file inputs are skipped). */
export function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

/** The first zod message for each field, keyed by field name. */
export function zodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}
