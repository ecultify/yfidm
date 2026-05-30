"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useConversations } from "@/lib/hooks";
import type {
  Channel,
  Conversation,
  ConversationFilter,
  ConversationStatus,
} from "@/lib/types";

export type SortOrder = "newest" | "oldest" | "unread";

interface InboxContextValue {
  // Filter state - all dimensions combine with AND semantics, so e.g.
  // "LinkedIn + Unread + Assigned to me" is expressible at once.
  unread: boolean;
  setUnread: (v: boolean) => void;
  mine: boolean;
  setMine: (v: boolean) => void;
  notes: boolean;
  setNotes: (v: boolean) => void;
  channel: Channel | null;
  setChannel: (c: Channel | null) => void;
  status: ConversationStatus | null;
  setStatus: (s: ConversationStatus | null) => void;
  search: string;
  setSearch: (s: string) => void;
  sort: SortOrder;
  setSort: (s: SortOrder) => void;

  /** True when no filter dimension is active (the "All" state). */
  isAll: boolean;

  // Selection + panels
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  contactPanelOpen: boolean;
  setContactPanelOpen: (open: boolean) => void;
  toggleContactPanel: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  mobileThreadOpen: boolean;

  // Derived service filter + reset
  filter: ConversationFilter;
  resetFilters: () => void;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(false);
  const [mine, setMine] = useState(false);
  const [notes, setNotes] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [status, setStatus] = useState<ConversationStatus | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);

  const filter = useMemo<ConversationFilter>(() => {
    const f: ConversationFilter = {};
    if (channel) f.channel = channel;
    if (status) f.status = status;
    if (unread) f.unreadOnly = true;
    if (mine) f.assignedToMe = true;
    if (notes) f.hasNotes = true;
    if (search.trim()) f.search = search.trim();
    return f;
  }, [channel, status, unread, mine, notes, search]);

  const isAll = !unread && !mine && !notes && !channel && !status;

  const resetFilters = useCallback(() => {
    setUnread(false);
    setMine(false);
    setNotes(false);
    setChannel(null);
    setStatus(null);
    setSearch("");
  }, []);

  const toggleContactPanel = useCallback(
    () => setContactPanelOpen((o) => !o),
    [],
  );

  const value: InboxContextValue = {
    unread,
    setUnread,
    mine,
    setMine,
    notes,
    setNotes,
    channel,
    setChannel,
    status,
    setStatus,
    search,
    setSearch,
    sort,
    setSort,
    isAll,
    selectedId,
    setSelectedId,
    contactPanelOpen,
    setContactPanelOpen,
    toggleContactPanel,
    commandOpen,
    setCommandOpen,
    mobileThreadOpen: selectedId !== null,
    filter,
    resetFilters,
  };

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used within <InboxProvider>");
  return ctx;
}

/**
 * Returns the conversations matching the active filter, sorted per the active
 * sort order. Both the list view and keyboard navigation read from this, so
 * displayed order and j/k order always agree (React Query dedupes the fetch).
 */
export function useVisibleConversations() {
  const { filter, sort } = useInbox();
  const query = useConversations(filter);

  const conversations = useMemo<Conversation[]>(() => {
    const list = [...(query.data ?? [])];
    switch (sort) {
      case "oldest":
        return list.sort(
          (a, b) =>
            new Date(a.lastMessageAt).getTime() -
            new Date(b.lastMessageAt).getTime(),
        );
      case "unread":
        return list.sort(
          (a, b) =>
            b.unreadCount - a.unreadCount ||
            new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime(),
        );
      default:
        return list.sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime(),
        );
    }
  }, [query.data, sort]);

  return { ...query, conversations };
}
