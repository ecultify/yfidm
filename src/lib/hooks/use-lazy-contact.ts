"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contact, Conversation } from "@/lib/types";
import { queryKeys } from "./query-keys";

/** Sentinel name the server uses for a not-yet-hydrated LinkedIn contact. */
export const CONTACT_PLACEHOLDER_NAME = "LinkedIn member";

interface RowData {
  contact: Contact;
  lastMessagePreview: string;
}

/**
 * Lazily hydrates a LinkedIn row (contact + last-message preview) once it's in
 * view. The conversations list returns placeholder contacts and empty previews
 * on cold load (no per-row network calls); this fetches the real data from
 * /api/inbox/conversations/[id]/preview when the row scrolls into view, then
 * patches every cached conversation list AND the single-conversation cache so
 * the thread header / contact panel update too.
 *
 * Returns the best values to render right now.
 */
export function useLazyRow(
  conversation: Conversation,
  inView: boolean,
): RowData {
  const qc = useQueryClient();
  const isLinkedin = conversation.channel === "linkedin";
  const isInstagram = conversation.channel === "instagram";

  // LinkedIn rows arrive with a placeholder contact AND empty preview; Instagram
  // rows already carry the contact name (no N+1 getUser), so only the preview is
  // lazily hydrated. Both fetch only when the row scrolls into view.
  const needsHydration =
    (isLinkedin &&
      (conversation.contact.displayName === CONTACT_PLACEHOLDER_NAME ||
        conversation.lastMessagePreview === "")) ||
    // IG rows arrive with the name but no avatar/handle, so hydrate when either
    // the avatar OR the preview is still missing.
    (isInstagram &&
      (conversation.contact.avatarUrl === "" ||
        conversation.lastMessagePreview === ""));

  const previewBase = isInstagram
    ? `/api/inbox/instagram/conversations/${conversation.id}/preview`
    : `/api/inbox/conversations/${conversation.id}/preview`;

  const { data } = useQuery({
    queryKey: ["row-data", conversation.id, conversation.lastMessageAt],
    queryFn: async (): Promise<Partial<RowData>> => {
      const res = await fetch(
        `${previewBase}?sig=${encodeURIComponent(conversation.lastMessageAt)}`,
      );
      if (!res.ok) throw new Error("Failed to hydrate row");
      // IG returns { lastMessagePreview } only; LinkedIn returns both fields.
      return (await res.json()) as Partial<RowData>;
    },
    enabled: needsHydration && inView,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!data) return;

    // Patch only the fields the source returned, so IG's contact (already known)
    // isn't clobbered with an undefined from the preview-only response.
    const patch: Partial<Conversation> = {};
    if (data.contact) patch.contact = data.contact;
    if (data.lastMessagePreview !== undefined)
      patch.lastMessagePreview = data.lastMessagePreview;
    if (Object.keys(patch).length === 0) return;

    qc.getQueriesData<Conversation[]>({ queryKey: ["conversations"] }).forEach(
      ([key, list]) => {
        if (!list) return;
        qc.setQueryData<Conversation[]>(
          key,
          list.map((c) => (c.id === conversation.id ? { ...c, ...patch } : c)),
        );
      },
    );

    const single = qc.getQueryData<Conversation | null>(
      queryKeys.conversation(conversation.id),
    );
    if (single) {
      qc.setQueryData(queryKeys.conversation(conversation.id), {
        ...single,
        ...patch,
      });
    }
  }, [data, qc, conversation.id]);

  return {
    contact: data?.contact ?? conversation.contact,
    lastMessagePreview: data?.lastMessagePreview ?? conversation.lastMessagePreview,
  };
}
