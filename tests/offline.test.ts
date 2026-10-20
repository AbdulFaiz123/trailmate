// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { declaredTooLarge, detectType, fileCsp } from "../src/server/storage";
import { isStaleStatusTap, nextTaskStatus, parseQuickAdd, statusUpdate } from "../src/lib/task-status";
import { samplePdf } from "../prisma/seed-helpers/sample-files";

test("file type comes from the bytes, not the browser's claim", () => {
  const pdf = samplePdf("Hello", ["world"]);
  assert.equal(detectType(pdf, "application/pdf"), "application/pdf");
  assert.equal(detectType(pdf, "image/png"), "application/pdf", "a PDF renamed .png is still a PDF");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(detectType(png, ""), "image/png");
  assert.equal(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), "image/jpeg");
  assert.equal(detectType(Buffer.from("<svg onload=alert(1)>"), "image/svg+xml"), null, "SVG is refused");
  assert.equal(detectType(Buffer.from("MZ\x90\x00"), "application/pdf"), null, "an .exe claiming to be a PDF is refused");
});

test("the sample PDF is well-formed: xref offsets point at the objects", () => {
  const pdf = samplePdf("Ticket", ["line"]).toString("latin1");
  const xrefAt = Number(pdf.match(/startxref\n(\d+)/)![1]);
  assert.equal(pdf.slice(xrefAt, xrefAt + 4), "xref");
  const offsets = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.equal(pdf.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});

test("status cycle matches the list", () => {
  assert.equal(nextTaskStatus("BUY", "TO_BUY"), "BOUGHT");
  assert.equal(nextTaskStatus("BUY", "BOUGHT"), "PACKED");
  assert.equal(nextTaskStatus("BUY", "PACKED"), "TO_BUY");
  assert.equal(nextTaskStatus("PACK", "TODO"), "PACKED");
  assert.equal(nextTaskStatus("PACK", "PACKED"), "TODO");
});

test("quick add parsing", () => {
  assert.deepEqual(parseQuickAdd("3x Haribo"), { name: "Haribo", quantity: 3, category: "FOOD" });
  assert.deepEqual(parseQuickAdd("Phone charger"), { name: "Phone charger", quantity: 1, category: "ELECTRONICS" });
});

test("offline status taps lose only to a later *status* change, with clock-skew slack", () => {
  const changed = new Date("2026-11-10T10:00:00Z");
  const at = (iso: string) => Date.parse(iso);
  assert.equal(isStaleStatusTap(changed, at("2026-11-10T10:30:00Z")), false, "tap after the server change wins");
  assert.equal(isStaleStatusTap(changed, at("2026-11-10T09:57:00Z")), false, "a phone clock a few minutes behind still wins");
  assert.equal(isStaleStatusTap(changed, at("2026-11-10T09:00:00Z")), true, "tap an hour before the server change loses");
});

test("statusChangedAt moves only when the status does (price/notes edits don't count)", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  assert.deepEqual(statusUpdate("TO_BUY", "TO_BUY", now), { status: "TO_BUY" });
  assert.deepEqual(statusUpdate("TO_BUY", "BOUGHT", now), { status: "BOUGHT", statusChangedAt: now });
});

test("uploads that declare an oversized body are refused before reading it", () => {
  const req = (len?: number) => new Request("http://x/api", { method: "POST", headers: len == null ? {} : { "content-length": String(len) } });
  const max = 15 * 1024 * 1024;
  assert.equal(declaredTooLarge(req(max), max), false, "a max-size file plus multipart overhead fits");
  assert.equal(declaredTooLarge(req(max + 100 * 1024), max), false);
  assert.equal(declaredTooLarge(req(max + 2 * 1024 * 1024), max), true);
  assert.equal(declaredTooLarge(req(), max), false, "no header: the per-file check after parsing still applies");
});

test("PDFs aren't served with the policy that blanks Chrome's viewer; images are", () => {
  assert.ok(!fileCsp("application/pdf").includes("default-src"));
  assert.ok(fileCsp("application/pdf").includes("frame-ancestors"));
  assert.ok(fileCsp("image/png").startsWith("default-src 'none'"));
});
