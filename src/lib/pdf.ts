import type { PDFDocumentLoadingTask } from "pdfjs-dist";

/**
 * Lazily loads pdf.js (~1 MB) only on pages that show PDFs. Its CMaps, standard fonts,
 * ICC profiles and wasm image decoders are self-hosted under /pdfjs/ (copied by
 * scripts/copy-vendor-assets.mjs) because the CSP only allows same-origin assets.
 */
let loader: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfjs() {
  loader ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return loader;
}

/** Starts loading a PDF; `task.promise` resolves to the document, `task.destroy()` cancels and frees it. */
export async function openPdf(url: string): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    url,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    iccUrl: "/pdfjs/iccs/",
    wasmUrl: "/pdfjs/wasm/",
    enableXfa: false,
  });
}
