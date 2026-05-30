"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { inboxService } from "@/lib/services";
import type { Message } from "@/lib/types";
import { queryKeys } from "./query-keys";

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
