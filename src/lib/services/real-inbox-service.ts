import type { InboxService } from "./inbox-service";
import { MockInboxService } from "./mock-inbox-service";
import type {
  Agent,
  Channel,
  Conversation,
  ConversationFilter,
  ConversationStatus,
  InternalNote,
  Message,
} from "@/lib/types";

/**
 * Production data layer.
 *
 * - LinkedIn  -> our internal /api/inbox/* Route Handlers (Unipile server-side).
 * - Instagram -> our internal /api/inbox/instagram/* Route Handlers (Unipile
 *                server-side; gated by INBOX_INSTAGRAM_SOURCE, mock fallback
 *                served by those same routes).
 * - Facebook  -> MockInboxService (its adapter isn't built — stays mock).
 *
 * The browser NEVER touches Unipile directly. This is a CLIENT-SAFE module: it
 * only fetches our own API routes and delegates Facebook to the mock service.
 * It must not import any server-only code (Unipile client, adapters, app-store).
 */
export class RealInboxService implements InboxService {
  private readonly mock = new MockInboxService();

  /**
   * id -> channel registry, populated whenever we list/fetch conversations.
   * Real LinkedIn and Instagram ids are both opaque Unipile chat ids, so the id
   * alone can't tell them apart — this map is how getMessages/sendMessage route
   * a bare id to the right backend. Falls back conservatively for unseen ids.
   */
  private readonly channelById = new Map<string, Channel>();

  private remember(convs: Conversation[]): Conversation[] {
    for (const c of convs) this.channelById.set(c.id, c.channel);
    return convs;
  }

  private channelFor(id: string): Channel {
    const known = this.channelById.get(id);
    if (known) return known;
    // Unseen id: mock ids are `conv-*` (route to the mock service via Facebook);
    // any other id is a real Unipile chat — default to LinkedIn to preserve the
    // original behaviour until the list populates the registry.
    return id.startsWith("conv-") ? "facebook" : "linkedin";
  }

  // ---- conversations ----

  async listConversations(filter?: ConversationFilter): Promise<Conversation[]> {
    const channel = filter?.channel;
    const tasks: Promise<Conversation[]>[] = [];

    if (!channel || channel === "linkedin") {
      tasks.push(this.fetchLinkedinConversations(filter));
    }
    if (!channel || channel === "instagram") {
      tasks.push(this.fetchInstagramConversations(filter));
    }
    if (!channel || channel === "facebook") {
      tasks.push(this.fetchMockConversations(filter));
    }

    const lists = await Promise.all(tasks);

    // Dedup by id (upsert, last-write-wins) before sorting. Ids are unique per
    // provider, but this guards against any overlap across sources/refreshes.
    const byId = new Map<string, Conversation>();
    for (const conv of lists.flat()) byId.set(conv.id, conv);

    return [...byId.values()].sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
  }

  private filterToQuery(filter?: ConversationFilter): string {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set("status", filter.status);
    if (filter?.unreadOnly) qs.set("unread", "true");
    if (filter?.assignedToMe) qs.set("assignedToMe", "true");
    if (filter?.assigneeId !== undefined)
      qs.set("assigneeId", filter.assigneeId ?? "null");
    if (filter?.hasNotes) qs.set("hasNotes", "true");
    if (filter?.search) qs.set("search", filter.search);
    return qs.toString() ? `?${qs.toString()}` : "";
  }

  private async fetchLinkedinConversations(
    filter?: ConversationFilter,
  ): Promise<Conversation[]> {
    try {
      const convs = await apiGet<Conversation[]>(
        `/api/inbox/conversations${this.filterToQuery(filter)}`,
      );
      return this.remember(convs);
    } catch (e) {
      // A LinkedIn/Unipile outage must not blank the whole inbox — IG/FB stay.
      console.error("[inbox] LinkedIn conversations failed:", e);
      // TODO: surface a partial-failure indicator in the UI.
      return [];
    }
  }

  private async fetchInstagramConversations(
    filter?: ConversationFilter,
  ): Promise<Conversation[]> {
    try {
      const convs = await apiGet<Conversation[]>(
        `/api/inbox/instagram/conversations${this.filterToQuery(filter)}`,
      );
      return this.remember(convs);
    } catch (e) {
      // An Instagram/Unipile outage must not blank the whole inbox.
      console.error("[inbox] Instagram conversations failed:", e);
      // TODO: surface a partial-failure indicator in the UI.
      return [];
    }
  }

  private async fetchMockConversations(
    _filter?: ConversationFilter,
  ): Promise<Conversation[]> {
    // Facebook / Messenger is NOT connected yet — no mock data is surfaced. The
    // UI shows a "not connected" note when the Facebook channel is selected.
    // (LinkedIn + Instagram are the real, wired channels.)
    void _filter;
    return [];
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const channel = this.channelFor(id);
    if (channel === "facebook") return this.mock.getConversation(id);
    try {
      const path =
        channel === "instagram"
          ? `/api/inbox/instagram/conversations/${id}`
          : `/api/inbox/conversations/${id}`;
      const conv = await apiGet<Conversation>(path);
      this.channelById.set(conv.id, conv.channel);
      return conv;
    } catch {
      return null;
    }
  }

