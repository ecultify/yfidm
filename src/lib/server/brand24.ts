import "server-only";

import { execute, query, toIso, type SqlParam } from "./db";

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
  /** When we captured it, ISO-8601 UTC. */
  createdAt: string;
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
  return {
    id: row.id,
    channel: row.channel_id,
    ts: row.ts,
    appId: row.app_id,
    botId: row.bot_id,
    text,
    preview: buildPreview(text, attachments),
    attachments,
    createdAt: toIso(row.created_at),
  };
}

/**
 * Lists captured notifications, newest first. `limit` caps the result; `since`
 * (an id) returns only rows newer than it, so the client can cheaply detect new
 * arrivals for the "popping up" effect.
 */
export async function listBrand24Notifications(opts?: {
  limit?: number;
  sinceId?: number;
}): Promise<Brand24Notification[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const where: string[] = [];
  const params: SqlParam[] = [];

  if (opts?.sinceId && opts.sinceId > 0) {
    where.push("id > ?");
    params.push(opts.sinceId);
  }

  const rows = await query<Row>(
    `SELECT id, channel_id, ts, app_id, bot_id, text, attachments, created_at
       FROM slack_notifications
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY id DESC
       LIMIT ${limit}`,
    params,
  );
  return rows.map(mapRow);
}
