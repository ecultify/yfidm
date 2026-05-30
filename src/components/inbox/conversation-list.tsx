"use client";

import { Search, SlidersHorizontal, Inbox, X, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHANNELS } from "@/lib/channel";
import { ConversationListItem } from "./conversation-list-item";
import { ConversationListSkeleton } from "./skeletons";
import { EmptyState } from "./empty-state";
import { STATUS_META } from "./status-badge";
import { useInbox, useVisibleConversations, type SortOrder } from "./inbox-context";

const SORT_LABELS: Record<SortOrder, string> = {
  newest: "Newest activity",
  oldest: "Oldest activity",
  unread: "Unread first",
};

function ActiveFilterChips() {
  const inbox = useInbox();
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (inbox.unread) chips.push({ key: "unread", label: "Unread", clear: () => inbox.setUnread(false) });
  if (inbox.mine) chips.push({ key: "mine", label: "Assigned to me", clear: () => inbox.setMine(false) });
  if (inbox.notes) chips.push({ key: "notes", label: "Has notes", clear: () => inbox.setNotes(false) });
  if (inbox.channel)
    chips.push({
      key: "channel",
      label: CHANNELS[inbox.channel].label,
      clear: () => inbox.setChannel(null),
    });
  if (inbox.status)
    chips.push({
      key: "status",
      label: STATUS_META[inbox.status].label,
      clear: () => inbox.setStatus(null),
    });

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {c.label}
          <X className="size-2.5" />
        </button>
      ))}
      <button
        onClick={inbox.resetFilters}
        className="text-[11px] font-medium text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}

export function ConversationList() {
  const inbox = useInbox();
  const { conversations, isLoading, isError } = useVisibleConversations();

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Search + sort */}
      <div className="flex h-14 items-center gap-2 px-3">
        <button
          onClick={() => inbox.setCommandOpen(true)}
          className="group flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70"
        >
          <Search className="size-4" />
          <span>Search conversations…</span>
          <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
            <Command className="size-2.5" />K
          </kbd>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label="Sort and filter">
              <SlidersHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={inbox.sort}
              onValueChange={(v) => inbox.setSort(v as SortOrder)}
            >
              {(Object.keys(SORT_LABELS) as SortOrder[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Quick filters</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={inbox.unread}
              onCheckedChange={(v) => inbox.setUnread(Boolean(v))}
            >
              Unread only
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={inbox.mine}
              onCheckedChange={(v) => inbox.setMine(Boolean(v))}
            >
              Assigned to me
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Inline search field (kept in sync, also drives the list live) */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={inbox.search}
            onChange={(e) => inbox.setSearch(e.target.value)}
            placeholder="Filter by name, handle, message…"
            className="h-8 pl-8 text-sm"
          />
          {inbox.search && (
            <button
              onClick={() => inbox.setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <ActiveFilterChips />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : isError ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title="Couldn't load conversations"
            description="Something went wrong fetching your inbox. Try again."
          />
        ) : conversations.length === 0 && inbox.channel === "facebook" ? (
          <EmptyState
            className="pt-20"
            icon={<CHANNELS.facebook.Icon className="size-6" />}
            title="Facebook isn't connected yet"
            description="Messenger / Facebook DMs aren't wired up in this workspace. Connect a Facebook Page to start receiving messages here."
          />
        ) : conversations.length === 0 ? (
          <EmptyState
            className="pt-20"
            icon={<Inbox className="size-6" />}
            title={inbox.search ? "No matching conversations" : "Inbox zero ✨"}
            description={
              inbox.search
                ? "Try a different search or clear your filters."
                : "Nothing matches these filters right now."
            }
            action={
              !inbox.isAll || inbox.search ? (
                <Button variant="outline" size="sm" onClick={inbox.resetFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-0.5">
            {conversations.map((c) => (
              <ConversationListItem
                key={c.id}
                conversation={c}
                active={c.id === inbox.selectedId}
                onSelect={() => inbox.setSelectedId(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
