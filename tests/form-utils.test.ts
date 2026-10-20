// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { formValues, zodErrors } from "../src/lib/form-utils";

test("form values keep text fields and skip files", () => {
  const fd = new FormData();
  fd.set("name", "Hyderabad");
  fd.set("file", new Blob(["x"]), "x.txt");
  assert.deepEqual(formValues(fd), { name: "Hyderabad" });
});

test("zod errors: the first message per field", () => {
  const parsed = z.object({ a: z.string().min(3, "Too short").email("Not an email"), b: z.number() }).safeParse({ a: "x", b: "no" });
  assert.ok(!parsed.success);
  const errors = zodErrors(parsed.error);
  assert.equal(errors.a, "Too short");
  assert.ok(errors.b);
});
