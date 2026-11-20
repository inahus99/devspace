import "./excalidraw-setup";
import { CaptureUpdateAction, convertToExcalidrawElements, exportToCanvas, FONT_FAMILY, getNonDeletedElements } from "@excalidraw/excalidraw";
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

/** Preferred zoom while writing: "fit" (page width fills the screen) or a fixed level. */
export type WritingZoom = "fit" | number;
const ZOOM_KEY = "devspace.writingZoom";
export const WRITING_ZOOMS: WritingZoom[] = ["fit", 1, 1.25, 1.5, 1.75, 2, 2.5];

export function getWritingZoom(): WritingZoom {
  try {
    const v = localStorage.getItem(ZOOM_KEY);
    const n = Number(v);
    return v && v !== "fit" && n >= 0.25 && n <= 4 ? n : "fit";
  } catch {
    return "fit";
  }
}
export function setWritingZoom(z: WritingZoom) {
  try {
    localStorage.setItem(ZOOM_KEY, String(z));
  } catch {
    /* a per-browser convenience only */
  }
}

/**
 * Shows a page at writing size: by default it fills the screen width (like a notebook app)
 * with its top in view, and you scroll down as you write. A fixed writing zoom (e.g. 175%
 * for a small pen tablet) keeps the page's left margin in view instead. Without pages it
 * fits the whole drawing. Zoom only changes the view, never the PDF.
 */
export function fitPageWidth(api: ExcalidrawImperativeAPI, page?: Frame | null, opts?: { keepY?: boolean; zoom?: WritingZoom }) {
  const f = page ?? currentPage(api);
  if (!f) {
    api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 });
    return;
  }
  const s = api.getAppState();
  if (!s.width) return;
  const pref = opts?.zoom ?? getWritingZoom();
  const fit = (s.width - 40) / f.width;
  const zoom = Math.min(Math.max(pref === "fit" ? fit : pref, 0.1), 4);
  // Screen x = (sceneX + scrollX) * zoom.
  const scrollX = f.width * zoom <= s.width - 40 ? (s.width / zoom - f.width) / 2 - f.x : 24 / zoom - f.x;
  const scrollY = opts?.keepY ? s.scrollY : 72 / zoom - f.y;
  api.updateScene({ appState: { zoom: { value: zoom as AppState["zoom"]["value"] }, scrollX, scrollY } });
}

/** Notebook defaults on open: writing-size view and the pencil ready. */
export function startNotebook(api: ExcalidrawImperativeAPI) {
  const s = api.getAppState();
  // Wait until Excalidraw has finished loading the saved scene, which resets the view.
  if (s.isLoading || !s.width || !pageFrames(api).length) return false;
  fitPageWidth(api, pageFrames(api)[0]);
  api.setActiveTool({ type: "freedraw" });
  return true;
}

