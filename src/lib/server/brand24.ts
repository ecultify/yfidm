import "server-only";

import { execute, query, toIso, type SqlParam } from "./db";
import { extractLinks, resolveLinks, type ResolvedLink } from "./link-resolver";

/**
 * Brand24 notifications = messages Brand24 posts into our Slack channel,
 * captured by /api/slack/events and stored in `slack_notifications`. Brand24's
 * own API is paywalled on our plan, so Slack is how we get the alerts. This
 * module is both sides: storeSlackNotification() ingests (live webhook +
 * historical backfill), and listBrand24Notifications() reads for the page.
 */

/** A Slack message to persist, from the live webhook or a history backfill. */
export interface CapturedSlackMessage {
  channel: string;
  ts: string;
  appId?: string | null;
  botId?: string | null;
  text?: string | null;
  attachments?: unknown[] | null;
  blocks?: unknown[] | null;
  raw: unknown;
}

/**
 * Idempotently upsert one captured Slack message. The table's UNIQUE
 * (channel_id, ts) plus ON DUPLICATE KEY makes re-ingesting a no-op, so Slack's
 * webhook retries and overlapping backfills can't create duplicates. Returns
 * true only when a NEW row was inserted (affectedRows === 1), so callers can
 * count how many were actually added.
 */
export async function storeSlackNotification(
  m: CapturedSlackMessage,
): Promise<boolean> {
  const affected = await execute(
    `INSERT INTO slack_notifications
       (channel_id, ts, app_id, bot_id, text, attachments, blocks, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      m.channel,
      m.ts,
      m.appId ?? null,
      m.botId ?? null,
      m.text || null,
      m.attachments?.length ? JSON.stringify(m.attachments) : null,
      m.blocks?.length ? JSON.stringify(m.blocks) : null,
      JSON.stringify(m.raw),
    ],
  );
  return affected === 1;
}

/** A Slack attachment, reduced to the fields Brand24 actually populates. */
export interface Brand24Attachment {
  title?: string;
  title_link?: string;
  pretext?: string;
  text?: string;
  fallback?: string;
  footer?: string;
  color?: string;
  image_url?: string;
  fields?: { title?: string; value?: string }[];
}

export interface Brand24Notification {
  id: number;
  channel: string;
  ts: string;
  appId: string | null;
  botId: string | null;
  /** Raw message text (often empty — Brand24 puts content in attachments). */
  text: string;
  /** Best-effort one-line summary for lists, toasts and the nav badge. */
  preview: string;
  /** Rich content passed through for detailed rendering. */
  attachments: Brand24Attachment[];
  /**
   * When Brand24 actually posted it (from Slack's `ts`), ISO-8601 UTC. This is
   * the time to display/group by — for backfilled alerts it reflects the real
   * post date, not when we imported them.
   */
  postedAt: string;
  /** When WE captured/imported it, ISO-8601 UTC. */
  createdAt: string;
  /** Links in the alert, resolved through Brand24's redirects to their final URL. */
  links: ResolvedLink[];
}

/** DB row shape. mysql2 parses JSON columns into objects already. */
interface Row {
  id: number;
  channel_id: string;
  ts: string;
  app_id: string | null;
  bot_id: string | null;
  text: string | null;
  attachments: unknown;
  created_at: string;
}

/** mysql2 returns JSON columns as parsed values, but be defensive about strings. */
function asAttachments(value: unknown): Brand24Attachment[] {
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? (v as Brand24Attachment[]) : [];
}

/** Collapse whitespace and trim a candidate preview string. */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Slack message ts ("1717300000.000200" = epoch seconds) → ISO-8601. Falls back
 * to the capture time if ts is somehow unparseable.
 */
function tsToIso(ts: string, fallback: string): string {
  const epoch = Number(ts);
  if (!Number.isFinite(epoch) || epoch <= 0) return fallback;
  return new Date(epoch * 1000).toISOString();
}

/**
 * Pick the most informative one-liner we can: the message text, else the first
 * attachment's pretext/title/fallback/text. Keeps lists and toasts readable
 * even when the real content lives inside an attachment.
 */
function buildPreview(text: string, attachments: Brand24Attachment[]): string {
  const fromText = clean(text);
  if (fromText) return fromText;

  for (const a of attachments) {
    const candidate =
      a.pretext || a.title || a.fallback || a.text || a.footer || "";
    const c = clean(candidate);
    if (c) return c;
  }
  return "(no text)";
}

function mapRow(row: Row): Brand24Notification {
  const attachments = asAttachments(row.attachments);
  const text = row.text ?? "";
  const createdAt = toIso(row.created_at);
  return {
    id: row.id,
    channel: row.channel_id,
    ts: row.ts,
    appId: row.app_id,
    botId: row.bot_id,
    text,
    preview: buildPreview(text, attachments),
    attachments,
    postedAt: tsToIso(row.ts, createdAt),
    createdAt,
    links: [], // filled in by listBrand24Notifications after resolution
  };
}

export interface Brand24Page {
  items: Brand24Notification[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Returns one page of captured alerts, ordered by the real Slack post time
 * (newest first). Ordering by `ts` (not insert id) keeps backfilled history in
 * true chronological order, since a backfill inserts newest-read-first. An
 * optional `q` filters across the whole dataset (text + raw JSON), so search
 * isn't limited to the current page.
 */
export async function listBrand24Notifications(opts?: {
  page?: number;
  pageSize?: number;
  q?: string;
}): Promise<Brand24Page> {
  const pageSize = Math.min(Math.max(opts?.pageSize ?? 25, 1), 100);
  const page = Math.max(opts?.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  // Search both the plain text and the raw JSON (so attachment content matches).
  const q = opts?.q?.trim();
  const where = q ? `WHERE text LIKE ? OR raw LIKE ?` : "";
  const filterParams: SqlParam[] = q ? [`%${q}%`, `%${q}%`] : [];

  const totalRow = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM slack_notifications ${where}`,
    filterParams,
  );
  const total = Number(totalRow[0]?.n ?? 0);

  // ts is a VARCHAR epoch; coerce to a number so ordering is truly chronological
  // (lexicographic would break across differing integer widths). LIMIT/OFFSET are
  // validated integers above, so interpolating them is safe (mysql2 rejects them
  // as bound params in prepared statements).
  const rows = await query<Row>(
    `SELECT id, channel_id, ts, app_id, bot_id, text, attachments, created_at
       FROM slack_notifications
       ${where}
       ORDER BY CAST(ts AS DECIMAL(20,6)) DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    filterParams,
  );

  const items = rows.map(mapRow);
  await attachResolvedLinks(items);
  return { items, total, page, pageSize };
}

/**
 * Extract every link from this page of alerts, resolve them through Brand24's
 * redirects (cached by URL), and attach the finals to each item. Best-effort —
 * resolution failures leave `final: null` and the UI falls back to the source.
 */
async function attachResolvedLinks(items: Brand24Notification[]): Promise<void> {
  // Build per-item link lists once, collect the distinct URLs across the page.
  const perItem = items.map((n) => extractLinks(n.text, n.attachments));
  const allUrls = perItem.flat().map((l) => l.url);
  if (allUrls.length === 0) return;

  const resolved = await resolveLinks(allUrls);

  items.forEach((n, i) => {
    n.links = perItem[i].map((l) => {
      const r = resolved.get(l.url);
      return {
        source: l.url,
        label: l.label,
        final: r?.final ?? null,
        domain: r?.domain ?? null,
      };
    });
  });
}
