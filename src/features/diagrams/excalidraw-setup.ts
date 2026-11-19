// Must be imported before "@excalidraw/excalidraw" so fonts load from our own origin
// (the CSP only allows font-src 'self'). Fonts are copied there by scripts/copy-vendor-assets.mjs.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";
export {};
