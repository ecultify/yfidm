"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Bell,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { dayLabel, messageTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBrand24Notifications,
  type Brand24Attachment,
  type Brand24Notification,
} from "@/lib/hooks/use-brand24";

/** Group notifications under day headers, preserving the newest-first order. */
function groupByDay(items: Brand24Notification[]) {
  const groups: { day: string; items: Brand24Notification[] }[] = [];
  for (const item of items) {
    const day = dayLabel(item.createdAt);
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
          title={new Date(n.createdAt).toLocaleString()}
        >
          {messageTime(n.createdAt)}
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
        !n.text && (
          <p className="text-sm text-muted-foreground">{n.preview}</p>
        )
      )}
    </div>
  );
}

export function Brand24App() {
  const { data = [], isLoading, isError, error, refetch, isFetching } =
    useBrand24Notifications();
  const [search, setSearch] = useState("");

  // Toast newly-arrived alerts so they "pop up" while the page is open. We seed
  // the high-water mark on the first successful load (no toast spam for the
  // backlog), then toast anything with a higher id on subsequent polls.
  const seenMaxId = useRef<number | null>(null);
  useEffect(() => {
    if (data.length === 0) return;
    const maxId = data[0].id; // newest first
    if (seenMaxId.current === null) {
      seenMaxId.current = maxId;
      return;
    }
    if (maxId > seenMaxId.current) {
      const fresh = data.filter((n) => n.id > seenMaxId.current!);
      seenMaxId.current = maxId;
      for (const n of fresh.slice(0, 5)) {
        toast("New Brand24 alert", { description: n.preview });
      }
    }
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return data;
    return data.filter(
      (n) =>
        n.preview.toLowerCase().includes(q) ||
        n.text.toLowerCase().includes(q) ||
        n.attachments.some((a) =>
          [a.title, a.text, a.pretext, a.footer]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
        ),
    );
  }, [data, search]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

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
        <span className="text-xs text-muted-foreground">{data.length}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => refetch()}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to inbox
            </Link>
          </Button>
        </div>
      </header>

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
        <div className="mx-auto w-full max-w-3xl px-4 py-4">
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

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <Bell className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {search ? "No matching alerts" : "No Brand24 alerts yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
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
    </div>
  );
}
