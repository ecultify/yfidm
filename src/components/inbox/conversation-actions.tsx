"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, UserPlus, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  useAgents,
  useAssign,
  useCurrentAgentId,
  useSetStatus,
  useTags,
} from "@/lib/hooks";
import { SUGGESTED_TAGS } from "@/lib/services/mock-data";
import type { Conversation } from "@/lib/types";
import { AgentAvatar } from "./agent-avatar";
import { STATUS_META, STATUS_ORDER } from "./status-badge";
import { TagPill } from "./tag-pill";

export function AssignDropdown({
  conversation,
  variant = "outline",
}: {
  conversation: Conversation;
  variant?: "outline" | "ghost";
}) {
  const { data: agents = [] } = useAgents();
  const currentId = useCurrentAgentId();
  const assign = useAssign(conversation.id);
  const assignee = agents.find((a) => a.id === conversation.assigneeId);

  const handle = (agentId: string | null, name: string) => {
    assign.mutate(agentId);
    toast.success(agentId ? `Assigned to ${name}` : "Unassigned");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className="h-8 gap-1.5">
          {assignee ? (
            <>
              <AgentAvatar agent={assignee} size="xs" />
              <span className="max-w-24 truncate">{assignee.name}</span>
            </>
          ) : (
            <>
              <UserPlus className="size-3.5" />
              <span>Assign</span>
            </>
          )}
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Assign conversation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onClick={() => handle(a.id, a.name)}
            className="gap-2"
          >
            <AgentAvatar agent={a} size="xs" />
            <span className="flex-1 truncate">
              {a.name}
              {a.id === currentId && (
                <span className="ml-1 text-xs text-muted-foreground">(me)</span>
              )}
            </span>
            {conversation.assigneeId === a.id && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handle(null, "")}
          className="text-muted-foreground"
        >
          Unassign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StatusDropdown({
  conversation,
  variant = "outline",
}: {
  conversation: Conversation;
  variant?: "outline" | "ghost";
}) {
  const setStatus = useSetStatus(conversation.id);
  const meta = STATUS_META[conversation.status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className={cn("h-8 gap-1.5", meta.className)}>
          <meta.Icon className="size-3.5" />
          <span>{meta.label}</span>
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          return (
            <DropdownMenuItem
              key={s}
              onClick={() => {
                setStatus.mutate(s);
                toast.success(`Marked as ${m.label.toLowerCase()}`);
              }}
              className="gap-2"
            >
              <m.Icon className={cn("size-3.5", m.className)} />
              <span className="flex-1">{m.label}</span>
              {conversation.status === s && <Check className="size-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TagEditor({
  conversation,
  trigger,
}: {
  conversation: Conversation;
  trigger?: React.ReactNode;
}) {
  const { addTag, removeTag } = useTags(conversation.id);
  const [value, setValue] = useState("");

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || conversation.tags.includes(t)) return;
    addTag.mutate(t);
    setValue("");
  };

  const suggestions = SUGGESTED_TAGS.filter(
    (t) =>
      !conversation.tags.includes(t) &&
      t.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Tag className="size-3.5" />
            Add tag
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(value);
              }
            }}
            placeholder="Create or find a tag..."
            className="h-8 text-sm"
          />
          <Button
            size="icon"
            variant="secondary"
            className="size-8 shrink-0"
            onClick={() => add(value)}
            disabled={!value.trim()}
            aria-label="Add tag"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {conversation.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {conversation.tags.map((tag) => (
              <TagPill
                key={tag}
                tag={tag}
                onRemove={() => removeTag.mutate(tag)}
              />
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Suggestions
            </p>
            <div className="flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => add(tag)}
                  className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground"
                >
                  {tag}
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
