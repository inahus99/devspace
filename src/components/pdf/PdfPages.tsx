import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { openPdf } from "@/lib/pdf";

/** Loads a PDF with pdf.js and the size of its first page (used to size page placeholders). */
export function usePdfDocument(url: string | null | undefined) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [base, setBase] = useState({ width: 612, height: 792 });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setDoc(null);
    setError(null);
    openPdf(url)
      .then(async (t) => {
        task = t;
        if (cancelled) return void t.destroy();
        const d = await t.promise;
        if (cancelled) return;
        const first = (await d.getPage(1)).getViewport({ scale: 1 });
        setBase({ width: first.width, height: first.height });
        setDoc(d);
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
      void (task as PDFDocumentLoadingTask | null)?.destroy();
    };
  }, [url]);
  return { doc, base, error };
}

/** One page: a sized placeholder that renders to a canvas only while near the viewport. */
export function PageSlot({
  doc,
  n,
  scale,
  base,
  root,
  slotRef,
}: {
  doc: PDFDocumentProxy;
  n: number;
  scale: number;
  base: { width: number; height: number };
  root: React.RefObject<HTMLDivElement | null>;
  slotRef: (el: HTMLDivElement | null) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const w = (size?.width ?? base.width) * scale;
  const h = (size?.height ?? base.height) * scale;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(!!e?.isIntersecting), { root: root.current, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!near) {
      // Free memory for pages far away.
      c.width = 0;
      c.height = 0;
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    void doc.getPage(n).then((p) => {
      if (cancelled) return;
      const v1 = p.getViewport({ scale: 1 });
      if (!size || size.width !== v1.width || size.height !== v1.height) setSize({ width: v1.width, height: v1.height });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * dpr });
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      task = p.render({ canvas: c, viewport: vp, background: "#ffffff" });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, scale, doc, n]);

  return (
    <div
      ref={(el) => {
        box.current = el;
        slotRef(el);
      }}
      className="relative shrink-0 overflow-hidden rounded-sm bg-white shadow-soft ring-1 ring-black/5"
      style={{ width: w, height: h }}
      data-page={n}
    >
      <canvas ref={canvas} className="block size-full" aria-label={`Page ${n}`} />
      {near ? null : <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{n}</span>}
    </div>
  );
}

