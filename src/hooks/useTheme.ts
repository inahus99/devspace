import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { useMe, useUpdateProfile } from "@/lib/queries";

export type Theme = "light" | "dark" | "system";
const KEY = "devspace-theme";

function readLocal(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const useThemeStore = create<{ theme: Theme; set: (t: Theme) => void }>((set) => ({
  theme: readLocal(),
  set: (theme) => set({ theme }),
}));

/** Mount once: applies the theme and adopts the server-saved preference. */
export function ThemeSync() {
  const { data: me } = useMe();
  const theme = useThemeStore((s) => s.theme);
  const set = useThemeStore((s) => s.set);
  const server = me?.settings?.theme;

  useEffect(() => {
    if (server) set(server);
  }, [server, set]);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore — only a first-paint hint */
    }
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  return null;
}

/** Theme preference, persisted to the user's profile in the database. */
export function useTheme() {
  const { data: me } = useMe();
  const update = useUpdateProfile();
  const theme = useThemeStore((s) => s.theme);
  const set = useThemeStore((s) => s.set);

  const setTheme = useCallback(
    (t: Theme) => {
      set(t);
      if (me) update.mutate({ settings: { theme: t } });
    },
    [me, set, update],
  );
  const toggle = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
