import "server-only";

import type { Channel, Contact, Conversation, Message } from "@/lib/types";
import type { ChannelAdapter } from "./channel-adapter";
import {
  getChatAttendeesForAccount,
  getChatForAccount,
  getMessagesForAccount,
  instagramAccount,
  listChatsPage,
  sendMessageForAccount,
  type UnipileAttachment,
  type UnipileAttendee,
  type UnipileChat,
  type UnipileMessage,
} from "@/lib/server/unipile";

/**
 * Instagram channel adapter backed by Unipile (same provider as LinkedIn).
 * SERVER ONLY — imported exclusively by the route handlers under
 * app/api/inbox/instagram/. Translates Unipile's INSTAGRAM payloads into our
 * normalized domain types. Field mappings verified against the live API shape
 * documented in AGENTS.md.
 *
 * KEY DIFFERENCES FROM LINKEDIN (intentionally a separate adapter so LinkedIn
 * stays byte-for-byte):
 *  - The chat object already carries the contact `name`, so there is NO
 *    per-contact getUser()/attendee hydration on the list path (no N+1).
 *  - There is no mailbox concept — chats live in a single INBOX folder, so no
 *    per-mailbox filtering.
 *  - There is no subject/topic, so Conversation.tags starts empty.
 *
 * App-owned workflow state (status, assignee, tags, notes, read overrides) is
 * merged in by the route via lib/server/app-store.ts — exactly like LinkedIn.
 */

/** Display name attributed to outbound (our) messages. */
const SBI_IG_NAME = "SBI YFI (Instagram)";

/**
 * Fallback contact name. Instagram returns `name: null` or literally
 * "Instagram User" when the sender profile is unresolvable (deactivated /
 * restricted / privacy). We must never render a blank row.
 */
const INSTAGRAM_FALLBACK_NAME = "Instagram user";

/**
 * Process-wide cache of last-message previews (chatId -> {sig, text}). `sig` is
 * the chat's last-activity timestamp; when a newer message arrives the cached
 * preview is treated as stale and re-hydrated. The chat list carries no message
 * snippet, so previews are fetched lazily per visible row.
 * // TODO: move to a shared cache / DB; invalidate from the webhook.
 */
const previewCache = new Map<string, { sig: string; text: string }>();

/**
 * Process-wide cache of hydrated IG contacts (providerId -> Contact). The chat
 * list carries the contact NAME but not the avatar/handle, so those are filled
 * lazily from the attendees endpoint as rows scroll into view and cached here.
 * // TODO: move to a shared cache / DB with TTL when persistence lands.
 */
const contactCache = new Map<string, Contact>();

function resolveName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === "instagram user") {
    return INSTAGRAM_FALLBACK_NAME;
  }
  return trimmed;
}

/** Derives a readable @handle from the attendee's instagram.com profile URL. */
function deriveHandle(attendee: UnipileAttendee | null): string {
  const slug = attendee?.profile_url
    ?.split("instagram.com/")[1]
    ?.replace(/\/$/, "");
  return slug ?? "";
}

/**
 * Builds a contact from the chat (always has the name) and, when available, the
 * attendee (adds avatar + @handle + profile URL). Falls back to the chat fields
 * so list rows render immediately before lazy hydration completes.
 */
function buildContact(chat: UnipileChat, attendee: UnipileAttendee | null = null): Contact {
  const providerId = chat.attendee_provider_id ?? chat.id;
  const handle = deriveHandle(attendee);
  return {
    id: providerId,
    channel: "instagram",
    displayName: resolveName(attendee?.name ?? chat.name),
    handle,
    avatarUrl: attendee?.picture_url ?? "",
    profileUrl:
      attendee?.profile_url ??
      (handle ? `https://www.instagram.com/${encodeURIComponent(handle)}` : ""),
  };
}

/**
 * Describes a non-text Instagram message (photo, shared post, story, etc.) so
 * media DMs render a meaningful label instead of an empty bubble.
 */
