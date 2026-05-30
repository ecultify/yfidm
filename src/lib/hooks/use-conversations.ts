"use client";

import { useQuery } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import type { ConversationFilter } from "@/lib/types";
import { queryKeys } from "./query-keys";

/** Lists conversations for the given (combinable) filter. */
export function useConversations(filter?: ConversationFilter) {
  return useQuery({
    queryKey: queryKeys.conversations(filter),
    queryFn: () => inboxService.listConversations(filter),
  });
}

/** Fetches a single conversation's metadata. */
export function useConversation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.conversation(id ?? ""),
    queryFn: () => inboxService.getConversation(id as string),
    enabled: Boolean(id),
  });
}
