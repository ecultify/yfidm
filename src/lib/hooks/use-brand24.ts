"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Mirror of the server's Brand24Notification (see lib/server/brand24.ts). */
export interface Brand24Attachment {
  title?: string;
  title_link?: string;
  pretext?: string;
  text?: string;
  fallback?: string;
  footer?: string;
  color?: string;
  image_url?: string;
  fields?: { title?: string; value?: string }[];
}

export interface Brand24Notification {
  id: number;
  channel: string;
  ts: string;
  appId: string | null;
  botId: string | null;
  text: string;
  preview: string;
  attachments: Brand24Attachment[];
  createdAt: string;
}

async function fetchNotifications(): Promise<Brand24Notification[]> {
  const res = await fetch("/api/brand24/notifications", {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't load Brand24 notifications.");
  }
  return res.json();
}

/**
 * Lists captured Brand24 alerts, polling every 20s so new mentions appear
 * shortly after Brand24 posts them to Slack. Keeps the previous data visible
 * while refetching so the list doesn't flash.
 */
export function useBrand24Notifications() {
  return useQuery({
    queryKey: ["brand24", "notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

export interface BackfillResult {
  fetched: number;
  inserted: number;
  duplicates: number;
  skippedNonBot: number;
  pages: number;
  truncated: boolean;
}

/**
 * Pulls older alerts from Slack channel history into the DB (admin-only on the
 * server). On success, refetches the list so the recovered alerts appear.
 */
export function useBrand24Backfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BackfillResult> => {
      const res = await fetch("/api/brand24/backfill", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ?? "Backfill failed.",
        );
      }
      return body as BackfillResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand24", "notifications"] });
    },
  });
}
