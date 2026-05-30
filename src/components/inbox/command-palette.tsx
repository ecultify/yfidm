"use client";

import { useEffect } from "react";
import {
  Inbox,
  Mail,
  UserCheck,
  CircleDot,
  Clock,
  CheckCircle2,
  Moon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useConversations } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { CHANNELS } from "@/lib/channel";
import { useInbox } from "./inbox-context";

export function CommandPalette() {
  const inbox = useInbox();
  const { data: conversations = [] } = useConversations();

  // Global ⌘K / Ctrl-K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inbox.setCommandOpen(!inbox.commandOpen);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inbox]);

  const close = () => inbox.setCommandOpen(false);

  const openConversation = (id: string) => {
    inbox.setSelectedId(id);
    close();
  };

  return (
    <CommandDialog
      open={inbox.commandOpen}
      onOpenChange={inbox.setCommandOpen}
      title="Search"
      description="Search conversations and jump to filters"
    >
      <Command>
        <CommandInput placeholder="Search conversations, contacts, or jump to..." />
        <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Filters">
          <CommandItem
            onSelect={() => {
              inbox.resetFilters();
              close();
            }}
          >
            <Inbox className="size-4" />
            All conversations
          </CommandItem>
          <CommandItem
            onSelect={() => {
              inbox.setUnread(true);
              close();
            }}
          >
            <Mail className="size-4" />
            Unread
          </CommandItem>
          <CommandItem
            onSelect={() => {
              inbox.setMine(true);
              close();
            }}
          >
            <UserCheck className="size-4" />
            Assigned to me
          </CommandItem>
          <CommandItem
            onSelect={() => {
              inbox.setStatus("open");
              close();
            }}
          >
            <CircleDot className="size-4 text-emerald-500" />
            Open
          </CommandItem>
          <CommandItem
            onSelect={() => {
              inbox.setStatus("pending");
              close();
            }}
          >
            <Clock className="size-4 text-amber-500" />
            Pending
          </CommandItem>
          <CommandItem
            onSelect={() => {
              inbox.setStatus("resolved");
              close();
            }}
          >
            <CheckCircle2 className="size-4 text-zinc-400" />
            Resolved
          </CommandItem>
          <CommandItem
            onSelect={() => {
              inbox.setStatus("snoozed");
              close();
            }}
          >
            <Moon className="size-4 text-violet-500" />
            Snoozed
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Conversations">
          {conversations.map((c) => {
            const meta = CHANNELS[c.channel];
            return (
              <CommandItem
                key={c.id}
                value={`${c.contact.displayName} ${c.contact.handle} ${c.lastMessagePreview} ${c.tags.join(" ")}`}
                onSelect={() => openConversation(c.id)}
                className="gap-2.5"
              >
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-md text-white"
                  style={{ backgroundColor: meta.accent }}
                >
                  <meta.Icon className="size-3" strokeWidth={2.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.contact.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.lastMessagePreview}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {relativeTime(c.lastMessageAt)}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
