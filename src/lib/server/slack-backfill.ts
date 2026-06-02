import "server-only";

import { storeSlackNotification } from "./brand24";

/**
 * Backfill: pull a channel's PAST messages from Slack's Web API and store the
 * bot/app ones (i.e. Brand24's alerts). The Events API only delivers messages
 * going forward, so this is how we recover alerts posted before our app
 * existed. Requires the bot to be in the channel with `channels:history`.
 */

interface SlackHistoryMessage {
  type?: string;
  subtype?: string;
  text?: string;
  ts: string;
  bot_id?: string;
  app_id?: string;
  attachments?: unknown[];
  blocks?: unknown[];
}

interface SlackHistoryResponse {
  ok: boolean;
  error?: string;
  messages?: SlackHistoryMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

export interface BackfillResult {
  fetched: number; // total messages read from history
  inserted: number; // new bot rows added
  duplicates: number; // bot rows already present
  skippedNonBot: number; // human/system messages ignored
  pages: number;
  truncated: boolean; // hit the page cap before exhausting history
}

const MAX_PAGES = 50; // safety cap (~10k messages at 200/page)
const PAGE_SIZE = 200;

/** A message counts as a Brand24-style alert when it came from an app/bot. */
function isFromBot(m: SlackHistoryMessage): boolean {
  return m.subtype === "bot_message" || !!m.bot_id;
}

export async function backfillChannelHistory(): Promise<BackfillResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_NOTIFY_CHANNEL_ID;

  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set — needed to read channel history.");
  }
  if (!channel) {
    throw new Error(
      "SLACK_NOTIFY_CHANNEL_ID is not set — set it to the channel id to backfill.",
    );
  }

  const result: BackfillResult = {
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    skippedNonBot: 0,
    pages: 0,
    truncated: false,
  };

  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", channel);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as SlackHistoryResponse;

    if (!data.ok) {
      // Surface Slack's own error (e.g. not_in_channel, missing_scope) so the
      // caller knows exactly what to fix.
      throw new Error(`Slack conversations.history failed: ${data.error ?? "unknown"}`);
    }

    result.pages++;
    const messages = data.messages ?? [];
    result.fetched += messages.length;

    for (const m of messages) {
      if (!isFromBot(m)) {
        result.skippedNonBot++;
        continue;
      }
      const isNew = await storeSlackNotification({
        channel,
        ts: m.ts,
        appId: m.app_id ?? null,
        botId: m.bot_id ?? null,
        text: m.text ?? null,
        attachments: m.attachments ?? null,
        blocks: m.blocks ?? null,
        raw: m,
      });
      if (isNew) result.inserted++;
      else result.duplicates++;
    }

    cursor = data.response_metadata?.next_cursor || undefined;
    if (!data.has_more || !cursor) return result;
  }

  // Ran out of page budget before history was exhausted.
  result.truncated = true;
  return result;
}
