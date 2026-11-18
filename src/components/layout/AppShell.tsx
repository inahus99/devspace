import { Menu, Search } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useUi } from "@/stores/ui";
import { CommandPalette } from "./CommandPalette";
import { QuickCaptureHost } from "./QuickCaptureHost";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const mobileNavOpen = useUi((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);
  const location = useLocation();

  // Global shortcuts: Ctrl/Cmd+K palette, Ctrl/Cmd+\ toggles sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        useUi.getState().toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  useEffect(() => setMobileNavOpen(false), [location.pathname, setMobileNavOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar mobile />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-12 items-center justify-between border-b px-3 md:hidden">
          <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-md p-2 hover:bg-accent" aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <img src="/favicon.svg" alt="" className="size-5" /> DevSpace
          </span>
          <button type="button" onClick={() => setPaletteOpen(true)} className="rounded-md p-2 hover:bg-accent" aria-label="Search">
            <Search className="size-5" />
          </button>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette />
      <QuickCaptureHost />
    </div>
  );
}
