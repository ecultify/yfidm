import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { storeSlackNotification } from "@/lib/server/brand24";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Slack Events API receiver.
 *
 * Another application posts its notifications into a Slack channel. That app's
 * own API is paywalled on our plan, so instead we read those notifications
 * straight out of Slack: an in-house Slack app subscribed to `message.channels`
 * / `message.groups` POSTs every message here.
 *
 * Flow:
 *   1. Verify the request is genuinely from Slack (HMAC over the raw body using
 *      SLACK_SIGNING_SECRET, plus a 5-minute timestamp window to stop replays).
 *   2. Answer the one-time `url_verification` challenge Slack sends when you set
 *      the Request URL.
 *   3. For `event_callback` messages, extract the notification and hand it to
 *      handleNotification(). We ACK with 200 immediately — Slack retries if it
 *      doesn't get a 2xx within 3 seconds, so real work must not block the ACK.
 */
export async function POST(req: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[slack] SLACK_SIGNING_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  // Signature is computed over the RAW body, so read text (not json) first.
  const raw = await req.text();

  if (!verifySlackSignature(req, raw, signingSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(raw) as SlackPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // 2. URL verification handshake (only fires when you set/retry the Request URL).
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // 3. Real events.
  if (payload.type === "event_callback" && payload.event?.type === "message") {
    const notif = mapEventToNotification(payload.event);
    if (notif) {
      // Fire-and-forget so we can ACK within Slack's 3s window. Never throw out
      // of here — an error would make Slack retry the same event repeatedly.
      handleNotification(notif).catch((err) =>
        console.error("[slack] handleNotification failed", err),
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/** Verify Slack's `v0` request signature. See api.slack.com/authentication/verifying-requests-from-slack */
function verifySlackSignature(
  req: NextRequest,
  rawBody: string,
  signingSecret: string,
): boolean {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  // Reject anything older than 5 minutes to blunt replay attacks.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(base).digest("hex");

  // Constant-time compare; lengths must match or timingSafeEqual throws.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A captured notification, normalised from a Slack message event. */
export interface SlackNotification {
  channel: string;
  /** Plain text of the message (may be empty when content lives in blocks). */
  text: string;
  /** Slack message timestamp ("ts"), also the unique id within a channel. */
  ts: string;
  /** Identifies the posting app/bot when the message came from one. */
  botId?: string;
  appId?: string;
  /** Rich content — many app notifications put the real data here, not in text. */
  attachments?: unknown[];
  blocks?: unknown[];
  /** The raw event, kept for anything the normalised fields don't cover. */
  raw: SlackMessageEvent;
}

/**
 * Turn a Slack message event into a notification, or null if we should ignore
 * it. We keep only messages from another app/bot, optionally scoped to one
 * channel, and skip our own edits/deletes and ordinary human chatter.
 */
function mapEventToNotification(
  event: SlackMessageEvent,
): SlackNotification | null {
  const onlyChannel = process.env.SLACK_NOTIFY_CHANNEL_ID;
  if (onlyChannel && event.channel !== onlyChannel) return null;

  // Ignore edits, deletes, joins, thread-broadcasts, etc. We want fresh posts.
  // The notifications we care about arrive as `bot_message` (or carry a bot_id).
  const fromBot = event.subtype === "bot_message" || !!event.bot_id;
  if (!fromBot) return null;

  return {
    channel: event.channel,
    text: event.text ?? "",
    ts: event.ts,
    botId: event.bot_id,
    appId: event.app_id,
    attachments: event.attachments,
    blocks: event.blocks,
    raw: event,
  };
}

/** Persist a captured notification via the shared idempotent store. */
async function handleNotification(notif: SlackNotification): Promise<void> {
  await storeSlackNotification({
    channel: notif.channel,
    ts: notif.ts,
    appId: notif.appId,
    botId: notif.botId,
    text: notif.text,
    attachments: notif.attachments,
    blocks: notif.blocks,
    raw: notif.raw,
  });
}

// ── Slack payload shapes (only the fields we use) ──────────────────────────

interface SlackPayload {
  type: "url_verification" | "event_callback" | string;
  challenge?: string;
  event?: SlackMessageEvent;
}

interface SlackMessageEvent {
  type: "message";
  subtype?: string;
  channel: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts: string;
  bot_id?: string;
  app_id?: string;
  attachments?: unknown[];
  blocks?: unknown[];
}
