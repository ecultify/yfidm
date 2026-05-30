"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import type { Conversation, Message } from "@/lib/types";
import { queryKeys } from "./query-keys";

/** Loads the message thread for a conversation. */
export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? ""),
    queryFn: () => inboxService.listMessages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

// The optimistic outbound bubble is attributed to "You"; the server response
// (which carries the real channel-page author name) replaces it on success.
const currentAgentName = "You";

/**
 * Sends a reply with an optimistic update: the bubble appears instantly with a
 * "sending" status, then reconciles to the server message (which transitions
 * through sent -> delivered -> read on its own).
 */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => inboxService.sendMessage(conversationId, body),

    onMutate: async (body: string) => {
      const key = queryKeys.messages(conversationId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Message[]>(key);

      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        channel: previous?.[0]?.channel ?? "instagram",
        direction: "outbound",
        body,
        sentAt: new Date().toISOString(),
        deliveryStatus: "sending",
        authorType: "agent",
        authorName: currentAgentName,
      };

      qc.setQueryData<Message[]>(key, (old) => [...(old ?? []), optimistic]);

      // Reflect the new preview in any cached conversation lists immediately.
      patchConversationLists(qc, conversationId, body, optimistic.sentAt);

      return { previous, optimisticId: optimistic.id };
    },

    onError: (_err, _body, ctx) => {
      if (!ctx) return;
      // Mark the optimistic bubble as failed rather than dropping it, so the
      // agent can retry.
      qc.setQueryData<Message[]>(queryKeys.messages(conversationId), (old) =>
        (old ?? []).map((m) =>
          m.id === ctx.optimisticId ? { ...m, deliveryStatus: "failed" } : m,
        ),
      );
    },

    onSuccess: (serverMessage, _body, ctx) => {
      // Replace the optimistic bubble with the canonical server message.
      qc.setQueryData<Message[]>(queryKeys.messages(conversationId), (old) =>
        (old ?? []).map((m) =>
          m.id === ctx?.optimisticId ? serverMessage : m,
        ),
      );
      // Poll briefly so the delivered/read transitions surface in the UI.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        1500,
      );
      setTimeout(
        () => qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        3500,
      );
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      // A reply was logged to the activity timeline server-side.
      qc.invalidateQueries({ queryKey: queryKeys.activity(conversationId) });
    },
  });
}

function patchConversationLists(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  preview: string,
  at: string,
) {
  qc.getQueriesData<Conversation[]>({ queryKey: ["conversations"] }).forEach(
    ([key, data]) => {
      if (!data) return;
      qc.setQueryData<Conversation[]>(
        key,
        data.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessagePreview: preview, lastMessageAt: at }
            : c,
        ),
      );
    },
  );
}
