/**
 * DevSpace and the Notes app (notebooks, drawings, book reader) are one build served from
 * two addresses. The server that sends the page marks which app it is and where the other
 * one lives. Without a Notes address (local development), everything stays in one app.
 */
const meta = typeof document !== "undefined" ? document.querySelector<HTMLMetaElement>('meta[name="devspace-app"]') : null;
const clean = (url: string | undefined) => (url ?? "").replace(/\/+$/, "");

export const APP_MODE: "devspace" | "notes" = meta?.content === "notes" ? "notes" : "devspace";
const NOTES_URL = clean(meta?.dataset.notesUrl || (import.meta.env.VITE_NOTES_URL as string | undefined));
const DEVSPACE_URL = clean(meta?.dataset.devspaceUrl);

export const isNotesApp = APP_MODE === "notes";
/** True when the Notes app runs separately from this DevSpace. */
export const notesSeparate = !isNotesApp && !!NOTES_URL;

/** A path that belongs to the Notes app, as an address usable from this app. */
export function notesHref(path: string) {
  return notesSeparate ? NOTES_URL + path : path;
}
/** A path that belongs to DevSpace, as an address usable from this app. */
export function devspaceHref(path: string) {
  return isNotesApp && DEVSPACE_URL ? DEVSPACE_URL + path : path;
}

export const isExternalHref = (href: string) => /^https?:\/\//i.test(href);

/** Navigates within this app, or loads the other app for one of its addresses. */
export function goTo(navigate: (to: string, opts?: { replace?: boolean }) => void, href: string, opts?: { replace?: boolean }) {
  if (!isExternalHref(href)) return navigate(href, opts);
  if (opts?.replace) window.location.replace(href);
  else window.location.assign(href);
}

/** Notes app, signed out: whether it can sign in through DevSpace (single sign-on). */
export function canSingleSignOn() {
  return isNotesApp && !!DEVSPACE_URL && new URLSearchParams(window.location.search).get("sso") !== "failed";
}

/** Goes to DevSpace to sign in, then comes back here signed in (see server/auth.ts). */
export function startSingleSignOn() {
  const here = new URL(window.location.href);
  if (here.pathname === "/login") here.pathname = "/";
  here.searchParams.delete("sso");
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `ds_sso_state=${state}; Path=/; Max-Age=300; SameSite=Lax${secure}`;
  window.location.assign(`${DEVSPACE_URL}/api/auth/sso/start?return=${encodeURIComponent(here.toString())}&state=${state}`);
}
