import type {
  Agent,
  Channel,
  Conversation,
  ConversationStatus,
  InternalNote,
  Message,
  MessageDeliveryStatus,
  MessageDirection,
} from "@/lib/types";

/** The agent currently using the app — drives "Assigned to me". */
export const CURRENT_AGENT_ID = "agent-maya";

export const SEED_AGENTS: Agent[] = [
  {
    id: CURRENT_AGENT_ID,
    name: "Maya Chen",
    email: "maya@acme.co",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Maya&backgroundColor=b6e3f4",
  },
  {
    id: "agent-diego",
    name: "Diego Santos",
    email: "diego@acme.co",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Diego&backgroundColor=c0aede",
  },
  {
    id: "agent-priya",
    name: "Priya Nair",
    email: "priya@acme.co",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Priya&backgroundColor=ffd5dc",
  },
  {
    id: "agent-tom",
    name: "Tom Becker",
    email: "tom@acme.co",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Tom&backgroundColor=d1d4f9",
  },
];

const avatar = (seed: string) =>
  `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const profileUrl = (channel: Channel, handle: string) => {
  const slug = handle.replace(/^@/, "");
  switch (channel) {
    case "instagram":
      return `https://instagram.com/${slug}`;
    case "facebook":
      return `https://facebook.com/${slug}`;
    case "linkedin":
      return `https://linkedin.com/in/${slug}`;
  }
};

type ThreadEntry = {
  dir: MessageDirection;
  body: string;
  from?: string;
  minsAgo: number;
  delivery?: MessageDeliveryStatus;
  system?: boolean;
};

type SeedConversation = {
  id: string;
  channel: Channel;
  contact: { name: string; handle: string };
  status: ConversationStatus;
  assigneeId: string | null;
  tags: string[];
  unreadCount: number;
  thread: ThreadEntry[];
  notes?: { authorId: string; body: string; minsAgo: number }[];
};

