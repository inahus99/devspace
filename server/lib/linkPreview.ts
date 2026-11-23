import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { youtubeId } from "../../shared/url.ts";

/** What a page says about itself, for showing a saved link as a card. */
export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

const MAX_BYTES = 768 * 1024; // the <head> is near the top; stop reading after this
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

// ---------------------------------------------------------------------------
// Only public internet addresses. The address is checked when the socket connects,
// so a redirect or a DNS answer can't point the server at itself or its private network.
// ---------------------------------------------------------------------------

const blocked = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(addr, bits, "ipv4");
for (const [addr, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32]] as const)
  blocked.addSubnet(addr, bits, "ipv6");

function isPublic(address: string, family: number): boolean {
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1]!, "ipv4");
    return !blocked.check(address, "ipv6");
  }
  return !blocked.check(address, "ipv4");
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = (addresses as dns.LookupAddress[]).filter((a) => isPublic(a.address, a.family));
    if (!list.length) return callback(Object.assign(new Error("Address not allowed"), { code: "EBLOCKED" }), "", 0);
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

function fetchOnce(url: URL): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DevSpaceLinkPreview/1.0)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0) });
        }
        if (!/html|xml|json/i.test(contentType)) {
          res.destroy();
          return resolve({ status, contentType, body: Buffer.alloc(0) });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => resolve({ status, contentType, body: Buffer.concat(chunks) });
        stream.on("data", (c: Buffer) => {
          chunks.push(c);
          size += c.length;
          if (size >= MAX_BYTES) {
            res.destroy();
            done();
          }
        });
        stream.on("end", done);
        stream.on("error", (e) => (chunks.length ? done() : reject(e)));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Reading the <head>
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

function charsetOf(contentType: string, head: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  return (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
}

/** An absolute http(s) address, upgraded to https so it shows on our https pages. */
function absolute(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decode(raw), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.protocol = "https:";
    return u.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);

export function parsePreview(html: string, base: URL): LinkPreview {
  const head = html.slice(0, html.search(/<body[\s>]/i) > 0 ? html.search(/<body[\s>]/i) : html.length);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
  }
  let icon: string | undefined;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? "").toLowerCase();
    if (!a.href || !/\bicon\b/.test(rel)) continue;
    // Prefer the larger apple-touch icon, then any icon.
    if (rel.includes("apple-touch-icon") || !icon) icon = a.href;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const text = (v: string | undefined) => (v ? decode(v) || null : null);
  return {
    title: clip(text(meta["og:title"]) ?? text(meta["twitter:title"]) ?? text(titleTag), 300),
    description: clip(text(meta["og:description"]) ?? text(meta["twitter:description"]) ?? text(meta.description), 500),
    image: absolute(meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ?? meta["twitter:image:src"] ?? meta.image, base),
    siteName: clip(text(meta["og:site_name"]) ?? text(meta["application-name"]), 100),
    favicon: absolute(icon ?? "/favicon.ico", base),
  };
}

/** Look up a page's preview. Throws when the page can't be reached; returns empty fields when it has none. */
export async function fetchLinkPreview(raw: string): Promise<LinkPreview> {
  // YouTube doesn't put its tags in the page it serves to servers; its oEmbed endpoint has them.
  const yt = youtubeId(raw);
  if (yt) {
    const thumb = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    const favicon = "https://www.youtube.com/favicon.ico";
    const res = await fetchOnce(new URL(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}`)).catch(() => null);
    try {
      const j = JSON.parse(res?.body.toString("utf8") ?? "") as { title?: string; author_name?: string };
      return { title: clip(j.title, 300), description: j.author_name ? `by ${j.author_name}` : null, image: thumb, siteName: "YouTube", favicon };
    } catch {
      return { title: null, description: null, image: thumb, siteName: "YouTube", favicon };
    }
  }
  let url = new URL(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only web addresses can be previewed");
    if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Port not allowed");
    // A literal IP skips the DNS lookup, so check it here.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const family = net.isIP(host);
    if (family && !isPublic(host, family)) throw new Error("Address not allowed");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw new Error("Address not allowed");
    const res = await fetchOnce(url);
    if (res.location) {
      url = new URL(res.location, url);
      continue;
    }
    if (res.status >= 400 || !res.body.length) {
      // No page to read (an error, or a PDF/image): still offer the site's icon.
      return { title: null, description: null, image: null, siteName: null, favicon: absolute("/favicon.ico", url) };
    }
    const latin = res.body.toString("latin1");
    let html: string;
    try {
      html = new TextDecoder(charsetOf(res.contentType, latin.slice(0, 4096))).decode(res.body);
    } catch {
      html = res.body.toString("utf8");
    }
    return parsePreview(html, url);
  }
  throw new Error("Too many redirects");
}