function describeAttachments(attachments?: UnipileAttachment[]): string {
  if (!attachments || attachments.length === 0) return "";
  const a = attachments[0];
  switch (a.type) {
    case "img":
    case "image":
      return "📷 Photo";
    case "video":
      return "🎥 Video";
    case "audio":
    case "voice":
      return "🎙️ Voice message";
    case "media_share":
      return a.post?.author ? `🔗 Shared @${a.post.author}'s post` : "🔗 Shared a post";
    case "story_mention":
      return "📖 Mentioned you in their story";
    case "story_reply":
      return "📖 Replied to your story";
    case "share":
    case "link":
      return "🔗 Shared a link";
    case "file":
      return "📎 Attachment";
    default:
      return "📎 Attachment";
  }
}

/** Best body text for a message: real text, else a media placeholder. */
function messageBody(m: UnipileMessage): string {
  const text = (m.text ?? "").trim();
  return text || describeAttachments(m.attachments);
}

function mapChatToConversation(chat: UnipileChat, lastMessagePreview = ""): Conversation {
  // Use the cached (avatar-hydrated) contact if we've resolved it before, else
  // the name-only contact from the chat object.
  const cached = contactCache.get(chat.attendee_provider_id ?? chat.id);
  return {
    id: chat.id,
    channel: "instagram",
    contact: cached ?? buildContact(chat),
    lastMessagePreview,
    lastMessageAt: chat.timestamp,
    unreadCount: chat.unread_count ?? 0,
    // status / assigneeId / tags / read-state are OUR app state, merged in by
    // the route. Instagram has no subject, so tags start empty.
    status: "open",
    assigneeId: null,
    tags: [],
  };
}

/** is_sender === 1 means the message was sent by OUR connected IG account. */
function isOutbound(m: UnipileMessage): boolean {
  return m.is_sender === 1;
}

function mapMessage(m: UnipileMessage, chatId: string): Message {
  const outbound = isOutbound(m);
  return {
    id: m.id,
    conversationId: chatId,
    channel: "instagram",
    direction: outbound ? "outbound" : "inbound",
    body: messageBody(m),
    sentAt: m.timestamp,
    deliveryStatus: outbound
      ? m.seen
        ? "read"
        : m.delivered
          ? "delivered"
          : "sent"
      : "delivered",
    authorType: outbound ? "agent" : "contact",
    authorName: outbound ? SBI_IG_NAME : "",
  };
}

function previewFor(chatId: string, sig: string): string {
  const cached = previewCache.get(chatId);
  return cached?.sig === sig ? cached.text : "";
}

export class InstagramAdapter implements ChannelAdapter {
  readonly channel: Channel = "instagram";

  /**
   * Lists IG conversations for one page. Names are already present on the chat
   * objects, so no per-row hydration fans out here. Previews are served from the
   * process cache only (empty until a row is lazily hydrated as it scrolls into
   * view). Returns the page plus the Unipile `cursor` for the next page.
   */
  async fetchConversationsPage(opts: { limit?: number; cursor?: string } = {}): Promise<{
    conversations: Conversation[];
    cursor: string | null;
  }> {
    const account = instagramAccount();
    const { items, cursor } = await listChatsPage(account, {
      limit: opts.limit ?? 30,
      cursor: opts.cursor,
    });
    // Guard against duplicate ids within a page (last-write-wins).
    const byId = new Map<string, Conversation>();
    for (const chat of items) {
      byId.set(chat.id, mapChatToConversation(chat, previewFor(chat.id, chat.timestamp)));
    }
    return { conversations: [...byId.values()], cursor };
  }

  /** ChannelAdapter contract: the first page's conversations. */
  async fetchConversations(): Promise<Conversation[]> {
    const { conversations } = await this.fetchConversationsPage();
    return conversations;
  }

