import type {
  Agent,
  Conversation,
  ConversationFilter,
  ConversationStatus,
  InternalNote,
  Message,
} from "@/lib/types";
import type { InboxService } from "./inbox-service";
import {
  buildSeed,
  CURRENT_AGENT_ID,
  SEED_AGENTS,
  SIMULATED_INBOUND,
} from "./mock-data";

/** Artificial latency so loading/skeleton states are visible in the prototype. */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${idCounter++}`;

/**
 * In-memory implementation of {@link InboxService}. All mutations persist for
 * the lifetime of the browser session. Swap this out for an adapter-backed
 * service to go live - see `lib/services/index.ts`.
 */
export class MockInboxService implements InboxService {
  private conversations: Conversation[];
  private messages: Record<string, Message[]>;
  private notes: Record<string, InternalNote[]>;
  private subscribers = new Set<(m: Message) => void>();
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private simIndex = 0;

  constructor() {
    const seed = buildSeed();
    this.conversations = seed.conversations;
    this.messages = seed.messagesByConversation;
    this.notes = seed.notesByConversation;
  }

  async listConversations(filter?: ConversationFilter): Promise<Conversation[]> {
    await delay(jitter(350, 650));
    let result = [...this.conversations];

    if (filter?.channel) {
      result = result.filter((c) => c.channel === filter.channel);
    }
    if (filter?.status) {
      result = result.filter((c) => c.status === filter.status);
    }
    if (filter?.assignedToMe) {
      result = result.filter((c) => c.assigneeId === CURRENT_AGENT_ID);
    }
    if (filter?.assigneeId !== undefined) {
      result = result.filter((c) => c.assigneeId === filter.assigneeId);
    }
    if (filter?.unreadOnly) {
      result = result.filter((c) => c.unreadCount > 0);
    }
    if (filter?.hasNotes) {
      result = result.filter((c) => (this.notes[c.id]?.length ?? 0) > 0);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.contact.displayName.toLowerCase().includes(q) ||
          c.contact.handle.toLowerCase().includes(q) ||
          c.lastMessagePreview.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return result.sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
  }

  async getConversation(id: string): Promise<Conversation | null> {
    await delay(jitter(150, 300));
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    await delay(jitter(300, 550));
    return [...(this.messages[conversationId] ?? [])].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
  }

  async sendMessage(conversationId: string, body: string): Promise<Message> {
    // TODO: integrate <channel> API - route through the conversation's
    // ChannelAdapter.sendMessage and map the provider response.
    await delay(jitter(400, 800));
    const conv = this.conversations.find((c) => c.id === conversationId);
    const channel = conv?.channel ?? "instagram";
    const message: Message = {
      id: nextId("msg"),
      conversationId,
      channel,
      direction: "outbound",
      body,
      sentAt: new Date().toISOString(),
      deliveryStatus: "sent",
      authorType: "agent",
      authorName: this.currentAgentName(),
    };
    this.messages[conversationId] = [...(this.messages[conversationId] ?? []), message];
    this.touchConversation(conversationId, body, message.sentAt);

    // Simulate the delivery lifecycle: sent -> delivered -> read.
    setTimeout(() => this.updateDelivery(conversationId, message.id, "delivered"), 1200);
    setTimeout(() => this.updateDelivery(conversationId, message.id, "read"), 3200);

    return message;
  }

  async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await delay(jitter(200, 400));
    this.patchConversation(conversationId, { status });
  }

  async assign(conversationId: string, agentId: string | null): Promise<void> {
    await delay(jitter(200, 400));
    this.patchConversation(conversationId, { assigneeId: agentId });
  }

  async addTag(conversationId: string, tag: string): Promise<void> {
    await delay(jitter(150, 300));
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv && !conv.tags.includes(tag)) {
      this.patchConversation(conversationId, { tags: [...conv.tags, tag] });
    }
  }

  async removeTag(conversationId: string, tag: string): Promise<void> {
    await delay(jitter(150, 300));
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      this.patchConversation(conversationId, {
        tags: conv.tags.filter((t) => t !== tag),
      });
    }
  }

  async markRead(conversationId: string, read: boolean): Promise<void> {
    await delay(jitter(150, 300));
    this.patchConversation(conversationId, { unreadCount: read ? 0 : 1 });
  }

  async listAgents(): Promise<Agent[]> {
    await delay(jitter(120, 250));
    return [...SEED_AGENTS];
  }

  async listNotes(conversationId: string): Promise<InternalNote[]> {
    await delay(jitter(250, 450));
    return [...(this.notes[conversationId] ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  async addNote(conversationId: string, body: string): Promise<InternalNote> {
    await delay(jitter(250, 450));
    const note: InternalNote = {
      id: nextId("note"),
      conversationId,
      authorId: CURRENT_AGENT_ID,
      authorName: this.currentAgentName(),
      body,
      createdAt: new Date().toISOString(),
    };
    this.notes[conversationId] = [...(this.notes[conversationId] ?? []), note];
    return note;
  }

  subscribe(onInbound: (m: Message) => void): () => void {
    this.subscribers.add(onInbound);
    // Lazily start the demo simulator once someone is listening.
    if (!this.simTimer) {
      this.simTimer = setInterval(() => this.emitSimulatedInbound(), 30_000);
    }
    return () => {
      this.subscribers.delete(onInbound);
      if (this.subscribers.size === 0 && this.simTimer) {
        clearInterval(this.simTimer);
        this.simTimer = null;
      }
    };
  }

  // ---- internal helpers ----

  private currentAgentName() {
    return SEED_AGENTS.find((a) => a.id === CURRENT_AGENT_ID)?.name ?? "You";
  }

  private patchConversation(id: string, patch: Partial<Conversation>) {
    this.conversations = this.conversations.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
  }

  private touchConversation(id: string, preview: string, at: string) {
    this.patchConversation(id, { lastMessagePreview: preview, lastMessageAt: at });
  }

  private updateDelivery(
    conversationId: string,
    messageId: string,
    status: Message["deliveryStatus"],
  ) {
    const list = this.messages[conversationId];
    if (!list) return;
    this.messages[conversationId] = list.map((m) =>
      m.id === messageId ? { ...m, deliveryStatus: status } : m,
    );
  }

  private emitSimulatedInbound() {
    if (this.subscribers.size === 0) return;
    const next = SIMULATED_INBOUND[this.simIndex % SIMULATED_INBOUND.length];
    this.simIndex++;
    const conv = this.conversations.find((c) => c.id === next.conversationId);
    if (!conv) return;

    const message: Message = {
      id: nextId("msg"),
      conversationId: next.conversationId,
      channel: conv.channel,
      direction: "inbound",
      body: next.body,
      sentAt: new Date().toISOString(),
      deliveryStatus: "delivered",
      authorType: "contact",
      authorName: conv.contact.displayName,
    };
    this.messages[next.conversationId] = [
      ...(this.messages[next.conversationId] ?? []),
      message,
    ];
    this.patchConversation(next.conversationId, {
      lastMessagePreview: message.body,
      lastMessageAt: message.sentAt,
      unreadCount: conv.unreadCount + 1,
    });
    this.subscribers.forEach((fn) => fn(message));
  }
}
