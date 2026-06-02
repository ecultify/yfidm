"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

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

export interface ResolvedLink {
  source: string;
  final: string | null;
  domain: string | null;
  label?: string;
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
  /** Real Brand24 post time (display + grouping). */
  postedAt: string;
  /** When we captured/imported it. */
  createdAt: string;
  /** Links in the alert, resolved through Brand24 redirects to final URLs. */
  links: ResolvedLink[];
}

export interface Brand24Page {
  items: Brand24Notification[];
  total: number;
  page: number;
  pageSize: number;
}

async function fetchPage(
  page: number,
  pageSize: number,
  q: string,
): Promise<Brand24Page> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (q) params.set("q", q);
  const res = await fetch(`/api/brand24/notifications?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't load Brand24 notifications.");
  }
  return res.json();
}

/**
 * One page of captured Brand24 alerts (optionally filtered by `q`, server-side
 * across all pages). Polls every 20s so new mentions appear shortly after
 * Brand24 posts them, and keeps the previous page on screen while the next
 * loads (no flash when paging).
 */
export function useBrand24Notifications(page: number, q = "", pageSize = 25) {
  return useQuery({
    queryKey: ["brand24", "notifications", page, pageSize, q],
    queryFn: () => fetchPage(page, pageSize, q),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
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
