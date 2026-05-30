/**
 * Normalized, platform-agnostic domain types for the unified DM inbox.
 *
 * These types are the contract between the UI and the data layer. Real channel
 * adapters (Meta Graph, LinkedIn, etc.) map their native payloads INTO these
 * shapes, so the UI never depends on any single provider's schema.
 */

export type Channel = "instagram" | "facebook" | "linkedin";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export type MessageDirection = "inbound" | "outbound";

export type MessageDeliveryStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type AuthorType = "contact" | "agent" | "system";

export interface Contact {
  id: string;
  channel: Channel;
  displayName: string;
  /** Platform handle, e.g. "@jane.doe" or a LinkedIn vanity URL slug. */
  handle: string;
  avatarUrl: string;
  /** Deep link to the contact's profile on the source platform. */
  profileUrl: string;
}

export interface Message {
  id: string;
  conversationId: string;
  channel: Channel;
  direction: MessageDirection;
  body: string;
  /** ISO-8601 timestamp. */
  sentAt: string;
  deliveryStatus: MessageDeliveryStatus;
  authorType: AuthorType;
  authorName: string;
}

export interface Conversation {
  id: string;
  channel: Channel;
  contact: Contact;
  lastMessagePreview: string;
  /** ISO-8601 timestamp of the most recent message. */
  lastMessageAt: string;
  unreadCount: number;
  status: ConversationStatus;
  assigneeId: string | null;
  tags: string[];
}

export interface Agent {
  id: string;
  name: string;
  avatarUrl: string;
  email: string;
}

export interface InternalNote {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  body: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/**
 * Filter applied when listing conversations. All fields are optional and
 * combine with AND semantics (e.g. channel=linkedin AND status=open AND
 * assigneeId=me). Designed so the same filter object can be forwarded to a
 * real backend query later.
 */
export interface ConversationFilter {
  channel?: Channel;
  status?: ConversationStatus;
  assigneeId?: string | null;
  /** Convenience flag for the "Assigned to me" rail item. */
  assignedToMe?: boolean;
  /** Only conversations with unreadCount > 0. */
  unreadOnly?: boolean;
  /** Only conversations that have at least one internal note / mention. */
  hasNotes?: boolean;
  /** Free-text search across contact name, handle and last message. */
  search?: string;
}