  // ---- messages ----

  async listMessages(conversationId: string): Promise<Message[]> {
    const channel = this.channelFor(conversationId);
    if (channel === "facebook") return this.mock.listMessages(conversationId);
    const path =
      channel === "instagram"
        ? `/api/inbox/instagram/conversations/${conversationId}/messages`
        : `/api/inbox/conversations/${conversationId}/messages`;
    return apiGet<Message[]>(path);
  }

  async sendMessage(conversationId: string, body: string): Promise<Message> {
    const channel = this.channelFor(conversationId);
    if (channel === "facebook") return this.mock.sendMessage(conversationId, body);
    const path =
      channel === "instagram"
        ? `/api/inbox/instagram/conversations/${conversationId}/messages`
        : `/api/inbox/conversations/${conversationId}/messages`;
    return apiSend<Message>(path, "POST", { text: body });
  }

  // ---- app-owned workflow state ----
  //
  // status / assignee / tags / read are channel-agnostic: they only ever touch
  // our shared server app-store, so LinkedIn AND Instagram both PATCH the same
  // /api/inbox/conversations/[id] route. Only Facebook (mock) is routed locally.

  async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.setStatus(conversationId, status);
    await apiSend(`/api/inbox/conversations/${conversationId}`, "PATCH", { status });
  }

  async assign(conversationId: string, agentId: string | null): Promise<void> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.assign(conversationId, agentId);
    await apiSend(`/api/inbox/conversations/${conversationId}`, "PATCH", {
      assigneeId: agentId,
    });
  }

  async addTag(conversationId: string, tag: string): Promise<void> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.addTag(conversationId, tag);
    await apiSend(`/api/inbox/conversations/${conversationId}`, "PATCH", {
      addTag: tag,
    });
  }

  async removeTag(conversationId: string, tag: string): Promise<void> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.removeTag(conversationId, tag);
    await apiSend(`/api/inbox/conversations/${conversationId}`, "PATCH", {
      removeTag: tag,
    });
  }

  async markRead(conversationId: string, read: boolean): Promise<void> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.markRead(conversationId, read);
    await apiSend(`/api/inbox/conversations/${conversationId}`, "PATCH", { read });
  }

  // ---- agents & notes ----

  async listAgents(): Promise<Agent[]> {
    try {
      return await apiGet<Agent[]>("/api/inbox/agents");
    } catch {
      return this.mock.listAgents();
    }
  }

  async listNotes(conversationId: string): Promise<InternalNote[]> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.listNotes(conversationId);
    return apiGet<InternalNote[]>(
      `/api/inbox/conversations/${conversationId}/notes`,
    );
  }

  async addNote(conversationId: string, body: string): Promise<InternalNote> {
    if (this.channelFor(conversationId) === "facebook")
      return this.mock.addNote(conversationId, body);
    return apiSend<InternalNote>(
      `/api/inbox/conversations/${conversationId}/notes`,
      "POST",
      { body },
    );
  }

  // ---- realtime ----

  subscribe(onInbound: (m: Message) => void): () => void {
    // NOTE: the simulated/mock inbound notifications have been removed — only
    // REAL inbound messages (detected by polling LinkedIn + Instagram) surface.
    // TODO: replace these polls with the webhook-driven realtime stream
    //       (app/api/inbox/webhook -> SSE/WebSocket/Queue fan-out).
    const stopLinkedin = this.pollChannel(
      () => this.fetchLinkedinConversations(),
      onInbound,
    );
    const stopInstagram = this.pollChannel(
      () => this.fetchInstagramConversations(),
      onInbound,
    );

    return () => {
      stopLinkedin();
      stopInstagram();
    };
  }

  /**
   * Generic conversation-list poller: detects a changed last-activity timestamp
   * per conversation and emits the latest inbound message (deduped by id). Used
   * for both LinkedIn and Instagram. Reconciliation only — the webhook is the
   * intended real-time source.
   */
  private pollChannel(
    fetchConversations: () => Promise<Conversation[]>,
    onInbound: (m: Message) => void,
  ): () => void {
    const lastSeenAt = new Map<string, string>();
    const emitted = new Set<string>();
    let polling = false;
    let seeded = false;

    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const convs = await fetchConversations();
        for (const conv of convs) {
          const prev = lastSeenAt.get(conv.id);
          lastSeenAt.set(conv.id, conv.lastMessageAt);
          if (!seeded || !prev || prev === conv.lastMessageAt) continue;

          const messages = await this.listMessages(conv.id);
          const last = messages[messages.length - 1];
          if (last && last.direction === "inbound" && !emitted.has(last.id)) {
            emitted.add(last.id);
            onInbound(last);
          }
        }
        seeded = true;
      } catch {
        // ignore transient poll errors
      } finally {
        polling = false;
      }
    };

    void poll();
    const timer = setInterval(poll, 20_000);
    return () => clearInterval(timer);
  }
}

// ---- internal fetch helpers (client -> our own API routes) ----

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