  /** Fetches a single conversation (for the thread / contact panel). */
  async fetchConversation(chatId: string): Promise<Conversation | null> {
    const account = instagramAccount();
    let chat: UnipileChat;
    try {
      chat = await getChatForAccount(account, chatId);
    } catch {
      return null;
    }
    return mapChatToConversation(chat, previewFor(chat.id, chat.timestamp));
  }

  /**
   * On-demand hydration of a single row, called lazily as it scrolls into view:
   * the contact's avatar/@handle (from the attendees endpoint — the chat list
   * has the name but no picture) AND the last-message preview (latest message
   * only, limit=1 — no N+1 storm). `sig` keys the preview cache so it refreshes
   * when a newer message arrives; resolved contacts are cached process-wide.
   */
  async fetchRowData(
    chatId: string,
    sig: string,
  ): Promise<{ contact: Contact; lastMessagePreview: string }> {
    const account = instagramAccount();
    const [attendees, messages] = await Promise.all([
      getChatAttendeesForAccount(account, chatId).catch(() => [] as UnipileAttendee[]),
      getMessagesForAccount(account, chatId, { limit: 1 }),
    ]);

    const attendee =
      attendees.find((a) => a.is_self !== 1) ?? attendees[0] ?? null;

    // Build the contact from the chat (for the name) + attendee (avatar/handle).
    let chat: UnipileChat | null = null;
    try {
      chat = await getChatForAccount(account, chatId);
    } catch {
      /* fall back to a minimal chat shape below */
    }
    const baseChat: UnipileChat =
      chat ?? ({ id: chatId, attendee_provider_id: attendee?.provider_id ?? chatId } as UnipileChat);
    const contact = buildContact(baseChat, attendee);
    if (attendee) contactCache.set(contact.id, contact);

    const last = messages[0];
    let lastMessagePreview = "";
    if (last) {
      const body = messageBody(last);
      if (body) lastMessagePreview = isOutbound(last) ? `You: ${body}` : body;
    }
    if (sig) previewCache.set(chatId, { sig, text: lastMessagePreview });

    return { contact, lastMessagePreview };
  }

  async fetchMessages(externalConversationId: string): Promise<Message[]> {
    const account = instagramAccount();
    const messages = await getMessagesForAccount(account, externalConversationId);

    // Dedupe by id — webhook + poll + optimistic paths can momentarily surface
    // the same message twice; keep the last (freshest delivery state).
    const byId = new Map<string, Message>();
    for (const m of messages) {
      byId.set(m.id, mapMessage(m, externalConversationId));
    }
    return [...byId.values()].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
  }

  async sendMessage(externalConversationId: string, body: string): Promise<Message> {
    // ⚠️ NOT YET VERIFIED whether IG replies post under the SBI Instagram
    // account vs the connected personal identity. Callable, but MUST be tested
    // against a self-created test thread before production use.
    // TODO: verify send-as-page identity against a self-created test thread.
    // Do NOT test-send into real inbound threads.
    //
    // Meta enforces a 24h Customer Service Window — a send outside it is
    // rejected upstream. accountRequest surfaces that as a UnipileError, which
    // the route turns into a clean { error, status }; the client then marks the
    // optimistic bubble 'failed' and toasts. The composer also pre-disables send
    // when the window is closed, so this is the defensive backstop.
    const account = instagramAccount();
    const res = await sendMessageForAccount(account, externalConversationId, body);
    const id =
      (res.message_id as string | undefined) ??
      (res.id as string | undefined) ??
      `instagram-out-${Date.now()}`;

    return {
      id,
      conversationId: externalConversationId,
      channel: "instagram",
      direction: "outbound",
      body,
      sentAt: new Date().toISOString(),
      deliveryStatus: "sent",
      authorType: "agent",
      authorName: SBI_IG_NAME,
    };
  }
}

/** Singleton adapter used by the route handlers. */
export const instagramAdapter = new InstagramAdapter();
