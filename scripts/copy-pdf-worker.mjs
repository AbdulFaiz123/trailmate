// Copies pdf.js's worker into public/ so it's served as /pdf.worker.min.mjs
// and can be cached by the service worker for offline use.
// Runs automatically before `dev` and `build` (see package.json).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
mkdirSync("public", { recursive: true });
copyFileSync(src, "public/pdf.worker.min.mjs");
console.log("pdf.js worker -> public/pdf.worker.min.mjs");
