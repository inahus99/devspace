// Copies Excalidraw's hand-drawn fonts into public/ so the editor loads them from this
// app (the CSP only allows self-hosted fonts). Xiaolai (13 MB of CJK glyphs) is skipped;
// Excalidraw only requests it for Chinese/Japanese text and falls back without it.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dest = join(root, "public/excalidraw/fonts");

if (!existsSync(src)) {
  console.warn("[excalidraw-fonts] package fonts not found, skipping");
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const family of readdirSync(src)) {
  if (family === "Xiaolai") continue;
  cpSync(join(src, family), join(dest, family), { recursive: true });
}
console.log("[excalidraw-fonts] copied to public/excalidraw/fonts");
