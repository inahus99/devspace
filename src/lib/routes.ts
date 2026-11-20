import type { SearchResultType } from "@shared/types";
import { devspaceHref, notesHref } from "./app";

export type WorkspaceTab = "contents" | "overview" | "notes" | "snippets" | "resources" | "files" | "activities" | "dsa" | "lld";

const paths = {
  dashboard: () => "/",
  workspaces: () => "/workspaces",
  workspace: (id: string, opts?: { tab?: WorkspaceTab; folder?: string | null }) => {
    const sp = new URLSearchParams();
    if (opts?.tab) sp.set("tab", opts.tab);
    if (opts?.folder) sp.set("folder", opts.folder);
    const q = sp.toString();
    return `/w/${id}${q ? `?${q}` : ""}`;
  },
  note: (id: string) => `/notes/${id}`,
  snippet: (id: string) => `/snippets/${id}`,
  diagram: (id: string) => `/diagrams/${id}`,
  notebooks: (folderId?: string | null) => (folderId ? `/notebooks/${folderId}` : "/notebooks"),
  dsa: (id: string) => `/dsa/${id}`,
  lld: (id: string) => `/lld/${id}`,
  book: (id: string) => `/books/${id}`,
  bookReader: (id: string, opts?: { notes?: boolean }) => `/books/${id}/read${opts?.notes ? "?notes=1" : ""}`,
  resources: (opts?: { highlight?: string }) => (opts?.highlight ? `/resources?highlight=${opts.highlight}` : "/resources"),
  books: () => "/books",
  /** The daily plan lives in the calendar's Day view. */
  planner: (date?: string) => (date ? `/calendar?view=day&date=${date}` : "/calendar?view=day"),
  calendar: (opts?: { view?: "month" | "week" | "day"; date?: string }) => {
    const sp = new URLSearchParams();
    if (opts?.view) sp.set("view", opts.view);
    if (opts?.date) sp.set("date", opts.date);
    const q = sp.toString();
    return `/calendar${q ? `?${q}` : ""}`;
  },
  analytics: () => "/analytics",
  settings: () => "/settings",
};

type Paths = typeof paths;
const NOTES_ROUTES = new Set<keyof Paths>(["diagram", "notebooks", "bookReader"]);

/**
 * Addresses of every page. Notebooks, drawings and the book reader belong to the Notes app
 * and everything else to DevSpace; when the two run separately, a route that belongs to the
 * other app comes back as its full URL (react-router's Link handles those as normal links).
 */
export const routes = Object.fromEntries(
  Object.entries(paths).map(([name, fn]) => [
    name,
    (...args: unknown[]) => {
      const path = (fn as (...a: unknown[]) => string)(...args);
      return NOTES_ROUTES.has(name as keyof Paths) ? notesHref(path) : devspaceHref(path);
    },
  ]),
) as Paths;

/** Where to navigate for a piece of content (search results, activity links, dashboard). */
export function contentHref(
  type: SearchResultType | "book",
  id: string,
  workspaceId?: string | null,
): string {
  switch (type) {
    case "workspace":
      return routes.workspace(id);
    case "folder":
      return workspaceId ? routes.workspace(workspaceId, { folder: id }) : routes.workspaces();
    case "note":
      return routes.note(id);
    case "snippet":
      return routes.snippet(id);
    case "dsa":
      return routes.dsa(id);
    case "lld":
      return routes.lld(id);
    case "resource":
      return routes.resources({ highlight: id });
    case "book":
      return routes.book(id);
  }
}
