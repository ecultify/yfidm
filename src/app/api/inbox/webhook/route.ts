import { NextResponse, type NextRequest } from "next/server";
import { bumpInboxPulse, reopenOnInbound } from "@/lib/server/app-store";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unipile webhook receiver for new LinkedIn/Instagram messages.
 *
 * Verifies the shared secret, maps the inbound payload, and ACKs with 200. On a
 * new INBOUND message it bumps the shared inbox pulse; browsers poll that cheap
 * counter (see /api/inbox/pulse) and refetch only when it changes, giving
 * near-realtime updates without polling Unipile on a timer.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.UNIPILE_WEBHOOK_SECRET;

  // Accept the secret via header or query param (Unipile lets you configure
  // either when registering the webhook).
  const provided =
    req.headers.get("x-unipile-secret") ??
    req.headers.get("x-webhook-secret") ??
    req.nextUrl.searchParams.get("secret");

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: UnipileWebhookPayload;
  try {
    payload = (await req.json()) as UnipileWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const message = mapWebhookToMessage(payload);
  if (message && message.direction === "inbound") {
    // A new contact message reopens a resolved/snoozed chat, then bumps the
    // pulse so clients refetch promptly.
    await reopenOnInbound(message.conversationId);
    await bumpInboxPulse();
  }

  return NextResponse.json({ received: true });
}

interface UnipileWebhookPayload {
  event?: string;
  account_id?: string;
  account_type?: string;
  chat_id?: string;
  message?: {
    id?: string;
    text?: string;
    is_sender?: number;
    sender_id?: string;
    timestamp?: string;
    delivered?: number;
    seen?: number;
  };
}

/**
 * Determines which channel a webhook belongs to. Instagram is matched by its
 * account id (or an explicit account_type), otherwise we fall back to LinkedIn
 * so the existing behaviour is unchanged.
 */
function channelForPayload(payload: UnipileWebhookPayload): "instagram" | "linkedin" {
  const igAccount = process.env.UNIPILE_IG_ACCOUNT_ID;
  if (
    (payload.account_type ?? "").toUpperCase() === "INSTAGRAM" ||
    (igAccount && payload.account_id === igAccount)
  ) {
    return "instagram";
  }
  return "linkedin";
}

/** Best-effort mapping of a Unipile new-message webhook to our Message type. */
function mapWebhookToMessage(payload: UnipileWebhookPayload): Message | null {
  const { chat_id, message } = payload;
  if (!chat_id || !message?.id) return null;

  if (channelForPayload(payload) === "instagram") {
    // Instagram: is_sender is reliable (1 = our account = outbound).
    const outbound = message.is_sender === 1;
    return {
      id: message.id,
      conversationId: chat_id,
      channel: "instagram",
      direction: outbound ? "outbound" : "inbound",
      body: message.text ?? "",
      sentAt: message.timestamp ?? new Date().toISOString(),
      deliveryStatus: outbound
        ? message.seen
          ? "read"
          : message.delivered
            ? "delivered"
            : "sent"
        : "delivered",
      authorType: outbound ? "agent" : "contact",
      authorName: outbound ? "SBI YFI (Instagram)" : "",
    };
  }

  // Same ORGANIZATION-mailbox rule as the adapter: is_sender is unreliable, so
  // page replies are detected via sender_id === the SBI mailbox id.
  const sbiMailboxId = process.env.UNIPILE_SBI_MAILBOX_ID;
  const outbound =
    message.is_sender === 1 ||
    (!!sbiMailboxId && message.sender_id === sbiMailboxId);
  return {
    id: message.id,
    conversationId: chat_id,
    channel: "linkedin",
    direction: outbound ? "outbound" : "inbound",
    body: message.text ?? "",
    sentAt: message.timestamp ?? new Date().toISOString(),
    deliveryStatus: message.delivered ? "delivered" : "sent",
    authorType: outbound ? "agent" : "contact",
    authorName: outbound ? "SBI Youth for India" : "",
  };
}
