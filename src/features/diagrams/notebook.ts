import "./excalidraw-setup";
import { CaptureUpdateAction, convertToExcalidrawElements, exportToCanvas, getNonDeletedElements } from "@excalidraw/excalidraw";
import type { AppState, BinaryFileData, BinaryFiles, DataURL, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * Notebook pages are Excalidraw frames, stacked top to bottom. Anything drawn inside a frame
 * belongs to that page, and "Save as PDF" turns each frame into one PDF page.
 * A4 at 96 dpi, so a page prints at real size.
 */
export const PAGE_W = 794;
export const PAGE_H = 1123;
const PAGE_GAP = 80;

type El = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>[number];
type Frame = Extract<El, { type: "frame" }>;

export function pageFrames(api: ExcalidrawImperativeAPI): Frame[] {
  return getNonDeletedElements(api.getSceneElements())
    .filter((e): e is Frame => e.type === "frame")
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function bounds(els: readonly El[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of els) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width);
    maxY = Math.max(maxY, e.y + e.height);
  }
  return { minX, minY, maxX, maxY };
}

function overlaps(e: El, f: Frame) {
  return e.x < f.x + f.width && e.x + e.width > f.x && e.y < f.y + f.height && e.y + e.height > f.y;
}

/** Appends a blank A4 page below the last one and scrolls to it. */
export function addPage(api: ExcalidrawImperativeAPI, opts?: { scroll?: boolean }) {
  const all = api.getSceneElements();
  const live = getNonDeletedElements(all);
  const frames = pageFrames(api);
  let x = 0;
  let y = 0;
  if (frames.length) {
    const last = frames[frames.length - 1]!;
    x = last.x;
    y = last.y + last.height + PAGE_GAP;
  } else if (live.length) {
    // Start the notebook below whatever is already drawn.
    const b = bounds(live);
    x = b.minX;
    y = b.maxY + PAGE_GAP;
  }
  const [frame] = convertToExcalidrawElements([
    { type: "frame", x, y, width: PAGE_W, height: PAGE_H, name: `Page ${frames.length + 1}`, children: [] },
  ]);
  api.updateScene({ elements: [...all, frame!], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  if (opts?.scroll !== false) fitPageWidth(api, frame as Frame);
  return frame as Frame;
}

/**
 * Zooms so a page fills the width of the screen (like a notebook app) and shows its top,
 * a comfortable size for handwriting; you scroll down the page as you write. Without
 * pages, it fits the whole drawing instead. Zoom only changes the view, never the PDF.
 */
export function fitPageWidth(api: ExcalidrawImperativeAPI, page?: Frame | null, opts?: { keepY?: boolean }) {
  const f = page ?? currentPage(api);
  if (!f) {
    api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 });
    return;
  }
  const s = api.getAppState();
  if (!s.width) return;
  const zoom = Math.min(Math.max((s.width - 40) / f.width, 0.1), 3);
  // Screen x = (sceneX + scrollX) * zoom: centre the page, top edge 16px below the toolbar area.
  const scrollX = (s.width / zoom - f.width) / 2 - f.x;
  const scrollY = opts?.keepY ? s.scrollY : 72 / zoom - f.y;
  api.updateScene({ appState: { zoom: { value: zoom as AppState["zoom"]["value"] }, scrollX, scrollY } });
}

/** Notebook defaults on open: page width fills the screen and the pencil is ready. */
export function startNotebook(api: ExcalidrawImperativeAPI) {
  const s = api.getAppState();
  // Wait until Excalidraw has finished loading the saved scene, which resets the view.
  if (s.isLoading || !s.width || !pageFrames(api).length) return false;
  fitPageWidth(api, pageFrames(api)[0]);
  api.setActiveTool({ type: "freedraw" });
  return true;
}

/** The page whose area covers the middle of the screen, or the last page. */
function currentPage(api: ExcalidrawImperativeAPI): Frame | null {
  const frames = pageFrames(api);
  if (!frames.length) return null;
  const s = api.getAppState();
  const cx = -s.scrollX + s.width / 2 / s.zoom.value;
  const cy = -s.scrollY + s.height / 2 / s.zoom.value;
  return frames.find((f) => cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height) ?? frames[frames.length - 1]!;
}

/** Drops an image (e.g. a book page) onto the page in view, scaled to fit inside it. */
export function insertImage(api: ExcalidrawImperativeAPI, dataURL: string, natural: { width: number; height: number }) {
  const mimeType = (dataURL.slice(5, dataURL.indexOf(";")) || "image/png") as BinaryFileData["mimeType"];
  const id = crypto.randomUUID() as BinaryFileData["id"];
  api.addFiles([{ id, dataURL: dataURL as DataURL, mimeType, created: Date.now() }]);

  const existing = currentPage(api);
  const page = existing ?? addPage(api, { scroll: false });
  const margin = 32;
  const scale = Math.min((page.width - margin * 2) / natural.width, (page.height - margin * 2) / natural.height, 1);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const [img] = convertToExcalidrawElements([
    { type: "image", fileId: id, x: page.x + (page.width - width) / 2, y: page.y + margin, width, height, frameId: page.id },
  ]);
  api.updateScene({ elements: [...api.getSceneElements(), img!], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  if (!existing) fitPageWidth(api, page);
}

/**
 * Renders the drawing to a PDF: one PDF page per notebook page, plus a final page for
 * anything drawn outside the pages. A drawing without pages becomes a single page.
 */
export async function exportPdf(api: ExcalidrawImperativeAPI): Promise<{ blob: Blob; pages: number }> {
  const { jsPDF } = await import("jspdf");
  const elements = getNonDeletedElements(api.getSceneElements());
  if (!elements.length) throw new Error("Nothing to export yet");
  const files: BinaryFiles = api.getFiles();
  const appState = { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false };
  const frames = pageFrames(api);
  const loose = frames.length ? elements.filter((e) => e.type !== "frame" && !e.frameId && !frames.some((f) => overlaps(e, f))) : elements;

  type Job = { frame: Frame | null; els: readonly El[] };
  const jobs: Job[] = frames.map((f) => ({ frame: f, els: elements }));
  if (loose.length) jobs.push({ frame: null, els: loose });

  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const job of jobs) {
    let cssWidth = 0;
    const canvas = await exportToCanvas({
      elements: job.els,
      appState,
      files,
      exportingFrame: job.frame,
      exportPadding: job.frame ? 0 : 24,
      getDimensions: (w: number, h: number) => {
        // ~2x for crisp pen strokes, capped so huge drawings stay printable.
        const scale = Math.min(2, 4000 / Math.max(w, h));
        cssWidth = w;
        return { width: w * scale, height: h * scale, scale };
      },
    });
    // Points at 72 dpi from CSS pixels at 96 dpi.
    const w = (cssWidth || canvas.width / 2) * 0.75;
    const h = w * (canvas.height / canvas.width);
    const orientation = w > h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "pt", format: [w, h], orientation, compress: true });
    else pdf.addPage([w, h], orientation);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h, undefined, "FAST");
  }
  return { blob: pdf!.output("blob"), pages: jobs.length };
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pdfFileName(title: string) {
  return `${(title.trim() || "Untitled").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120)}.pdf`;
}
