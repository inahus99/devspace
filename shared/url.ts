import type { ResourceType } from "./constants.ts";

const COURSE_HOSTS = [
  "udemy.com", "coursera.org", "educative.io", "frontendmasters.com", "pluralsight.com", "edx.org", "egghead.io",
  "scrimba.com", "boot.dev", "codecademy.com", "datacamp.com", "algoexpert.io", "neetcode.io", "deeplearning.ai",
];
const ARTICLE_HOSTS = ["medium.com", "dev.to", "substack.com", "hashnode.dev", "hashnode.com", "freecodecamp.org"];

function hostMatches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Classify a URL into a resource type without any network calls. */
export function detectResourceType(raw: string): ResourceType {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "other";
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname.toLowerCase();
  if (hostMatches(host, ["youtube.com", "youtu.be"])) return "youtube";
  if (hostMatches(host, ["x.com", "twitter.com"])) return "twitter";
  if (hostMatches(host, ["github.com"])) return "github";
  if (path.endsWith(".pdf")) return "pdf";
  if (hostMatches(host, COURSE_HOSTS)) return "course";
  if (
    host.startsWith("docs.") ||
    host.startsWith("developer.") ||
    host.startsWith("devdocs.") ||
    host.endsWith("readthedocs.io") ||
    host === "learn.microsoft.com" ||
    host === "pkg.go.dev" ||
    path.startsWith("/docs") ||
    path.includes("/documentation")
  )
    return "docs";
  if (hostMatches(host, ARTICLE_HOSTS) || path.includes("/blog") || path.includes("/article") || path.includes("/posts/"))
    return "article";
  return "other";
}

/** A readable fallback title derived from the URL itself. */
export function suggestTitleFromUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "";
  }
  const host = u.hostname.replace(/^www\./, "");
  const segments = u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  if (host === "github.com" && segments.length >= 2) return `${segments[0]}/${segments[1]}`;
  if ((host === "x.com" || host === "twitter.com") && segments[0]) return `Post by @${segments[0]}`;
  if (host.endsWith("youtube.com") || host === "youtu.be") {
    return u.searchParams.get("list") ? "YouTube playlist" : "YouTube video";
  }
  const last = segments.at(-1);
  if (last) {
    const cleaned = last
      .replace(/\.(html?|php|aspx?|pdf)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (cleaned && !/^\d+$/.test(cleaned)) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return host;
}

export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** YouTube video id for thumbnails (img.youtube.com is a static asset host, not an API). */
export function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      if (m) return m[2] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}
