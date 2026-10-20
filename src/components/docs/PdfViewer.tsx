"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draws each PDF page onto a canvas with pdf.js. Phones (Android Chrome in
 * particular) won't show PDFs inside a page, so we render them ourselves —
 * which also works offline, because the file and /pdf.worker.min.mjs come
 * from the service worker's cache.
 */
/**
 * pdf.js is loaded on demand, as script files the page doesn't list up front,
 * so "save for offline" can't see them. Loading it once while online makes
 * the service worker cache those files too.
 */
export function preloadPdfViewer() {
  return import("pdfjs-dist").then(() => true).catch(() => false);
}

export function PdfViewer({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = await (await fetch(src)).arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        const container = box.current;
        if (!container || cancelled) return;
        container.replaceChildren();
        const width = container.clientWidth;
        const ratio = Math.min(window.devicePixelRatio || 1, 3);
        for (let n = 1; n <= Math.min(pdf.numPages, 20); n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.className = "rounded-xl bg-white shadow-sm";
          canvas.setAttribute("aria-label", `${title}, page ${n} of ${pdf.numPages}`);
          canvas.setAttribute("role", "img");
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelled) return;
        }
        setState("ready");
      } catch (e) {
        console.warn("PDF preview failed", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, title]);

  return (
    <div>
      {state === "loading" && <p className="rounded-2xl border border-line p-6 text-center text-sm text-muted">Opening PDF…</p>}
      {state === "error" && (
        <p className="rounded-2xl border border-line p-6 text-center text-sm text-muted">
          Couldn’t preview this PDF here. Use “Open full screen”.
        </p>
      )}
      <div ref={box} className="space-y-3" />
    </div>
  );
}
