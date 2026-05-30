"use client";

import { ExternalLink, Plus, StickyNote, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CHANNELS } from "@/lib/channel";
import { messageTime } from "@/lib/format";
import { useConversation, useNotes, useTags } from "@/lib/hooks";
import { ChannelAvatar } from "./channel-avatar";
import { AgentAvatar } from "./agent-avatar";
import { TagPill } from "./tag-pill";
import { AssignDropdown, StatusDropdown, TagEditor } from "./conversation-actions";
import { useAgents } from "@/lib/hooks";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        {label}
      </p>
      {children}
    </div>
  );
}

export function ContactPanel({ conversationId }: { conversationId: string }) {
  const { data: conversation } = useConversation(conversationId);
  const { data: notes = [] } = useNotes(conversationId);
  const { data: agents = [] } = useAgents();
  const { removeTag } = useTags(conversationId);

  if (!conversation) return null;
  const meta = CHANNELS[conversation.channel];
  const assignee = agents.find((a) => a.id === conversation.assigneeId);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Identity */}
      <div className="flex flex-col items-center gap-3 px-5 pb-5 pt-8 text-center">
        <ChannelAvatar
          name={conversation.contact.displayName}
          avatarUrl={conversation.contact.avatarUrl}
          channel={conversation.channel}
          size="lg"
        />
        <div>
          <h3 className="text-base font-semibold">
            {conversation.contact.displayName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {conversation.contact.handle}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
          <a
            href={conversation.contact.profileUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span
              className={cn("grid size-3.5 place-items-center rounded", meta.badgeClass)}
            >
              <meta.Icon className="size-2" strokeWidth={2.5} />
            </span>
            View {meta.label} profile
            <ExternalLink className="size-3" />
          </a>
        </Button>
      </div>

      <Separator />

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <Field label="Channel">
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("grid size-5 place-items-center rounded-md", meta.badgeClass)}>
              <meta.Icon className="size-3" strokeWidth={2.5} />
            </span>
            {meta.label}
          </div>
        </Field>

        <Field label="Status">
          <StatusDropdown conversation={conversation} variant="outline" />
        </Field>

        <Field label="Assignee">
          <div className="flex items-center gap-2">
            <AssignDropdown conversation={conversation} variant="outline" />
            {assignee && (
              <span className="text-xs text-muted-foreground">
                {assignee.email}
              </span>
            )}
          </div>
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5">
            {conversation.tags.length === 0 && (
              <span className="text-xs text-muted-foreground">No tags yet</span>
            )}
            {conversation.tags.map((tag) => (
              <TagPill key={tag} tag={tag} onRemove={() => removeTag.mutate(tag)} />
            ))}
            <TagEditor
              conversation={conversation}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 rounded-full border-dashed px-2 text-xs text-muted-foreground"
                >
                  <Plus className="size-3" />
                  <TagIcon className="size-3" />
                </Button>
              }
            />
          </div>
        </Field>

        <Separator />

        {/* Internal notes */}
        <Field label={`Internal notes (${notes.length})`}>
          {notes.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
              <StickyNote className="size-4 shrink-0" />
              Team-only notes appear here. Use the composer&apos;s note toggle to add one.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {notes.map((note) => {
                const author = agents.find((a) => a.id === note.authorId);
                return (
                  <li
                    key={note.id}
                    className="rounded-lg border border-amber-200/70 bg-amber-50/70 p-2.5 dark:border-amber-500/20 dark:bg-amber-500/5"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <AgentAvatar agent={author} size="xs" />
                      <span className="text-xs font-medium">
                        {note.authorName}
                      </span>
                      <span className="ml-auto text-[10.5px] text-muted-foreground">
                        {messageTime(note.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                      {note.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Field>
      </div>
    </div>
  );
}
