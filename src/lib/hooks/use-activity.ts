"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

/** A single activity-log entry as shown in the contact panel timeline. */
export interface ActivityEntry {
  id: number;
  actorId: string | null;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

/**
 * Loads the activity timeline for a conversation (who assigned / replied /
 * tagged / changed status / added a note). Polls so the team sees each other's
 * actions in near-realtime, matching the rest of the app's polling cadence.
 */
export function useActivity(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.activity(conversationId ?? ""),
    queryFn: async (): Promise<ActivityEntry[]> => {
      const res = await fetch(
        `/api/inbox/conversations/${conversationId}/activity`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) return [];
      return (await res.json()) as ActivityEntry[];
    },
    enabled: Boolean(conversationId),
    refetchInterval: 20_000,
  });
}
