import type { QueryClient } from "@tanstack/react-query";
import type { Conversation } from "@/lib/types";
import { queryKeys } from "./query-keys";

/**
 * Optimistically applies a partial patch to a conversation everywhere it's
 * cached — both every `["conversations", filter]` list and the single
 * `["conversation", id]` entry. Returns a rollback snapshot for onError.
 */
export function patchConversationEverywhere(
  qc: QueryClient,
  id: string,
  patch: Partial<Conversation>,
) {
  const lists = qc.getQueriesData<Conversation[]>({ queryKey: ["conversations"] });
  const snapshots = lists.map(([key, data]) => [key, data] as const);

  lists.forEach(([key, data]) => {
    if (!data) return;
    qc.setQueryData<Conversation[]>(
      key,
      data.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  });

  const singleKey = queryKeys.conversation(id);
  const singleSnapshot = qc.getQueryData<Conversation | null>(singleKey);
  if (singleSnapshot) {
    qc.setQueryData<Conversation>(singleKey, { ...singleSnapshot, ...patch });
  }

  return () => {
    snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    qc.setQueryData(singleKey, singleSnapshot);
  };
}

export function invalidateConversations(qc: QueryClient, id?: string) {
  qc.invalidateQueries({ queryKey: ["conversations"] });
  if (id) {
    qc.invalidateQueries({ queryKey: queryKeys.conversation(id) });
    // The action was just logged server-side — refresh the activity timeline.
    qc.invalidateQueries({ queryKey: queryKeys.activity(id) });
  }
}
