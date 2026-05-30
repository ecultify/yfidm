import type {
  Agent,
  Conversation,
  ConversationFilter,
  ConversationStatus,
  InternalNote,
  Message,
} from "@/lib/types";

/**
 * The single seam between the UI and any data source.
 *
 * The UI ONLY ever talks to an implementation of this interface (through the
 * React Query hooks in `lib/hooks`). To go live, swap the mock implementation
 * exported from `lib/services/index.ts` for one backed by real channel
 * adapters — no UI changes required.
 */
export interface InboxService {
  listConversations(filter?: ConversationFilter): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;

  listMessages(conversationId: string): Promise<Message[]>;
  sendMessage(conversationId: string, body: string): Promise<Message>;

  setStatus(conversationId: string, status: ConversationStatus): Promise<void>;
  assign(conversationId: string, agentId: string | null): Promise<void>;

  addTag(conversationId: string, tag: string): Promise<void>;
  removeTag(conversationId: string, tag: string): Promise<void>;

  markRead(conversationId: string, read: boolean): Promise<void>;

  listAgents(): Promise<Agent[]>;

  listNotes(conversationId: string): Promise<InternalNote[]>;
  addNote(conversationId: string, body: string): Promise<InternalNote>;

  /**
   * Realtime seam. Registers a listener for inbound messages and returns an
   * unsubscribe function. A real implementation would back this with a
   * websocket / SSE stream fed by platform webhooks.
   */
  subscribe(onInbound: (m: Message) => void): () => void;
}
