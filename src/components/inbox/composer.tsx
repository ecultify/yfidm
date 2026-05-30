"use client";

import { useRef, useState } from "react";
import {
  Send,
  StickyNote,
  MessageSquare,
  Zap,
  CornerDownLeft,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSendMessage, useAddNote } from "@/lib/hooks";
import { CANNED_REPLIES } from "@/lib/services/mock-data";
import type { Channel } from "@/lib/types";
import { CHANNELS } from "@/lib/channel";

type Mode = "reply" | "note";

export function Composer({
  conversationId,
  channel,
  contactName,
  replyWindowOpen = true,
}: {
  conversationId: string;
  channel: Channel;
  contactName: string;
  /**
   * Instagram-only: whether Meta's 24h Customer Service Window is open. When
   * false, standard replies are blocked (internal notes are always allowed).
   * LinkedIn / Facebook always pass `true`.
   */
  replyWindowOpen?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("reply");
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useSendMessage(conversationId);
  const addNote = useAddNote(conversationId);
  const meta = CHANNELS[channel];

  const isNote = mode === "note";
  // The reply window only gates outbound Instagram replies, never internal notes.
  const windowBlocked = channel === "instagram" && !replyWindowOpen && !isNote;
  const canSend = text.trim().length > 0 && !windowBlocked;

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    if (windowBlocked) return; // defensive: send is also disabled in the UI
    setText("");
    if (isNote) {
      addNote.mutate(body, {
        onSuccess: () => toast.success("Internal note added"),
        onError: () => {
          setText(body);
          toast.error("Couldn't add note");
        },
      });
    } else {
      sendMessage.mutate(body, {
        onError: () => toast.error("Message failed to send - tap to retry"),
      });
    }
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const insertCanned = (body: string) => {
    setText((prev) => (prev ? `${prev.trimEnd()} ${body}` : body));
    textareaRef.current?.focus();
  };

  return (
    <div
      className={cn(
        "border-t bg-background p-3 transition-colors",
        isNote && "bg-amber-50/60 dark:bg-amber-500/5",
      )}
    >
      {/* Mode toggle */}
      <div className="mb-2 flex items-center gap-1">
        <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setMode("reply")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              !isNote
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="size-3.5" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => setMode("note")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              isNote
                ? "bg-amber-100 text-amber-800 shadow-sm dark:bg-amber-500/20 dark:text-amber-200"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <StickyNote className="size-3.5" />
            Internal note
          </button>
        </div>

        {!isNote && (
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={cn("grid size-3.5 place-items-center rounded", meta.badgeClass)}>
              <meta.Icon className="size-2" strokeWidth={2.5} />
            </span>
            via {meta.label}
          </span>
        )}
      </div>

      {windowBlocked && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Clock className="mt-px size-3.5 shrink-0" />
          <span>
            Reply window closed - Instagram only allows replies within 24h of the
            user&apos;s last message. Add an internal note, or wait for them to
            message again.
          </span>
        </div>
      )}

      <div
        className={cn(
          "rounded-xl border bg-background transition-colors focus-within:ring-1 focus-within:ring-ring",
          isNote
            ? "border-amber-300/70 dark:border-amber-500/30"
            : "border-border/70",
        )}
      >
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            isNote
              ? "Write a note for your team (never sent to the contact)..."
              : `Reply to ${contactName}...`
          }
          className="min-h-[60px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              >
                <Zap className="size-3.5" />
                Canned replies
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1.5">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick replies
              </p>
              <div className="space-y-0.5">
                {CANNED_REPLIES.map((c) => (
                  <button
                    key={c.title}
                    onClick={() => insertCanned(c.body)}
                    className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <p className="text-xs font-medium">{c.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.body}
                    </p>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[10.5px] text-muted-foreground sm:flex">
              <kbd className="rounded border border-border/70 bg-muted px-1 py-0.5 font-sans">
                ⌘
              </kbd>
              <kbd className="rounded border border-border/70 bg-muted px-1 py-0.5 font-sans">
                <CornerDownLeft className="size-2.5" />
              </kbd>
              to send
            </span>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={!canSend}
              className={cn(
                "h-8 gap-1.5",
                isNote &&
                  "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600",
              )}
            >
              {isNote ? (
                <>
                  <StickyNote className="size-3.5" />
                  Add note
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
