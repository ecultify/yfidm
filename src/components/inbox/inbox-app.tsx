"use client";

import { useEffect } from "react";
import { Inbox as InboxIcon, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useRealtimeInbound, useInboxPulse } from "@/lib/hooks";
import { CHANNELS } from "@/lib/channel";
import { LeftRail } from "./left-rail";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { ContactPanel } from "./contact-panel";
import { CommandPalette } from "./command-palette";
import { EmptyState } from "./empty-state";
import {
  InboxProvider,
  useInbox,
  useVisibleConversations,
} from "./inbox-context";
import { useIsDesktop } from "./use-media-query";
import { useSetStatus } from "@/lib/hooks";

function InboxKeyboard() {
  const inbox = useInbox();
  const { conversations } = useVisibleConversations();
  const setStatus = useSetStatus(inbox.selectedId ?? "__none__");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (typing || inbox.commandOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      const ids = conversations.map((c) => c.id);
      const idx = inbox.selectedId ? ids.indexOf(inbox.selectedId) : -1;

      if (e.key === "j") {
        e.preventDefault();
        const next = ids[Math.min(idx + 1, ids.length - 1)] ?? ids[0];
        if (next) inbox.setSelectedId(next);
      } else if (e.key === "k") {
        e.preventDefault();
        const prev = ids[Math.max(idx - 1, 0)] ?? ids[0];
        if (prev) inbox.setSelectedId(prev);
      } else if (e.key === "e" && inbox.selectedId) {
        e.preventDefault();
        setStatus.mutate("resolved");
        toast.success("Marked as resolved");
      } else if (e.key === "Escape" && inbox.selectedId) {
        inbox.setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inbox, conversations, setStatus]);

  return null;
}

function ThreadArea() {
  const inbox = useInbox();
  if (!inbox.selectedId) {
    return (
      <EmptyState
        className="bg-muted/20"
        icon={<MessagesSquare className="size-7" />}
        title="No conversation selected"
        description="Pick a conversation from the list to read and reply. Press ⌘K to search, or j / k to move between threads."
      />
    );
  }
  return <ConversationThread conversationId={inbox.selectedId} />;
}

function DesktopLayout() {
  const inbox = useInbox();
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      key={inbox.contactPanelOpen ? "with-contact" : "no-contact"}
    >
      <ResizablePanel defaultSize="17%" minSize="13%" maxSize="24%">
        <LeftRail />
      </ResizablePanel>
      <ResizableHandle />

      <ResizablePanel defaultSize="26%" minSize="20%" maxSize="36%">
        <div className="h-full border-x">
          <ConversationList />
        </div>
      </ResizablePanel>
      <ResizableHandle />

      <ResizablePanel defaultSize={inbox.contactPanelOpen ? "36%" : "57%"} minSize="30%">
        <ThreadArea />
      </ResizablePanel>

      {inbox.contactPanelOpen && inbox.selectedId && (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize="21%" minSize="16%" maxSize="30%">
            <div className="h-full border-l">
              <ContactPanel conversationId={inbox.selectedId} />
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

function MobileLayout() {
  const inbox = useInbox();
  return (
    <div className="flex h-full flex-col">
      {inbox.selectedId ? (
        <ThreadArea />
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center gap-2 border-b px-4">
            <InboxIcon className="size-4" />
            <span className="text-sm font-semibold">Unibox</span>
          </div>
          <div className="min-h-0 flex-1">
            <ConversationList />
          </div>
        </div>
      )}

      {/* Contact details as a Sheet on mobile */}
      <Sheet
        open={inbox.contactPanelOpen && Boolean(inbox.selectedId)}
        onOpenChange={inbox.setContactPanelOpen}
      >
        <SheetContent side="right" className="w-[88vw] max-w-sm p-0">
          <SheetTitle className="sr-only">Contact details</SheetTitle>
          {inbox.selectedId && <ContactPanel conversationId={inbox.selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InboxShell() {
  const isDesktop = useIsDesktop();
  const inbox = useInbox();

  // On mobile, the contact panel is a Sheet (closed by default); on desktop
  // it's docked open. Keep that default sensible when crossing breakpoints.
  useEffect(() => {
    inbox.setContactPanelOpen(isDesktop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  // Near-realtime: cheap server-pulse poll refetches on inbound webhooks.
  useInboxPulse();

  // Realtime: surface a toast when an inbound message arrives.
  useRealtimeInbound((message) => {
    const meta = CHANNELS[message.channel];
    toast(`New ${meta.label} message`, {
      description: message.body,
      action: {
        label: "Open",
        onClick: () => inbox.setSelectedId(message.conversationId),
      },
    });
  });

  return (
    <div className="h-full">
      <InboxKeyboard />
      <CommandPalette />
      {isDesktop ? <DesktopLayout /> : <MobileLayout />}
    </div>
  );
}

export function InboxApp() {
  return (
    <InboxProvider>
      <InboxShell />
    </InboxProvider>
  );
}
