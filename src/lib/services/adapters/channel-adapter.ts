import type { Channel, Conversation, Message } from "@/lib/types";

/**
 * Contract every real channel integration implements.
 *
 * An adapter's job is purely translation: call the provider's API, then map
 * the provider-specific payload into our normalized domain types
 * (`Conversation`, `Message`). Nothing above this layer knows about Graph API
 * cursors, LinkedIn URNs, etc.
 *
 * The mock service does NOT use adapters - it fabricates normalized data
 * directly. Adapters are the production path: `MockInboxService` in
 * `index.ts` gets replaced by a service that fans out across these adapters.
 */
export interface ChannelAdapter {
  readonly channel: Channel;

  fetchConversations(): Promise<Conversation[]>;
  fetchMessages(externalConversationId: string): Promise<Message[]>;
  sendMessage(externalConversationId: string, body: string): Promise<Message>;
}
