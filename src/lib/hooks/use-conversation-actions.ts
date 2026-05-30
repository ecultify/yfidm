"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import type { Conversation, ConversationStatus } from "@/lib/types";
import { invalidateConversations, patchConversationEverywhere } from "./optimistic";

/** Assign / reassign (or unassign with `null`) a conversation. */
export function useAssign(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string | null) =>
      inboxService.assign(conversationId, agentId),
    onMutate: async (agentId) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      return { rollback: patchConversationEverywhere(qc, conversationId, { assigneeId: agentId }) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateConversations(qc, conversationId),
  });
}

/** Move a conversation through the status workflow. */
export function useSetStatus(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: ConversationStatus) =>
      inboxService.setStatus(conversationId, status),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      return { rollback: patchConversationEverywhere(qc, conversationId, { status }) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateConversations(qc, conversationId),
  });
}

/** Mark a conversation read (clears unread) or unread. */
export function useMarkRead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (read: boolean) => inboxService.markRead(conversationId, read),
    onMutate: async (read) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      return {
        rollback: patchConversationEverywhere(qc, conversationId, {
          unreadCount: read ? 0 : 1,
        }),
      };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateConversations(qc, conversationId),
  });
}

/** Add or remove a colored tag/label inline. */
export function useTags(conversationId: string) {
  const qc = useQueryClient();

  const mutate = (compute: (current: string[]) => string[]) => {
    const lists = qc.getQueriesData<Conversation[]>({ queryKey: ["conversations"] });
    let current: string[] = [];
    for (const [, data] of lists) {
      const found = data?.find((c) => c.id === conversationId);
      if (found) {
        current = found.tags;
        break;
      }
    }
    return patchConversationEverywhere(qc, conversationId, { tags: compute(current) });
  };

  const addTag = useMutation({
    mutationFn: (tag: string) => inboxService.addTag(conversationId, tag),
    onMutate: async (tag) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      return {
        rollback: mutate((current) =>
          current.includes(tag) ? current : [...current, tag],
        ),
      };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateConversations(qc, conversationId),
  });

  const removeTag = useMutation({
    mutationFn: (tag: string) => inboxService.removeTag(conversationId, tag),
    onMutate: async (tag) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      return { rollback: mutate((current) => current.filter((t) => t !== tag)) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateConversations(qc, conversationId),
  });

  return { addTag, removeTag };
}
