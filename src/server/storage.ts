// Local file storage for the documents vault.
//
// Files live in STORAGE_DIR (default ./storage, git-ignored), one folder per
// trip: storage/documents/<tripId>/<documentId>.<ext>. The database row holds
// the original name and type; the file name on disk is just the id, so nothing
// a user types ever becomes part of a path.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Room for the multipart boundaries, headers and the small text fields around a file. */
export const MULTIPART_MARGIN_BYTES = 256 * 1024;

/**
 * True when the request says up front that it's bigger than a `maxFileBytes`
 * upload could be, so we can refuse before buffering the body. A missing or
 * odd Content-Length passes; the per-file size check still runs after parsing.
 */
export function declaredTooLarge(req: Request, maxFileBytes: number): boolean {
  const declared = Number(req.headers.get("content-length"));
  return Number.isFinite(declared) && declared > maxFileBytes + MULTIPART_MARGIN_BYTES;
}

/** Types we accept and the bytes each must start with. No SVG/HTML: they can carry scripts. */
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "application/pdf": { ext: "pdf", magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  "image/heic": { ext: "heic", magic: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
};

export const ACCEPT = Object.keys(TYPES).join(",");

/**
 * Images get a policy that blocks everything else. PDFs get only
 * frame-ancestors: browsers' built-in viewers run inside the PDF's own
 * document, and a `default-src 'none'` there risks a blank page on "Open full
 * screen" for no gain. nosniff and a type checked from the bytes keep a PDF
 * from ever being read as HTML.
 */
export function fileCsp(mimeType: string): string {
  return mimeType === "application/pdf"
    ? "frame-ancestors 'self'"
    : "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'self'";
}

export function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR || "storage");
}

/** Work out the real type from the bytes; the browser's claim is only a hint. */
export function detectType(bytes: Buffer, claimed: string): string | null {
  const ordered = [claimed, ...Object.keys(TYPES).filter((t) => t !== claimed)];
  for (const type of ordered) if (TYPES[type]?.magic(bytes)) return type;
  return null;
}

function resolveInside(relative: string) {
  const root = storageRoot();
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep)) throw new Error("Path outside storage");
  return full;
}

export async function saveFile(tripId: string, documentId: string, mimeType: string, bytes: Buffer): Promise<string> {
  const ext = TYPES[mimeType]?.ext;
  if (!ext) throw new Error(`Unsupported type ${mimeType}`);
  if (!/^[a-z0-9]+$/i.test(tripId) || !/^[a-z0-9]+$/i.test(documentId)) throw new Error("Bad id");
  const relative = path.join("documents", tripId, `${documentId}.${ext}`);
  const full = resolveInside(relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return relative;
}

export function readStoredFile(relative: string): Promise<Buffer> {
  return readFile(resolveInside(relative));
}

export async function deleteStoredFile(relative: string) {
  await rm(resolveInside(relative), { force: true });
}
