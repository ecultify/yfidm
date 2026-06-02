"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import type { Message } from "@/lib/types";
import { queryKeys } from "./query-keys";

/**
 * Near-realtime via the server "pulse": polls a cheap counter (one DB read, no
 * Unipile) every few seconds. When it rises — a Unipile webhook reported a new
 * inbound message — we invalidate conversations + the open message thread so
 * React Query refetches from Unipile ONLY then. Event-driven, so the provider
 * isn't polled on a timer.
 */
export function useInboxPulse() {
  const qc = useQueryClient();
  const lastRev = useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ["inbox-pulse"],
    queryFn: async () => {
      const res = await fetch("/api/inbox/pulse", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error("pulse failed");
      return (await res.json()) as { rev: number };
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    const rev = data?.rev;
    if (rev === undefined) return;
    if (lastRev.current === null) {
      lastRev.current = rev; // seed without firing on first load
      return;
    }
    if (rev > lastRev.current) {
      lastRev.current = rev;
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    }
  }, [data?.rev, qc]);
}

/**
 * Subscribes to the service's realtime seam. Inbound messages are merged into
 * the relevant message thread and conversation lists are refreshed. An optional
 * callback lets the UI surface a toast / sound.
 */
export function useRealtimeInbound(onInbound?: (m: Message) => void) {
  const qc = useQueryClient();

  useEffect(() => {
    const unsubscribe = inboxService.subscribe((message) => {
      qc.setQueryData<Message[]>(queryKeys.messages(message.conversationId), (old) =>
        old ? [...old, message] : old,
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onInbound?.(message);
    });
    return unsubscribe;
    // onInbound is intentionally not a dependency - the latest closure is fine
    // for a fire-and-forget toast, and re-subscribing on every render is wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);
}