/** Adds the next page once writing gets close to the bottom of the last one. */
export function growPages(api: ExcalidrawImperativeAPI) {
  const frames = pageFrames(api);
  const last = frames[frames.length - 1];
  if (!last) return false;
  const limit = last.y + last.height - 160;
  const near = getNonDeletedElements(api.getSceneElements()).some(
    (e) => e.type !== "frame" && e.y + e.height > limit && e.y < last.y + last.height + 40 && e.x < last.x + last.width && e.x + e.width > last.x,
  );
  if (!near) return false;
  addPage(api, { scroll: false });
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

/** A point on the board, in scene coordinates (e.g. where something was dropped). */
export type ScenePoint = { x: number; y: number };

const CLIP_MARGIN = 32;
const CLIP_GAP = 24;
const MUTED = "#868e96";

/** Converts a position on screen (e.g. a drop) to board coordinates. */
export function screenToScene(api: ExcalidrawImperativeAPI, clientX: number, clientY: number): ScenePoint {
  const s = api.getAppState();
  return { x: (clientX - s.offsetLeft) / s.zoom.value - s.scrollX, y: (clientY - s.offsetTop) / s.zoom.value - s.scrollY };
}

/**
 * Finds room for a clip of the given size: where it was dropped, or else below whatever is
 * already on the page in view, moving on to later pages (adding one if needed) when it won't fit.
 */
function placeClip(api: ExcalidrawImperativeAPI, w: number, h: number, at?: ScenePoint): { x: number; y: number; page: Frame } {
  const frames = pageFrames(api);
  if (at) {
    const page =
      frames.find((f) => at.x >= f.x && at.x <= f.x + f.width && at.y >= f.y && at.y <= f.y + f.height) ?? currentPage(api) ?? addPage(api, { scroll: false });
    const x = Math.max(Math.min(at.x - w / 2, page.x + page.width - w - 8), page.x + 8);
    const y = Math.max(Math.min(at.y - 12, page.y + page.height - h - 8), page.y + 8);
    return { x, y, page };
  }
  const live = getNonDeletedElements(api.getSceneElements()).filter((e) => e.type !== "frame");
  const first = currentPage(api);
  for (const page of first ? frames.slice(frames.indexOf(first)) : []) {
    const onPage = live.filter((e) => e.frameId === page.id || overlaps(e, page));
    const top = onPage.length ? Math.max(...onPage.map((e) => e.y + e.height)) + CLIP_GAP : page.y + CLIP_MARGIN;
    // Something taller than a page goes at the top of an empty one.
    if (top + h <= page.y + page.height - CLIP_MARGIN || (!onPage.length && h > page.height - CLIP_MARGIN * 2)) return { x: page.x + CLIP_MARGIN, y: top, page };
  }
  const page = addPage(api, { scroll: false });
  return { x: page.x + CLIP_MARGIN, y: page.y + CLIP_MARGIN, page };
}

/** Adds ready-made elements, moved to (x, y) as one group on the given page, and brings them into view. */
function addClip(api: ExcalidrawImperativeAPI, els: El[], x: number, y: number, page: Frame, dropped: boolean) {
  const b = bounds(els);
  const groupId = els.length > 1 ? crypto.randomUUID() : null;
  const moved = els.map((e) => ({ ...e, x: e.x - b.minX + x, y: e.y - b.minY + y, frameId: page.id, groupIds: groupId ? [groupId] : e.groupIds })) as El[];
  api.updateScene({ elements: [...api.getSceneElements(), ...moved], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  growPages(api);
  if (dropped) return;
  const s = api.getAppState();
  const top = -s.scrollY;
  const bottom = top + s.height / s.zoom.value;
  // Scroll only when the clip landed out of view (e.g. on the next page).
  if (y < top || y + 80 > bottom) api.updateScene({ appState: { scrollY: 72 / s.zoom.value - y } });
}

/** Drops an image (a screenshot, a book page) onto the board, scaled to fit inside a page. */
export function insertImage(api: ExcalidrawImperativeAPI, dataURL: string, natural: { width: number; height: number }, at?: ScenePoint) {
  const mimeType = (dataURL.slice(5, dataURL.indexOf(";")) || "image/png") as BinaryFileData["mimeType"];
  const id = crypto.randomUUID() as BinaryFileData["id"];
  api.addFiles([{ id, dataURL: dataURL as DataURL, mimeType, created: Date.now() }]);
  const scale = Math.min((PAGE_W - CLIP_MARGIN * 2) / natural.width, (PAGE_H - CLIP_MARGIN * 2) / natural.height, 1);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const spot = placeClip(api, width, height, at);
  const [img] = convertToExcalidrawElements([{ type: "image", fileId: id, x: 0, y: 0, width, height }]);
  addClip(api, [img!], spot.x, spot.y, spot.page, !!at);
}

/** A code snippet as monospace text on a light card, shrunk if needed to fit on a page. */
export function insertCode(api: ExcalidrawImperativeAPI, code: string, opts: { title?: string; language?: string; at?: ScenePoint } = {}) {
  const pad = 14;
  const maxW = PAGE_W - CLIP_MARGIN * 2 - pad * 2;
  const maxH = PAGE_H - CLIP_MARGIN * 2 - pad * 2 - 30;
  const body = code.replace(/\t/g, "  ").trimEnd() || " ";
  const make = (fontSize: number) =>
    convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: body, fontSize, fontFamily: FONT_FAMILY.Cascadia, strokeColor: "#1e1e1e" }])[0]!;
  let text = make(16);
  const shrink = Math.min(1, maxW / text.width, maxH / text.height);
  if (shrink < 1) text = make(Math.max(7, Math.floor(16 * shrink * 10) / 10));
  const label = [opts.title?.trim(), opts.language].filter(Boolean).join(" · ");
  const head = label
    ? convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: label, fontSize: 14, fontFamily: FONT_FAMILY.Helvetica, strokeColor: MUTED }])[0]!
    : null;
  const headH = head ? head.height + 6 : 0;
  const [card] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: 0,
      y: headH,
      width: text.width + pad * 2,
      height: text.height + pad * 2,
      backgroundColor: "#f1f3f5",
      fillStyle: "solid",
      strokeColor: "#ced4da",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
    },
  ]);
  const els = [...(head ? [head] : []), card!, { ...text, x: pad, y: headH + pad } as El];
  const b = bounds(els);
  const spot = placeClip(api, b.maxX - b.minX, b.maxY - b.minY, opts.at);
  addClip(api, els, spot.x, spot.y, spot.page, !!opts.at);
}

/** A clickable link: its title in blue with the address underneath. Stays clickable in the PDF. */
export function insertLink(api: ExcalidrawImperativeAPI, url: string, opts: { title?: string; at?: ScenePoint } = {}) {
  const shown = url.replace(/^https?:\/\//, "");
  const title = (opts.title?.trim() || shown).slice(0, 120);
  const maxW = PAGE_W - CLIP_MARGIN * 2;
  const heading = (fontSize: number) =>
    convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: `🔗 ${title}`, fontSize, fontFamily: FONT_FAMILY.Helvetica, strokeColor: "#1971c2" }])[0]!;
  let t = heading(20);
  // Long titles shrink to stay inside the page.
  if (t.width > maxW) t = heading(Math.max(10, Math.floor((20 * maxW) / t.width)));
  const [u] = convertToExcalidrawElements([
    { type: "text", x: 0, y: t.height + 6, text: shown.length > 70 ? `${shown.slice(0, 70)}…` : shown, fontSize: 13, fontFamily: FONT_FAMILY.Helvetica, strokeColor: MUTED },
  ]);
  const els = [{ ...t, link: url }, { ...u!, link: url }] as El[];
  const b = bounds(els);
  const spot = placeClip(api, b.maxX - b.minX, b.maxY - b.minY, opts.at);
  addClip(api, els, spot.x, spot.y, spot.page, !!opts.at);
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
    // Keep links clickable: an annotation over each linked element on this page.
    const f = job.frame;
    if (f) {
      const k = w / f.width;
      for (const e of elements)
        if (e.link && /^https?:\/\//i.test(e.link) && e.type !== "frame" && overlaps(e, f))
          pdf.link((e.x - f.x) * k, (e.y - f.y) * k, e.width * k, e.height * k, { url: e.link });
    }
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
