"use client";

import {
  Inbox,
  Mail,
  AtSign,
  UserCheck,
  Settings,
  MessageCircleMore,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  useConversations,
  useCurrentAgentId,
  useCurrentUser,
} from "@/lib/hooks";
import { CHANNEL_LIST } from "@/lib/channel";
import { AgentAvatar } from "./agent-avatar";
import { ThemeToggle } from "./theme-toggle";
import { STATUS_ORDER, STATUS_META } from "./status-badge";
import { useInbox } from "./inbox-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function RailButton({
  active,
  onClick,
  icon,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  accent?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {accent ?? icon}
      </span>
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
            active
              ? "bg-background text-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  );
}

export function LeftRail() {
  const inbox = useInbox();
  const router = useRouter();
  const { data: all = [] } = useConversations();
  const { data: withNotes = [] } = useConversations({ hasNotes: true });
  const currentId = useCurrentAgentId();
  const me = useCurrentUser();

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const unreadTotal = all.filter((c) => c.unreadCount > 0).length;
  const mineTotal = all.filter((c) => c.assigneeId === currentId).length;

  const channelUnread = (ch: string) =>
    all.filter((c) => c.channel === ch && c.unreadCount > 0).length;
  const statusCount = (s: string) => all.filter((c) => c.status === s).length;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <MessageCircleMore className="size-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Unibox</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Primary views */}
        <div className="space-y-0.5">
          <RailButton
            active={inbox.isAll}
            onClick={inbox.resetFilters}
            icon={<Inbox className="size-4" />}
            label="All conversations"
            count={all.length}
          />
          <RailButton
            active={inbox.unread}
            onClick={() => inbox.setUnread(!inbox.unread)}
            icon={<Mail className="size-4" />}
            label="Unread"
            count={unreadTotal}
          />
          <RailButton
            active={inbox.mine}
            onClick={() => inbox.setMine(!inbox.mine)}
            icon={<UserCheck className="size-4" />}
            label="Assigned to me"
            count={mineTotal}
          />
          <RailButton
            active={inbox.notes}
            onClick={() => inbox.setNotes(!inbox.notes)}
            icon={<AtSign className="size-4" />}
            label="Mentions & notes"
            count={withNotes.length}
          />
        </div>

        {/* Channels */}
        <SectionLabel>Channels</SectionLabel>
        <div className="space-y-0.5">
          {CHANNEL_LIST.map((ch) => (
            <RailButton
              key={ch.id}
              active={inbox.channel === ch.id}
              onClick={() =>
                inbox.setChannel(inbox.channel === ch.id ? null : ch.id)
              }
              accent={
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-[5px]",
                    ch.badgeClass,
                  )}
                >
                  <ch.Icon className="size-2.5" strokeWidth={2.5} />
                </span>
              }
              icon={null}
              label={ch.label}
              count={channelUnread(ch.id)}
            />
          ))}
        </div>

        {/* Statuses */}
        <SectionLabel>Status</SectionLabel>
        <div className="space-y-0.5">
          {STATUS_ORDER.map((s) => {
            const meta = STATUS_META[s];
            return (
              <RailButton
                key={s}
                active={inbox.status === s}
                onClick={() => inbox.setStatus(inbox.status === s ? null : s)}
                accent={
                  <span className={cn("size-2 rounded-full", meta.dot)} />
                }
                icon={null}
                label={meta.label}
                count={statusCount(s)}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom: current agent + settings */}
      <div className="flex items-center gap-2 border-t border-border/60 p-2.5">
        <AgentAvatar agent={me ?? undefined} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{me?.name ?? "Agent"}</p>
          <p className="truncate text-xs text-muted-foreground">{me?.email}</p>
        </div>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Signed in as {me?.name ?? "…"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/team")}>
              Change password
            </DropdownMenuItem>
            {me?.role === "admin" && (
              <DropdownMenuItem onSelect={() => router.push("/team")}>
                Manage team
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
