// Copies runtime assets of browser libraries into public/ so they load from this app
// (the CSP only allows self-hosted fonts, workers and wasm):
// - Excalidraw's hand-drawn fonts -> public/excalidraw/fonts. Xiaolai (13 MB of CJK glyphs)
//   is skipped; Excalidraw only requests it for Chinese/Japanese text and falls back without it.
// - pdf.js CMaps, standard fonts, ICC profiles and wasm decoders -> public/pdfjs.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function copyDir(src, dest, skip = []) {
  if (!existsSync(src)) {
    console.warn(`[vendor-assets] ${src} not found, skipping`);
    return;
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skip.includes(name)) continue;
    cpSync(join(src, name), join(dest, name), { recursive: true });
  }
}

copyDir(join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"), join(root, "public/excalidraw/fonts"), ["Xiaolai"]);
for (const dir of ["cmaps", "standard_fonts", "iccs", "wasm"]) {
  copyDir(join(root, "node_modules/pdfjs-dist", dir), join(root, "public/pdfjs", dir));
}
console.log("[vendor-assets] copied Excalidraw fonts and pdf.js assets into public/");
