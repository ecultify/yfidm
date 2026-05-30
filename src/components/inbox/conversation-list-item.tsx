"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { useAgents } from "@/lib/hooks";
import { useLazyRow } from "@/lib/hooks/use-lazy-contact";
import type { Conversation } from "@/lib/types";
import { ChannelAvatar } from "./channel-avatar";
import { AgentAvatar } from "./agent-avatar";
import { STATUS_META } from "./status-badge";

interface Props {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
}

export function ConversationListItem({ conversation, active, onSelect }: Props) {
  const { data: agents = [] } = useAgents();
  const assignee = agents.find((a) => a.id === conversation.assigneeId);
  const unread = conversation.unreadCount > 0;
  const status = STATUS_META[conversation.status];

  // Lazily hydrate this row's contact once it scrolls into view (LinkedIn).
  const ref = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { contact, lastMessagePreview } = useLazyRow(conversation, inView);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={active}
      className={cn(
        "group relative flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {/* Active accent bar */}
      <span
        className={cn(
          "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />

      <ChannelAvatar
        name={contact.displayName}
        avatarUrl={contact.avatarUrl}
        channel={conversation.channel}
        size="md"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}
          >
            {contact.displayName}
          </span>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {relativeTime(conversation.lastMessageAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] leading-snug",
              unread ? "text-foreground/80" : "text-muted-foreground",
            )}
          >
            {lastMessagePreview || (
              <span className="italic text-muted-foreground/70">No messages yet</span>
            )}
          </p>
          {unread ? (
            <span className="grid min-w-4 shrink-0 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {conversation.unreadCount}
            </span>
          ) : (
            assignee && <AgentAvatar agent={assignee} size="xs" />
          )}
        </div>

        {(conversation.tags.length > 0 || unread) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className={cn("size-1.5 shrink-0 rounded-full", status.dot)}
              title={status.label}
            />
            <div className="flex min-w-0 flex-wrap gap-1">
              {conversation.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="truncate rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {conversation.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">
                  +{conversation.tags.length - 2}
                </span>
              )}
            </div>
            {unread && assignee && (
              <AgentAvatar agent={assignee} size="xs" className="ml-auto" />
            )}
          </div>
        )}
      </div>
    </button>
  );
}
