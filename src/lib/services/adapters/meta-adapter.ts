import type { Channel, Conversation, Message } from "@/lib/types";
import type { ChannelAdapter } from "./channel-adapter";

/**
 * Meta (Instagram + Facebook) adapter - UNIMPLEMENTED STUB.
 *
 * Instagram Direct and Facebook Messenger are both served by the Meta Graph
 * API, so a single adapter handles both surfaces. Construct one per `channel`.
 *
 * Auth: Meta App + Page access token with `instagram_manage_messages` /
 * `pages_messaging` scopes. Conversations live under
 *   GET /{page-id}/conversations?platform=instagram|messenger
 * and messages under
 *   GET /{conversation-id}/messages?fields=message,from,to,created_time
 *
 * TODO: integrate Meta Graph API.
 */
export class MetaAdapter implements ChannelAdapter {
  readonly channel: Channel;

  constructor(channel: Extract<Channel, "instagram" | "facebook">) {
    this.channel = channel;
  }

  async fetchConversations(): Promise<Conversation[]> {
    // TODO: integrate Meta Graph API.
    // 1. GET /{page-id}/conversations?platform={messenger|instagram}
    // 2. For each thread, map the Meta payload -> Conversation:
    //      thread.id                      -> Conversation.id
    //      thread.participants[0]         -> Conversation.contact (see below)
    //      thread.snippet                 -> Conversation.lastMessagePreview
    //      thread.updated_time            -> Conversation.lastMessageAt
    //      thread.unread_count            -> Conversation.unreadCount
    //    status / assigneeId / tags are app-side metadata (store separately).
    throw new Error(`MetaAdapter(${this.channel}).fetchConversations not implemented`);
  }

  async fetchMessages(externalConversationId: string): Promise<Message[]> {
    // TODO: integrate Meta Graph API.
    // GET /{conversation-id}/messages?fields=id,message,from,created_time
    // Map each Meta message -> Message:
    //   msg.id                                   -> Message.id
    //   msg.message                              -> Message.body
    //   msg.from.id === pageId ? 'outbound'      -> Message.direction
    //                          : 'inbound'
    //   msg.created_time                         -> Message.sentAt
    //   delivery/read receipts (webhook events)  -> Message.deliveryStatus
    void externalConversationId;
    throw new Error(`MetaAdapter(${this.channel}).fetchMessages not implemented`);
  }

  async sendMessage(externalConversationId: string, body: string): Promise<Message> {
    // TODO: integrate Meta Graph API.
    // POST /{page-id}/messages { recipient: { id }, message: { text: body } }
    // then map the API response (message_id, timestamp) -> normalized Message.
    void externalConversationId;
    void body;
    throw new Error(`MetaAdapter(${this.channel}).sendMessage not implemented`);
  }
}
