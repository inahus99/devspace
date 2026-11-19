import type { SearchResultType } from "@shared/types";

export type WorkspaceTab = "contents" | "overview" | "notes" | "snippets" | "resources" | "files" | "activities" | "dsa" | "lld";

export const routes = {
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
  dsa: (id: string) => `/dsa/${id}`,
  lld: (id: string) => `/lld/${id}`,
  book: (id: string) => `/books/${id}`,
  resources: (opts?: { highlight?: string }) => (opts?.highlight ? `/resources?highlight=${opts.highlight}` : "/resources"),
  books: () => "/books",
  planner: (date?: string) => (date ? `/planner?date=${date}` : "/planner"),
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
