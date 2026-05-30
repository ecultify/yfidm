import "server-only";

import type { Channel, Contact, Conversation, Message } from "@/lib/types";
import type { ChannelAdapter } from "./channel-adapter";
import {
  getChat,
  getChatAttendees,
  getMessages,
  listChats,
  sendMessage as unipileSendMessage,
  type UnipileAttendee,
  type UnipileChat,
  type UnipileMessage,
} from "@/lib/server/unipile";

/**
 * Sentinel display name for a not-yet-hydrated contact. The list renders these
 * rows immediately and the client lazily hydrates them as they scroll into view
 * (see useLazyContact), so a cold load never fans out a request per contact.
 */
export const CONTACT_PLACEHOLDER_NAME = "LinkedIn member";

/**
 * LinkedIn channel adapter backed by the Unipile API. SERVER ONLY - imported
 * exclusively by route handlers under app/api/inbox/. Translates Unipile
 * payloads into our normalized domain types. Field mappings below are verified
 * against live API responses.
 *
 * It maps ONLY Unipile-sourced data (messages, contact, timestamps). App-owned
 * workflow state (status, assignee, custom tags, notes, read overrides) is
 * merged in by the route via lib/server/app-store.ts - not here.
 */

/** Display name we attribute outbound messages to. */
const SBI_PAGE_NAME = "SBI Youth for India";

/**
 * Process-wide cache of resolved contacts (providerId -> Contact). Avoids
 * re-hydrating the same contact on every list load / poll. Failed lookups are
 * NOT cached, so they retry (and progressively hydrate) on subsequent loads.
 * // TODO: move to a shared cache / DB with TTL when persistence lands.
 */
const contactCache = new Map<string, Contact>();

/**
 * Process-wide cache of last-message previews (chatId -> {sig, text}). `sig` is
 * the chat's last-activity timestamp; when it changes (a new message arrives),
 * the cached preview is treated as stale and re-hydrated. Unipile's chat list
 * carries no message snippet, so previews are fetched lazily per visible row.
 * // TODO: move to a shared cache / DB; invalidate from the webhook.
 */
const previewCache = new Map<string, { sig: string; text: string }>();

/** Runs `fn` over `items` with bounded concurrency (gentle on LinkedIn limits). */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Resolves a chat's contact via the (un-throttled) attendees endpoint, caching
 * the result process-wide so subsequent list loads are instant.
 */
async function resolveContact(chatId: string, providerId: string): Promise<Contact> {
  const cached = contactCache.get(providerId);
  if (cached) return cached;
  try {
    const attendees = await getChatAttendees(chatId);
    const attendee =
      attendees.find((a) => a.provider_id === providerId) ??
      attendees.find((a) => a.is_self !== 1) ??
      attendees[0] ??
      null;
    const contact = buildContact(providerId, attendee);
    contactCache.set(providerId, contact);
    return contact;
  } catch {
    // Fall back without caching so it retries (and hydrates) next load.
    return buildContact(providerId, null);
  }
}

/** Derives a readable handle, avoiding the opaque internal provider id. */
function deriveHandle(attendee: UnipileAttendee | null): string {
  const vanity = attendee?.specifics?.public_identifier;
  if (vanity) return vanity;
  // profile_url is often linkedin.com/in/<provider_id>; only use the slug if
  // it's a real vanity (provider ids start with "ACoAA").
  const slug = attendee?.profile_url?.split("/in/")[1]?.replace(/\/$/, "");
  if (slug && !slug.startsWith("ACoAA")) return slug;
  return "";
}

function buildContact(
  providerId: string,
  attendee: UnipileAttendee | null,
): Contact {
  return {
    id: providerId,
    channel: "linkedin",
    displayName: attendee?.name?.trim() || "LinkedIn user",
    handle: deriveHandle(attendee),
    avatarUrl: attendee?.picture_url ?? "",
    profileUrl:
      attendee?.profile_url ??
      `https://www.linkedin.com/in/${encodeURIComponent(providerId)}`,
  };
}

