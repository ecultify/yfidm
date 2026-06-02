"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { ArrowLeftIcon } from "@/components/icons/arrow-left";
import { BellIcon } from "@/components/icons/bell";
import { HistoryIcon } from "@/components/icons/history";
import { RefreshCWIcon } from "@/components/icons/refresh-cw";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { dayLabel, messageTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/lib/hooks";
import {
  useBrand24Analytics,
  useBrand24Backfill,
  useBrand24Notifications,
  type Brand24Attachment,
  type Brand24LinkStat,
  type Brand24Notification,
  type ResolvedLink,
} from "@/lib/hooks/use-brand24";

/** Group notifications under day headers, preserving the newest-first order. */
function groupByDay(items: Brand24Notification[]) {
  const groups: { day: string; items: Brand24Notification[] }[] = [];
  for (const item of items) {
    const day = dayLabel(item.postedAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** A single attachment block (Brand24 puts the mention details here). */
function Attachment({ a }: { a: Brand24Attachment }) {
  const hasFields = (a.fields?.length ?? 0) > 0;
  return (
    <div
      className="rounded-md border-l-2 bg-muted/40 p-3 text-sm"
      style={a.color ? { borderLeftColor: `#${a.color.replace("#", "")}` } : undefined}
    >
      {a.pretext && (
        <p className="mb-1 text-xs text-muted-foreground">{a.pretext}</p>
      )}
      {a.title &&
        (a.title_link ? (
          <a
            href={a.title_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            {a.title}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <p className="font-medium">{a.title}</p>
        ))}
      {a.text && (
        <p className="mt-1 whitespace-pre-wrap text-foreground/90">{a.text}</p>
      )}
      {hasFields && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {a.fields!.map((f, i) => (
            <div key={i} className="min-w-0">
              {f.title && (
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {f.title}
                </dt>
              )}
              {f.value && (
                <dd className="truncate text-xs text-foreground/90">{f.value}</dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {a.footer && (
        <p className="mt-2 text-[11px] text-muted-foreground">{a.footer}</p>
      )}
    </div>
  );
}

/** Compact, clickable chip for a resolved post link. */
function PostLinkChip({ l }: { l: ResolvedLink }) {
  const href = l.final ?? l.source;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <ExternalLink className="size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
      <span className="truncate font-medium">{l.domain ?? "link"}</span>
      {!l.final && (
        <span
          className="shrink-0 text-[10px] text-muted-foreground/70"
          title="Redirect couldn't be resolved — opens the original link"
        >
          source
        </span>
      )}
    </a>
  );
}

function NotificationCard({ n }: { n: Brand24Notification }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded bg-primary/10">
          <Bell className="size-3 text-primary" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          Brand24 alert
        </span>
        <span
          className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground"
          title={new Date(n.postedAt).toLocaleString()}
        >
          {messageTime(n.postedAt)}
        </span>
      </div>

      {n.text && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-foreground/90">
          {n.text}
        </p>
      )}

      {n.attachments.length > 0 ? (
        <div className="space-y-2">
          {n.attachments.map((a, i) => (
            <Attachment key={i} a={a} />
          ))}
        </div>
      ) : (
        !n.text && <p className="text-sm text-muted-foreground">{n.preview}</p>
      )}

      {/* Post link(s) only — the actual mention source. */}
      {n.links.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Post
          </span>
          {n.links.map((l, i) => (
            <PostLinkChip key={`${l.source}-${i}`} l={l} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Left column: aggregated link analytics across all captured alerts. */
function AnalyticsPanel() {
  const { data, isLoading, isError, error } = useBrand24Analytics();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <BarChart3 className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Analytics</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error)?.message ?? "Couldn't load analytics."}
          </p>
        )}

        {data && (
          <div className="space-y-5">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Alerts" value={data.totalAlerts} />
              <Stat label="With links" value={data.alertsWithLinks} />
              <Stat label="Unique links" value={data.uniqueLinks} />
              <Stat
                label="Total posts"
                value={data.byDomain.reduce((s, d) => s + d.count, 0)}
              />
            </div>

            {/* By platform */}
            {data.byDomain.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  By platform
                </p>
                <ul className="space-y-1.5">
                  {data.byDomain.map((d) => (
                    <li
                      key={d.domain}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{d.domain}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {d.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top links */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Resolved links ({data.uniqueLinks})
              </p>
              {data.topLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No post links found yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.topLinks.map((l) => (
                    <AnalyticsLink key={l.url} l={l} />
                  ))}
                </ul>
              )}
            </div>

            {data.scanned < data.totalAlerts && (
              <p className="text-[11px] text-muted-foreground/70">
                Based on the latest {data.scanned} of {data.totalAlerts} alerts.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function AnalyticsLink({ l }: { l: Brand24LinkStat }) {
  const href = l.final ?? l.url;
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={href}
        className="group flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
      >
        <Link2 className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {l.domain ?? "link"}
          </span>
          {l.label && (
            <span className="block truncate text-[11px] text-muted-foreground">
              {l.label}
            </span>
          )}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {l.count}
        </span>
      </a>
    </li>
  );
}

const PAGE_SIZE = 25;

export function Brand24App() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // debounced search term sent to the server

  // Debounce typing → query, and reset to page 1 whenever the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error, refetch, isFetching, isPlaceholderData } =
    useBrand24Notifications(page, q, PAGE_SIZE);
  const me = useCurrentUser();
  const backfill = useBrand24Backfill();

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const runBackfill = () => {
    backfill.mutate(undefined, {
      onSuccess: (r) => {
        if (r.inserted > 0) {
          toast.success(
            `Imported ${r.inserted} older alert${r.inserted === 1 ? "" : "s"} from Slack.`,
          );
        } else {
          toast.info("No new alerts found in Slack history.");
        }
        if (r.truncated) {
          toast.warning("Hit the history page limit — run again to fetch older ones.");
        }
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  // Toast newly-arrived alerts so they "pop up" while the page is open. Only on
  // page 1 with no active search (where new alerts land). Seed the high-water
  // mark on first load so the existing backlog doesn't spam toasts, then toast
  // anything with a higher id on subsequent polls.
  const seenMaxId = useRef<number | null>(null);
  useEffect(() => {
    if (page !== 1 || q) return;
    if (items.length === 0) return;
    const maxId = Math.max(...items.map((n) => n.id));
    if (seenMaxId.current === null) {
      seenMaxId.current = maxId;
      return;
    }
    if (maxId > seenMaxId.current) {
      const fresh = items.filter((n) => n.id > seenMaxId.current!);
      seenMaxId.current = maxId;
      for (const n of fresh.slice(0, 5)) {
        toast("New Brand24 alert", { description: n.preview });
      }
    }
  }, [items, page, q]);

  const groups = useMemo(() => groupByDay(items), [items]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Image
          src="/brand24.svg"
          alt=""
          width={18}
          height={18}
          className="size-[18px]"
        />
        <span className="text-sm font-semibold">Brand24</span>
        <span className="text-xs text-muted-foreground">{total}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {me?.role === "admin" && (
            <Button
              variant="outline"
              size="sm"
              onClick={runBackfill}
              disabled={backfill.isPending}
              title="Import older alerts from Slack channel history"
            >
              {backfill.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <HistoryIcon size={16} />
              )}
              {backfill.isPending ? "Importing…" : "Import history"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => refetch()}
            aria-label="Refresh"
          >
            <RefreshCWIcon size={16} className={cn(isFetching && "animate-spin")} />
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeftIcon size={16} />
              Back to inbox
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left column: analytics */}
        <aside className="hidden w-80 shrink-0 flex-col border-r xl:flex">
          <AnalyticsPanel />
        </aside>

        {/* Right column: notifications feed + pagination */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search alerts…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto w-full max-w-3xl px-4 py-4",
            isPlaceholderData && "opacity-60",
          )}
        >
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(error as Error)?.message ?? "Couldn't load notifications."}
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <BellIcon size={40} className="mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {q ? "No matching alerts" : "No Brand24 alerts yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {q
                  ? "Try a different search."
                  : "Alerts appear here as soon as Brand24 posts them to Slack."}
              </p>
            </div>
          )}

          {groups.map((g) => (
            <section key={g.day} className="mb-6">
              <div className="sticky top-0 z-10 -mx-1 mb-2 bg-background/80 px-1 py-1 backdrop-blur">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.day}
                  <span className="ml-2 font-normal tabular-nums opacity-70">
                    {g.items.length}
                  </span>
                </h2>
              </div>
              <div className="space-y-2.5">
                {g.items.map((n) => (
                  <NotificationCard key={n.id} n={n} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Pagination footer */}
      {total > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
          <p className="text-xs text-muted-foreground tabular-nums">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
            {total}
            {isFetching && !isPlaceholderData && " · refreshing…"}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isPlaceholderData}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || isPlaceholderData}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
