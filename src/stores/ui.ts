import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CaptureKind = "workspace" | "note" | "snippet" | "resource" | "dsa" | "lld" | "activity" | "book";

export interface CaptureRequest {
  kind: CaptureKind;
  /** Pre-filled values, e.g. { workspaceId, folderId, date }. */
  defaults?: Record<string, unknown>;
}

interface UiState {
  // Persisted per-browser conveniences (never data).
  sidebarCollapsed: boolean;
  expanded: Record<string, boolean>;
  toggleSidebar: () => void;
  setExpanded: (id: string, open: boolean) => void;
  toggleExpanded: (id: string) => void;

  // Ephemeral
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  capture: CaptureRequest | null;
  openCapture: (kind: CaptureKind, defaults?: Record<string, unknown>) => void;
  closeCapture: () => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__devspace_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      expanded: {},
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
      toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),

      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      capture: null,
      openCapture: (kind, defaults) => set({ capture: { kind, defaults }, paletteOpen: false }),
      closeCapture: () => set({ capture: null }),
    }),
    {
      name: "devspace-ui",
      storage: safeStorage,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, expanded: s.expanded }),
    },
  ),
);
