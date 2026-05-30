"use client";

import { ArrowLeft, MailOpen, Moon, PanelRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHANNELS } from "@/lib/channel";
import { useMarkRead, useSetStatus } from "@/lib/hooks";
import type { Conversation } from "@/lib/types";
import { ChannelAvatar } from "./channel-avatar";
import { AssignDropdown, StatusDropdown, TagEditor } from "./conversation-actions";
import { useInbox } from "./inbox-context";

export function ThreadHeader({ conversation }: { conversation: Conversation }) {
  const inbox = useInbox();
  const markRead = useMarkRead(conversation.id);
  const setStatus = useSetStatus(conversation.id);
  const meta = CHANNELS[conversation.channel];

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      {/* Mobile back */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 md:hidden"
        onClick={() => inbox.setSelectedId(null)}
        aria-label="Back to inbox"
      >
        <ArrowLeft className="size-4" />
      </Button>

      <ChannelAvatar
        name={conversation.contact.displayName}
        avatarUrl={conversation.contact.avatarUrl}
        channel={conversation.channel}
        size="sm"
        className="shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-sm font-semibold">
            {conversation.contact.displayName}
          </h2>
        </div>
        <a
          href={conversation.contact.profileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span style={{ color: meta.accent }}>{meta.label}</span>
          <span className="text-border">·</span>
          <span className="truncate">{conversation.contact.handle}</span>
          <ExternalLink className="size-2.5" />
        </a>
      </div>

      {/* Actions */}
      <div className="hidden items-center gap-1.5 lg:flex">
        <AssignDropdown conversation={conversation} />
        <StatusDropdown conversation={conversation} />
        <TagEditor conversation={conversation} />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              markRead.mutate(false);
              toast.success("Marked as unread");
            }}
            aria-label="Mark unread"
          >
            <MailOpen className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mark unread</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              setStatus.mutate("snoozed");
              toast.success("Snoozed");
            }}
            aria-label="Snooze"
          >
            <Moon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Snooze</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={inbox.contactPanelOpen ? "secondary" : "ghost"}
            size="icon"
            className="size-8"
            onClick={inbox.toggleContactPanel}
            aria-label="Toggle contact details"
          >
            <PanelRight className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Contact details</TooltipContent>
      </Tooltip>
    </div>
  );
}
