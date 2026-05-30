"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import { queryKeys } from "./query-keys";

/** Lists internal (team-only) notes for a conversation. */
export function useNotes(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.notes(conversationId ?? ""),
    queryFn: () => inboxService.listNotes(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

/** Adds an internal note (never sent to the contact). */
export function useAddNote(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => inboxService.addNote(conversationId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes(conversationId) });
    },
  });
}