/** A lightweight, un-hydrated contact shown until lazy hydration completes. */
function placeholderContact(providerId: string): Contact {
  return {
    id: providerId,
    channel: "linkedin",
    displayName: CONTACT_PLACEHOLDER_NAME,
    handle: "",
    avatarUrl: "",
    profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(providerId)}`,
  };
}

function mapChatToConversation(chat: UnipileChat, contact: Contact): Conversation {
  return {
    id: chat.id,
    channel: "linkedin",
    contact,
    // Unipile's chat object carries no last-message text; leaving empty keeps
    // listing cheap (no per-chat message fetch).
    // TODO: hydrate lastMessagePreview from the latest message if desired.
    lastMessagePreview: "",
    lastMessageAt: chat.timestamp,
    unreadCount: chat.unread_count,
    // status / assigneeId / extra tags / read-state are OUR app state and are
    // merged in by the route. The LinkedIn subject becomes the initial tag.
    status: "open",
    assigneeId: null,
    tags: chat.subject ? [chat.subject] : [],
  };
}

/**
 * Determines whether a message was sent BY US (the SBI page).
 *
 * ⚠️ In a LinkedIn ORGANIZATION mailbox, Unipile reports `is_sender: 0` and
 * `attendee_type: "ORGANIZATION"` for EVERY message - neither distinguishes
 * direction. The reliable signal is `sender_id`: the page's own replies carry
 * `sender_id === <mailbox id>` (e.g. "2271371"), while the contact's messages
 * carry `sender_id === <their provider_id>`. We treat anything sent by the page
 * id (or the legacy `is_sender === 1`) as outbound.
 */
function isOutbound(m: UnipileMessage, sbiMailboxId: string | undefined): boolean {
  if (m.is_sender === 1) return true;
  if (sbiMailboxId && m.sender_id === sbiMailboxId) return true;
  return false;
}

function mapMessage(
  m: UnipileMessage,
  chatId: string,
  sbiMailboxId: string | undefined,
): Message {
  const outbound = isOutbound(m, sbiMailboxId);
  return {
    id: m.id,
    conversationId: chatId,
    channel: "linkedin",
    direction: outbound ? "outbound" : "inbound",
    body: m.text ?? "",
    sentAt: m.timestamp,
    deliveryStatus: m.delivered ? "delivered" : "sent",
    authorType: outbound ? "agent" : "contact",
    authorName: outbound ? SBI_PAGE_NAME : "",
  };
}

export class LinkedInAdapter implements ChannelAdapter {
  readonly channel: Channel = "linkedin";

  /**
   * Lists SBI conversations. Contacts are resolved from the process cache only
   * (no network) - uncached ones get a placeholder and are hydrated lazily by
   * the client as rows scroll into view. Pass `{ hydrateContacts: true }` to
   * eagerly resolve everything (e.g. for a server-side export).
   */
  async fetchConversations(opts?: {
    hydrateContacts?: boolean;
  }): Promise<Conversation[]> {
    const sbiMailboxId = process.env.UNIPILE_SBI_MAILBOX_ID;
    const chats = await listChats();
    const sbiChats = chats.filter((c) => c.mailbox_id === sbiMailboxId);

    if (opts?.hydrateContacts) {
      const contacts = await pool(sbiChats, 3, (chat) =>
        resolveContact(chat.id, chat.attendee_provider_id),
      );
      return sbiChats.map((chat, i) => mapChatToConversation(chat, contacts[i]));
    }

    return sbiChats.map((chat) => {
      const contact =
        contactCache.get(chat.attendee_provider_id) ??
        placeholderContact(chat.attendee_provider_id);
      const cachedPreview = previewCache.get(chat.id);
      const lastMessagePreview =
        cachedPreview?.sig === chat.timestamp ? cachedPreview.text : "";
      return { ...mapChatToConversation(chat, contact), lastMessagePreview };
    });
  }

  /**
   * On-demand hydration of a single row's contact AND last-message preview,
   * called lazily by the UI as the row scrolls into view. `sig` is the row's
   * known last-activity timestamp, used to key the preview cache so it
   * auto-refreshes when a newer message arrives.
   */
  async fetchRowData(
    chatId: string,
    sig: string,
  ): Promise<{ contact: Contact; lastMessagePreview: string }> {
    const sbiMailboxId = process.env.UNIPILE_SBI_MAILBOX_ID;
    const [attendees, messages] = await Promise.all([
      getChatAttendees(chatId),
      getMessages(chatId),
    ]);

    const attendee =
      attendees.find((a) => a.is_self !== 1) ?? attendees[0] ?? null;
    const providerId = attendee?.provider_id ?? chatId;
    let contact = contactCache.get(providerId);
    if (!contact) {
      contact = buildContact(providerId, attendee);
      if (attendee) contactCache.set(providerId, contact);
    }

    const sorted = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const last = sorted[sorted.length - 1];
    let lastMessagePreview = "";
    if (last) {
      const text = (last.text ?? "").trim();
      if (text) {
        lastMessagePreview = isOutbound(last, sbiMailboxId)
          ? `You: ${text}`
          : text;
      }
    }
    if (sig) previewCache.set(chatId, { sig, text: lastMessagePreview });

    return { contact, lastMessagePreview };
  }

  /** Fetches one conversation with its contact hydrated (for thread/contact panel). */
  async fetchConversation(chatId: string): Promise<Conversation | null> {
    let chat: UnipileChat;
    try {
      chat = await getChat(chatId);
    } catch {
      return null;
    }
    const contact = await resolveContact(chatId, chat.attendee_provider_id);
    return mapChatToConversation(chat, contact);
  }

  async fetchMessages(externalConversationId: string): Promise<Message[]> {
    const sbiMailboxId = process.env.UNIPILE_SBI_MAILBOX_ID;
    const messages = await getMessages(externalConversationId);

    // Dedupe by id - Unipile and our optimistic/refetch paths can momentarily
    // surface the same message twice; keep the last (freshest delivery state).
    const byId = new Map<string, Message>();
    for (const m of messages) {
      byId.set(m.id, mapMessage(m, externalConversationId, sbiMailboxId));
    }

    return [...byId.values()].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
  }

  async sendMessage(externalConversationId: string, body: string): Promise<Message> {
    // ⚠️ NOT YET VERIFIED whether replies post under the SBI Page identity or
    // the connected personal account (Anjali Sharma's session). This path is
    // callable but MUST be tested against a self-created thread before
    // production use. // TODO: verify sender identity, then remove this notice.
    const res = await unipileSendMessage(externalConversationId, body);
    const id =
      (res.message_id as string | undefined) ??
      (res.id as string | undefined) ??
      `linkedin-out-${Date.now()}`;

    return {
      id,
      conversationId: externalConversationId,
      channel: "linkedin",
      direction: "outbound",
      body,
      sentAt: new Date().toISOString(),
      deliveryStatus: "sent",
      authorType: "agent",
      authorName: SBI_PAGE_NAME,
    };
  }
}

/** Singleton adapter used by the route handlers. */
export const linkedinAdapter = new LinkedInAdapter();
