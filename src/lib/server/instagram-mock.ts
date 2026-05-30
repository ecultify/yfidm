import "server-only";

import type { Conversation, Message } from "@/lib/types";
import { buildSeed } from "@/lib/services/mock-data";

/**
 * Server-side Instagram MOCK source, used when INBOX_INSTAGRAM_SOURCE !== 'real'
 * so the inbox can be demoed without hitting the live Unipile/Meta API.
 *
 * It reuses the existing seed (the IG subset) so the data matches the rest of
 * the prototype. App-owned workflow state (status / read / tags / notes) still
 * flows through the shared app-store + mergeConversation, exactly like the real
 * path, so e.g. clearing the unread chip on open works in mock mode too.
 *
 * // TODO: this is read-only - mock sends are not persisted across refetches.
 * //       Swap INBOX_INSTAGRAM_SOURCE=real for the full round-trip.
 */
export function mockInstagramConversations(): Conversation[] {
  return buildSeed().conversations.filter((c) => c.channel === "instagram");
}

export function mockInstagramConversation(id: string): Conversation | null {
  return mockInstagramConversations().find((c) => c.id === id) ?? null;
}

export function mockInstagramMessages(conversationId: string): Message[] {
  const all = buildSeed().messagesByConversation[conversationId] ?? [];
  return all.filter((m) => m.channel === "instagram");
}
