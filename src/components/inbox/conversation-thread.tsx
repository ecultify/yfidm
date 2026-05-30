"use client";

import { useEffect, useRef } from "react";
import { MessagesSquare } from "lucide-react";
import { useConversation, useMessages, useMarkRead } from "@/lib/hooks";
import { dayLabel } from "@/lib/format";
import { instagramReplyWindowOpen } from "@/lib/reply-window";
import type { Message } from "@/lib/types";
import { ThreadHeader } from "./thread-header";
import { MessageBubble } from "./message-bubble";
import { Composer } from "./composer";
import { ThreadSkeleton } from "./skeletons";
import { EmptyState } from "./empty-state";
import {
  AssignDropdown,
  StatusDropdown,
  TagEditor,
} from "./conversation-actions";

/** Removes duplicate-id messages (keeps last) — guards against the optimistic
 *  send + refetch race producing two bubbles with the same React key. */
function dedupeById(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of messages) byId.set(m.id, m);
  return [...byId.values()];
}

function groupByDay(messages: Message[]) {
  const groups: { day: string; messages: Message[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.sentAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(m);
    else groups.push({ day, messages: [m] });
  }
  return groups;
}

export function ConversationThread({ conversationId }: { conversationId: string }) {
  const { data: conversation, isLoading: convLoading } =
    useConversation(conversationId);
  const { data: rawMessages = [], isLoading: msgLoading } =
    useMessages(conversationId);
  const messages = dedupeById(rawMessages);

  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastId]);

  // Opening a conversation marks it read and clears its unread chip. We mark at
  // most once per conversation (guarded by a ref Set) so re-renders / refetches
  // don't re-fire the mutation, and we only call it when there's something to
  // clear. The optimistic patch in useMarkRead zeroes the chip instantly; the
  // server store (LinkedIn) / mock service persists it so it stays cleared.
  const markRead = useMarkRead(conversationId);
  const autoMarked = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      conversation &&
      conversation.unreadCount > 0 &&
      !autoMarked.current.has(conversationId)
    ) {
      autoMarked.current.add(conversationId);
      markRead.mutate(true);
    }
    // markRead is intentionally omitted — its identity changes each render, and
    // the autoMarked guard already makes this fire at most once per conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, conversationId]);

  if (convLoading || !conversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="h-14 shrink-0 border-b" />
        <ThreadSkeleton />
      </div>
    );
  }

  const groups = groupByDay(messages);

  // Instagram-only: Meta's 24h Customer Service Window. LinkedIn/Facebook are
  // unaffected and always pass `true`.
  const replyWindowOpen =
    conversation.channel === "instagram"
      ? instagramReplyWindowOpen(messages)
      : true;

  return (
    <div className="flex h-full flex-col bg-background">
      <ThreadHeader conversation={conversation} />

      {/* Compact action bar for screens that hide header actions */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-3 py-2 lg:hidden">
        <AssignDropdown conversation={conversation} />
        <StatusDropdown conversation={conversation} />
        <TagEditor conversation={conversation} />
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {msgLoading ? (
          <ThreadSkeleton />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare className="size-6" />}
            title="No messages yet"
            description={`Start the conversation with ${conversation.contact.displayName}.`}
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-5">
            {groups.map((group) => (
              <div key={group.day} className="flex flex-col gap-2">
                <div className="my-2 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {group.day}
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
                {group.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Composer
        conversationId={conversation.id}
        channel={conversation.channel}
        contactName={conversation.contact.displayName.split(" ")[0]}
        replyWindowOpen={replyWindowOpen}
      />
    </div>
  );
}
