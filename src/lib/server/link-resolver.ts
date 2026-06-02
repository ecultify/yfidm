import "server-only";

import crypto from "node:crypto";
import { execute, query, type SqlParam } from "./db";
import type { Brand24Attachment } from "./brand24";

/**
 * Brand24 wraps the real source of each mention behind a redirect/tracking URL.
 * This module extracts those URLs from a notification and resolves them to their
 * final destination (the actual tweet/article/post), caching the result by URL
 * so the same link — which repeats across many alerts — is only fetched once.
 */

export interface ResolvedLink {
  /** The original URL as it appeared in the alert. */
  source: string;
  /** Final URL after following redirects, or null if it couldn't be resolved. */
  final: string | null;
  /** Hostname of the final (or source) URL, for a compact display. */
  domain: string | null;
  /** Human label from Slack's `<url|label>`, when present. */
  label?: string;
}

// Slack renders links as <url> or <url|label>. Capture both.
const SLACK_LINK_RE = /<(https?:\/\/[^>|\s]+)(?:\|([^>]*))?>/g;

function pushLink(
  out: { url: string; label?: string }[],
  seen: Set<string>,
  url: string | undefined,
  label?: string,
) {
  if (!url) return;
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean) || seen.has(clean)) return;
  seen.add(clean);
  out.push({ url: clean, label: label?.trim() || undefined });
}

/** Pull every distinct URL (with optional label) out of an alert. */
export function extractLinks(
  text: string,
  attachments: Brand24Attachment[],
): { url: string; label?: string }[] {
  const out: { url: string; label?: string }[] = [];
  const seen = new Set<string>();

  const scanSlack = (s?: string) => {
    if (!s) return;
    for (const m of s.matchAll(SLACK_LINK_RE)) pushLink(out, seen, m[1], m[2]);
  };

  scanSlack(text);
  for (const a of attachments) {
    // title_link is a bare URL; the title is its natural label.
    pushLink(out, seen, a.title_link, a.title);
    scanSlack(a.pretext);
    scanSlack(a.text);
    scanSlack(a.fallback);
    scanSlack(a.footer);
    for (const f of a.fields ?? []) scanSlack(f.value);
  }
  return out;
}

function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface CacheRow {
  url_hash: string;
  final_url: string | null;
  status: string;
}

/** Follow redirects to the final URL. Best-effort: never throws. */
async function resolveOne(
  url: string,
): Promise<{ final: string | null; status: "ok" | "error" }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: {
        // Some redirectors require a browser-like UA to issue the 30x.
        "User-Agent":
          "Mozilla/5.0 (compatible; UniboxLinkResolver/1.0; +https://brand24.com)",
      },
    });
    // res.url is the final URL after all redirects.
    return { final: res.url || url, status: "ok" };
  } catch {
    return { final: null, status: "error" };
  }
}

/** Run async tasks with a concurrency cap so we don't open hundreds of sockets. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Resolve at most this many uncached URLs per request, so a cold page can't hang
// on a flood of external fetches. Leftovers resolve on the next load.
const MAX_RESOLVES_PER_CALL = 40;

/**
 * Resolve a set of source URLs to finals, using the DB cache and filling misses.
 * Returns a map keyed by source URL. Degrades gracefully if the DB is down (it
 * just resolves live without caching).
 */
export async function resolveLinks(
  sourceUrls: string[],
): Promise<Map<string, { final: string | null; domain: string | null }>> {
  const distinct = [...new Set(sourceUrls)];
  const result = new Map<string, { final: string | null; domain: string | null }>();
  if (distinct.length === 0) return result;

  const hashes = distinct.map(hashUrl);
  const byHash = new Map(distinct.map((u) => [hashUrl(u), u]));

  // 1. Look up everything we already resolved.
  const placeholders = hashes.map(() => "?").join(", ");
  const cached = await query<CacheRow>(
    `SELECT url_hash, final_url, status FROM link_resolutions
       WHERE url_hash IN (${placeholders})`,
    hashes as SqlParam[],
  );
  const cachedHashes = new Set<string>();
  for (const row of cached) {
    const src = byHash.get(row.url_hash);
    if (!src) continue;
    cachedHashes.add(row.url_hash);
    result.set(src, { final: row.final_url, domain: domainOf(row.final_url ?? src) });
  }

  // 2. Resolve the misses (bounded), then persist them.
  const misses = distinct
    .filter((u) => !cachedHashes.has(hashUrl(u)))
    .slice(0, MAX_RESOLVES_PER_CALL);

  if (misses.length > 0) {
    const resolved = await mapLimit(misses, 8, async (url) => {
      const { final, status } = await resolveOne(url);
      return { url, final, status };
    });

    for (const r of resolved) {
      result.set(r.url, { final: r.final, domain: domainOf(r.final ?? r.url) });
      // Cache it (no-op if the DB is unavailable in dev).
      await execute(
        `INSERT INTO link_resolutions (url_hash, source_url, final_url, status)
           VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE final_url = VALUES(final_url), status = VALUES(status)`,
        [hashUrl(r.url), r.url, r.final, r.status],
      );
    }
  }

  // 3. Any still-unresolved (DB down + over the cap) fall back to the source URL.
  for (const u of distinct) {
    if (!result.has(u)) result.set(u, { final: null, domain: domainOf(u) });
  }

  return result;
}