const SEED: SeedConversation[] = [
  {
    id: "conv-1",
    channel: "instagram",
    contact: { name: "Ava Thompson", handle: "@ava.makes" },
    status: "open",
    assigneeId: CURRENT_AGENT_ID,
    tags: ["VIP", "Order issue"],
    unreadCount: 2,
    thread: [
      { dir: "inbound", body: "Hi! I ordered the ceramic mug set last week 🥺", minsAgo: 58 },
      { dir: "inbound", body: "Tracking still says label created. Any update?", minsAgo: 56 },
      { dir: "outbound", body: "Hi Ava! So sorry for the wait — let me pull up your order right now.", minsAgo: 44, delivery: "read" },
      { dir: "inbound", body: "Thank you!! Order #AC-20493", minsAgo: 12 },
      { dir: "inbound", body: "It was supposed to be a birthday gift 🎁", minsAgo: 9 },
    ],
    notes: [
      { authorId: "agent-diego", body: "Carrier had a scan delay — comped expedited shipping last time too.", minsAgo: 40 },
    ],
  },
  {
    id: "conv-2",
    channel: "linkedin",
    contact: { name: "Marcus Webb", handle: "marcus-webb-cto" },
    status: "pending",
    assigneeId: CURRENT_AGENT_ID,
    tags: ["Enterprise", "Demo"],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Saw your post on omnichannel support — we're evaluating tools for a 40-seat team.", minsAgo: 600 },
      { dir: "outbound", body: "Great to hear from you, Marcus. Happy to set up a tailored demo. What's your current stack?", minsAgo: 580, delivery: "read" },
      { dir: "inbound", body: "Mostly Zendesk + a patchwork of native apps. The native apps are the pain.", minsAgo: 540 },
      { dir: "outbound", body: "That's exactly what we replace. Does Thursday 2pm ET work for a 30-min walkthrough?", minsAgo: 520, delivery: "delivered" },
    ],
    notes: [
      { authorId: CURRENT_AGENT_ID, body: "Procurement cycle ~6 weeks. Decision maker is Marcus + VP Ops.", minsAgo: 500 },
    ],
  },
  {
    id: "conv-3",
    channel: "facebook",
    contact: { name: "Sophie Laurent", handle: "sophie.laurent.9" },
    status: "open",
    assigneeId: null,
    tags: ["Refund"],
    unreadCount: 1,
    thread: [
      { dir: "inbound", body: "I was double charged for my subscription this month.", minsAgo: 180 },
      { dir: "outbound", body: "I'm sorry about that, Sophie. Can you confirm the email on the account?", minsAgo: 150, delivery: "read" },
      { dir: "inbound", body: "sophie.l@gmail.com — I see two charges of $29 on the 28th.", minsAgo: 22 },
    ],
  },
  {
    id: "conv-4",
    channel: "instagram",
    contact: { name: "Jordan Kim", handle: "@jordankim" },
    status: "resolved",
    assigneeId: "agent-priya",
    tags: ["Sizing"],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Do the hoodies run true to size?", minsAgo: 2880 },
      { dir: "outbound", body: "They run slightly large — we'd suggest sizing down if you're between sizes!", minsAgo: 2860, delivery: "read" },
      { dir: "inbound", body: "Perfect, ordered a medium. Thanks!", minsAgo: 2850 },
      { dir: "outbound", body: "Enjoy! Let us know if anything's off. 💛", minsAgo: 2840, delivery: "read" },
      { dir: "inbound", body: "", from: "system", minsAgo: 2835, system: true },
    ],
  },
  {
    id: "conv-5",
    channel: "linkedin",
    contact: { name: "Nadia Rahman", handle: "nadia-rahman-design" },
    status: "open",
    assigneeId: null,
    tags: ["Partnership"],
    unreadCount: 3,
    thread: [
      { dir: "inbound", body: "Hi! I run a design community of ~12k members.", minsAgo: 95 },
      { dir: "inbound", body: "Would you be open to a co-marketing collab?", minsAgo: 94 },
      { dir: "inbound", body: "Happy to share our media kit 📎", minsAgo: 90 },
    ],
  },
  {
    id: "conv-6",
    channel: "facebook",
    contact: { name: "Liam O'Connor", handle: "liam.oconnor" },
    status: "snoozed",
    assigneeId: "agent-tom",
    tags: [],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Is the holiday sale still on?", minsAgo: 4320 },
      { dir: "outbound", body: "It ends tonight at midnight! Use code HOLIDAY20.", minsAgo: 4300, delivery: "read" },
      { dir: "inbound", body: "Amazing, will check it out later today.", minsAgo: 4290 },
    ],
  },
  {
    id: "conv-7",
    channel: "instagram",
    contact: { name: "Camila Reyes", handle: "@camila.reyes" },
    status: "open",
    assigneeId: CURRENT_AGENT_ID,
    tags: ["Order issue", "Urgent"],
    unreadCount: 1,
    thread: [
      { dir: "inbound", body: "The wrong color arrived 😞 I ordered sage, got navy.", minsAgo: 75 },
      { dir: "outbound", body: "Oh no — I'll get a replacement out today, no need to return the navy one.", minsAgo: 60, delivery: "read" },
      { dir: "inbound", body: "You're the best, thank you so much!", minsAgo: 5 },
    ],
  },
  {
    id: "conv-8",
    channel: "linkedin",
    contact: { name: "Henrik Larsson", handle: "henrik-larsson" },
    status: "pending",
    assigneeId: "agent-diego",
    tags: ["Enterprise"],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Following up on the security questionnaire — any ETA?", minsAgo: 1440 },
      { dir: "outbound", body: "Our security team is finalizing it; you'll have the SOC 2 report by Friday.", minsAgo: 1400, delivery: "delivered" },
    ],
  },
  {
    id: "conv-9",
    channel: "facebook",
    contact: { name: "Grace Mwangi", handle: "grace.mwangi" },
    status: "open",
    assigneeId: null,
    tags: ["Shipping"],
    unreadCount: 2,
    thread: [
      { dir: "inbound", body: "Do you ship to Kenya?", minsAgo: 200 },
      { dir: "inbound", body: "And what are the delivery times?", minsAgo: 199 },
    ],
  },
  {
    id: "conv-10",
    channel: "instagram",
    contact: { name: "Theo Martin", handle: "@theo.builds" },
    status: "resolved",
    assigneeId: CURRENT_AGENT_ID,
    tags: [],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Got my order, everything's perfect. Just wanted to say thanks!", minsAgo: 5760 },
      { dir: "outbound", body: "This made our day, Theo. 🙏 Come back soon!", minsAgo: 5740, delivery: "read" },
    ],
  },
  {
    id: "conv-11",
    channel: "linkedin",
    contact: { name: "Isabella Conti", handle: "isabella-conti-vp" },
    status: "open",
    assigneeId: "agent-priya",
    tags: ["Demo", "Hot lead"],
    unreadCount: 1,
    thread: [
      { dir: "inbound", body: "Loved the demo. Can you send pricing for 75 seats?", minsAgo: 130 },
      { dir: "outbound", body: "Absolutely — preparing a quote now, will send within the hour.", minsAgo: 120, delivery: "read" },
      { dir: "inbound", body: "Perfect. Also do you support SSO via Okta?", minsAgo: 8 },
    ],
    notes: [
      { authorId: "agent-priya", body: "Yes on Okta SSO (Business plan). Loop in SE for the quote.", minsAgo: 100 },
    ],
  },
  {
    id: "conv-12",
    channel: "facebook",
    contact: { name: "Daniel Park", handle: "daniel.park.dev" },
    status: "pending",
    assigneeId: null,
    tags: ["Bug report"],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "The checkout page throws an error on Safari.", minsAgo: 300 },
      { dir: "outbound", body: "Thanks for flagging — can you tell me your Safari version?", minsAgo: 280, delivery: "read" },
      { dir: "inbound", body: "17.2 on macOS Sonoma.", minsAgo: 260 },
      { dir: "outbound", body: "Got it, reproduced on our end. Engineering is on it — I'll keep you posted.", minsAgo: 250, delivery: "delivered" },
    ],
  },
  {
    id: "conv-13",
    channel: "instagram",
    contact: { name: "Yuki Tanaka", handle: "@yuki.t" },
    status: "open",
    assigneeId: null,
    tags: [],
    unreadCount: 1,
    thread: [
      { dir: "inbound", body: "Will the matcha whisk be restocked? 🍵", minsAgo: 48 },
    ],
  },
  {
    id: "conv-14",
    channel: "linkedin",
    contact: { name: "Olivia Brooks", handle: "olivia-brooks-ops" },
    status: "snoozed",
    assigneeId: "agent-tom",
    tags: ["Renewal"],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Our renewal is coming up in Q3 — let's chat about expanding seats.", minsAgo: 10080 },
      { dir: "outbound", body: "Love to hear it! I'll reach out in early Q3 to plan the expansion.", minsAgo: 10000, delivery: "read" },
    ],
  },
  {
    id: "conv-15",
    channel: "facebook",
    contact: { name: "Sam Rivera", handle: "sam.rivera" },
    status: "open",
    assigneeId: CURRENT_AGENT_ID,
    tags: ["Feedback"],
    unreadCount: 0,
    thread: [
      { dir: "inbound", body: "Just wanted to suggest a dark mode for your app 🌙", minsAgo: 420 },
      { dir: "outbound", body: "Funny you mention it — it's shipping next month! Thanks for the nudge.", minsAgo: 400, delivery: "read" },
      { dir: "inbound", body: "Incredible, can't wait!", minsAgo: 390 },
    ],
  },
];

