import type { ConversationFilter } from "@/lib/types";

/**
 * Centralized React Query key factory. Keeping these in one place makes cache
 * invalidation predictable as the data layer grows.
 */
export const queryKeys = {
  conversations: (filter?: ConversationFilter) =>
    ["conversations", filter ?? {}] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  agents: () => ["agents"] as const,
  notes: (conversationId: string) => ["notes", conversationId] as const,
  activity: (conversationId: string) => ["activity", conversationId] as const,
};
