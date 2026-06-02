"use client";

import Image from "next/image";
import {
  Inbox,
  Mail,
  AtSign,
  UserCheck,
  MessageCircleMore,
} from "lucide-react";
import { SettingsIcon } from "@/components/icons/settings";
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

  // Sidebar items behave like single-select navigation: clicking one shows just
  // that view and clears whatever else was active. Combining filters (e.g.
  // Unread + Instagram) is done deliberately via the filter controls in the
  // list header, not by stacking sidebar clicks.
  const showOnly = (apply: () => void) => {
    inbox.resetFilters();
    apply();
  };

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
            onClick={() =>
              inbox.unread
                ? inbox.resetFilters()
                : showOnly(() => inbox.setUnread(true))
            }
            icon={<Mail className="size-4" />}
            label="Unread"
            count={unreadTotal}
          />
          <RailButton
            active={inbox.mine}
            onClick={() =>
              inbox.mine
                ? inbox.resetFilters()
                : showOnly(() => inbox.setMine(true))
            }
            icon={<UserCheck className="size-4" />}
            label="Assigned to me"
            count={mineTotal}
          />
          <RailButton
            active={inbox.notes}
            onClick={() =>
              inbox.notes
                ? inbox.resetFilters()
                : showOnly(() => inbox.setNotes(true))
            }
            icon={<AtSign className="size-4" />}
            label="Mentions & notes"
            count={withNotes.length}
          />
        </div>

        {/* Support desk (Freshdesk-backed, separate from the DM inbox) */}
        <SectionLabel>Support</SectionLabel>
        <div className="space-y-0.5">
          <RailButton
            active={false}
            onClick={() => router.push("/support")}
            accent={
              <Image
                src="/freshdesk.png"
                alt=""
                width={16}
                height={16}
                className="size-4"
              />
            }
            icon={null}
            label="Freshdesk"
          />
          <RailButton
            active={false}
            onClick={() => router.push("/brand24")}
            accent={
              <Image
                src="/brand24.svg"
                alt=""
                width={16}
                height={16}
                className="size-4"
              />
            }
            icon={null}
            label="Brand24"
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
                inbox.channel === ch.id
                  ? inbox.resetFilters()
                  : showOnly(() => inbox.setChannel(ch.id))
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
                onClick={() =>
                  inbox.status === s
                    ? inbox.resetFilters()
                    : showOnly(() => inbox.setStatus(s))
                }
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
              <SettingsIcon size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Signed in as {me?.name ?? "..."}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/profile")}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/profile")}>
              Change password
            </DropdownMenuItem>
            {me?.role === "admin" && (
              <DropdownMenuItem onSelect={() => router.push("/profile")}>
                Team and analytics
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