const agentName = (id: string | null) =>
  SEED_AGENTS.find((a) => a.id === id)?.name ?? "Agent";

/**
 * Expands the compact seed into fully-formed domain objects with timestamps
 * computed relative to `now`. Called once when the mock service boots.
 */
export function buildSeed(now: number = Date.now()): {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  notesByConversation: Record<string, InternalNote[]>;
} {
  const conversations: Conversation[] = [];
  const messagesByConversation: Record<string, Message[]> = {};
  const notesByConversation: Record<string, InternalNote[]> = {};

  const iso = (minsAgo: number) =>
    new Date(now - minsAgo * 60_000).toISOString();

  for (const s of SEED) {
    const messages: Message[] = s.thread.map((t, i) => {
      const isSystem = t.system === true;
      return {
        id: `${s.id}-m${i + 1}`,
        conversationId: s.id,
        channel: s.channel,
        direction: t.dir,
        body: isSystem
          ? `${agentName(s.assigneeId)} marked this conversation as resolved`
          : t.body,
        sentAt: iso(t.minsAgo),
        deliveryStatus: t.dir === "outbound" ? t.delivery ?? "delivered" : "delivered",
        authorType: isSystem
          ? "system"
          : t.dir === "outbound"
            ? "agent"
            : "contact",
        authorName: isSystem
          ? "System"
          : t.dir === "outbound"
            ? agentName(s.assigneeId)
            : s.contact.name,
      };
    });

    const lastReal = [...messages].reverse().find((m) => m.authorType !== "system");
    const last = lastReal ?? messages[messages.length - 1];

    conversations.push({
      id: s.id,
      channel: s.channel,
      contact: {
        id: `${s.id}-contact`,
        channel: s.channel,
        displayName: s.contact.name,
        handle: s.contact.handle,
        avatarUrl: avatar(s.contact.name),
        profileUrl: profileUrl(s.channel, s.contact.handle),
      },
      lastMessagePreview: last.body,
      lastMessageAt: last.sentAt,
      unreadCount: s.unreadCount,
      status: s.status,
      assigneeId: s.assigneeId,
      tags: [...s.tags],
    });

    messagesByConversation[s.id] = messages;
    notesByConversation[s.id] = (s.notes ?? []).map((n, i) => ({
      id: `${s.id}-n${i + 1}`,
      conversationId: s.id,
      authorId: n.authorId,
      authorName: agentName(n.authorId),
      body: n.body,
      createdAt: iso(n.minsAgo),
    }));
  }

  return { conversations, messagesByConversation, notesByConversation };
}

/** Canned replies surfaced in the composer quick-insert. */
export const CANNED_REPLIES: { title: string; body: string }[] = [
  {
    title: "Greeting",
    body: "Hi there! Thanks for reaching out — happy to help. 😊",
  },
];

/** Pool of suggested tags for the tag picker. */
export const SUGGESTED_TAGS = [
  "VIP",
  "Urgent",
  "Order issue",
  "Refund",
  "Shipping",
  "Sizing",
  "Demo",
  "Enterprise",
  "Hot lead",
  "Partnership",
  "Bug report",
  "Feedback",
  "Renewal",
];

/** Demo inbound messages the realtime simulator can fire. */
export const SIMULATED_INBOUND: { conversationId: string; body: string }[] = [
  { conversationId: "conv-5", body: "Just following up — did the media kit come through? 📎" },
  { conversationId: "conv-9", body: "Hello? Still hoping to hear back about shipping to Kenya 🙏" },
  { conversationId: "conv-13", body: "Pretty please let me know about the matcha whisk restock!" },
  { conversationId: "conv-3", body: "Any update on that double charge? It's been a while." },
];
