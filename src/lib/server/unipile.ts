import "server-only";

/**
 * Thin server-side wrapper around the Unipile API.
 *
 * SERVER ONLY. The Unipile API key is a secret and must never reach the
 * browser - nothing here is `NEXT_PUBLIC_`, and this module is imported only by
 * route handlers / server adapters. The client talks to our own /api/inbox/*
 * routes, never to Unipile directly.
 */

/** Error carrying the upstream HTTP status + raw body for route handlers. */
export class UnipileError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Unipile request failed (${status}): ${body.slice(0, 500)}`);
    this.name = "UnipileError";
  }
}

function dsn(): string {
  const value = process.env.UNIPILE_DSN;
  if (!value) throw new Error("UNIPILE_DSN is not set");
  return value;
}

function apiKey(): string {
  const value = process.env.UNIPILE_API_KEY;
  if (!value) throw new Error("UNIPILE_API_KEY is not set");
  return value;
}

function accountId(): string {
  const value = process.env.UNIPILE_ACCOUNT_ID;
  if (!value) throw new Error("UNIPILE_ACCOUNT_ID is not set");
  return value;
}

const baseUrl = () => `https://${dsn()}/api/v1`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": apiKey(),
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    // Always hit Unipile fresh; our own app store handles caching/merging.
    cache: "no-store",
  });

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new UnipileError(res.status, body);
  }

  return (await res.json()) as T;
}

// ---- Unipile response shapes (only the fields we consume) ----

export interface UnipileChat {
  id: string;
  mailbox_id: string;
  mailbox_name?: string;
  subject: string | null;
  unread_count: number;
  timestamp: string;
  attendee_provider_id: string;
  folder?: string[];
  // Present on Instagram chats (absent / unused for LinkedIn): the contact's
  // display name is returned inline, so IG needs no per-row getUser() hydration.
  name?: string | null;
  account_type?: string;
  attendee_id?: string;
}

export interface UnipileAttachment {
  id?: string;
  type?: string; // "img" | "video" | "audio" | "media_share" | "share" | ...
  unavailable?: boolean;
  post?: {
    url?: string;
    author?: string;
    description?: string;
  };
}

export interface UnipileMessage {
  id: string;
  chat_id: string;
  text: string | null;
  is_sender: number; // 1 = sent by our account/page, 0 = inbound
  seen: number;
  delivered: number;
  timestamp: string;
  sender_id?: string;
  attendee_type?: "ORGANIZATION" | "MEMBER";
  // Instagram DMs are frequently media (photos, shared posts, story replies)
  // with `text: null`; the payload carries the media here.
  attachments?: UnipileAttachment[];
}

export interface UnipileUser {
  provider_id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  public_identifier?: string;
  profile_picture_url?: string;
}

export interface UnipileAttendee {
  id: string;
  provider_id: string;
  name?: string;
  is_self?: number;
  picture_url?: string;
  profile_url?: string;
  specifics?: {
    public_identifier?: string;
    member_urn?: string;
    occupation?: string;
  };
}

interface Paginated<T> {
  object?: string;
  items?: T[];
  cursor?: string | null;
}

/**
 * GET /chats?account_id=...&limit=50 - lists chats across the account's
 * mailboxes, following the `cursor` for pagination. Capped to keep the
 * prototype responsive. // TODO: stream / lazy-load instead of eager paging.
 */
export async function listChats(): Promise<UnipileChat[]> {
  const all: UnipileChat[] = [];
  let cursor: string | null | undefined;
  const MAX_PAGES = 6;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ account_id: accountId(), limit: "50" });
    if (cursor) qs.set("cursor", cursor);
    const data = await request<Paginated<UnipileChat>>(`/chats?${qs.toString()}`);
    all.push(...(data.items ?? []));
    cursor = data.cursor;
    if (!cursor) break;
  }

  return all;
}

/** GET /chats/{chatId} - a single chat (used for on-demand conversation loads). */
export async function getChat(chatId: string): Promise<UnipileChat> {
  return request<UnipileChat>(`/chats/${encodeURIComponent(chatId)}`);
}

/** GET /chats/{chatId}/messages?limit=100 */
export async function getMessages(chatId: string): Promise<UnipileMessage[]> {
  const data = await request<Paginated<UnipileMessage>>(
    `/chats/${encodeURIComponent(chatId)}/messages?limit=100`,
  );
  return data.items ?? [];
}

/**
 * GET /users/{providerId}?account_id=... - full profile, INCLUDING the vanity
 * public_identifier. ⚠️ Heavily rate-limited by LinkedIn (HTTP 429); prefer
 * {@link getChatAttendees} for listing. Kept for optional on-demand enrichment.
 */
export async function getUser(providerId: string): Promise<UnipileUser> {
  return request<UnipileUser>(
    `/users/${encodeURIComponent(providerId)}?account_id=${encodeURIComponent(accountId())}`,
  );
}

/**
 * GET /chats/{chatId}/attendees - the chat participants (name, picture,
 * profile URL). Unlike /users this is NOT subject to the profile-view rate
 * limit, so it's our primary contact-hydration source.
 */
export async function getChatAttendees(
  chatId: string,
): Promise<UnipileAttendee[]> {
  const data = await request<Paginated<UnipileAttendee>>(
    `/chats/${encodeURIComponent(chatId)}/attendees`,
  );
  return data.items ?? [];
}

/**
 * POST /chats/{chatId}/messages as multipart/form-data with a `text` field.
 * (Do not set Content-Type manually - fetch adds the multipart boundary.)
 */
export async function sendMessage(
  chatId: string,
  text: string,
): Promise<{ message_id?: string; id?: string } & Record<string, unknown>> {
  const form = new FormData();
  form.append("text", text);
  return request(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: form,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Multi-account (Instagram) support
//
// The LinkedIn functions above are intentionally LEFT UNTOUCHED (they bind to
// the LinkedIn account/DSN/key via the module-level helpers). Everything below
// is additive: a small per-account client that the Instagram adapter uses.
// Instagram defaults to the SAME Unipile key + DSN as LinkedIn, with optional
// UNIPILE_IG_API_KEY / UNIPILE_IG_DSN overrides if IG lives under a different
// Unipile account.
// ──────────────────────────────────────────────────────────────────────────

/** Resolved Unipile credentials + account for a single channel. */
export interface UnipileAccount {
  dsn: string;
  apiKey: string;
  accountId: string;
}

/**
 * Builds the Instagram account config. Reuses the shared DSN/key by default and
 * only diverges when the IG-specific overrides are present. Throws (rather than
 * silently falling back) when the IG account id is missing, so misconfiguration
 * surfaces clearly in the route's error response.
 */
export function instagramAccount(): UnipileAccount {
  const accountId = process.env.UNIPILE_IG_ACCOUNT_ID;
  if (!accountId) throw new Error("UNIPILE_IG_ACCOUNT_ID is not set");
  return {
    dsn: process.env.UNIPILE_IG_DSN || dsn(),
    apiKey: process.env.UNIPILE_IG_API_KEY || apiKey(),
    accountId,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Account-scoped request with exponential backoff on 429 / 503 / 504. Honours a
 * `Retry-After` header when present, otherwise backs off 500ms → 1s → 2s. On
 * final failure (or any other non-2xx) it throws {@link UnipileError} carrying
 * the upstream status, which the route handler turns into a clean JSON error.
 *
 * Kept separate from the LinkedIn `request` above so LinkedIn's behaviour is
 * unchanged; this is the defensive path Meta/Unipile rate limits demand.
 */
async function accountRequest<T>(
  account: UnipileAccount,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `https://${account.dsn}/api/v1${path}`;
  const MAX_RETRIES = 3;
  const BACKOFF_MS = [500, 1000, 2000];

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        "X-API-KEY": account.apiKey,
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (res.ok) return (await res.json()) as T;

    const retryable = res.status === 429 || res.status === 503 || res.status === 504;
    if (retryable && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      await sleep(waitMs);
      continue;
    }

    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new UnipileError(res.status, body);
  }
}

/**
 * GET /chats?account_id=IG&limit=N[&cursor=...] - one page of flat IG DM
 * threads. Returns the items plus the top-level `cursor` for the next page so
 * the caller can do cursor-based paging instead of pulling the whole inbox.
 */
export async function listChatsPage(
  account: UnipileAccount,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ items: UnipileChat[]; cursor: string | null }> {
  const qs = new URLSearchParams({
    account_id: account.accountId,
    limit: String(opts.limit ?? 30),
  });
  if (opts.cursor) qs.set("cursor", opts.cursor);
  const data = await accountRequest<Paginated<UnipileChat>>(
    account,
    `/chats?${qs.toString()}`,
  );
  return { items: data.items ?? [], cursor: data.cursor ?? null };
}

/** GET /chats/{chatId} for a specific account (single-thread loads). */
export async function getChatForAccount(
  account: UnipileAccount,
  chatId: string,
): Promise<UnipileChat> {
  return accountRequest<UnipileChat>(
    account,
    `/chats/${encodeURIComponent(chatId)}`,
  );
}

/** GET /chats/{chatId}/messages?limit=N for a specific account. */
export async function getMessagesForAccount(
  account: UnipileAccount,
  chatId: string,
  opts: { limit?: number } = {},
): Promise<UnipileMessage[]> {
  const qs = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  const data = await accountRequest<Paginated<UnipileMessage>>(
    account,
    `/chats/${encodeURIComponent(chatId)}/messages?${qs.toString()}`,
  );
  return data.items ?? [];
}

/**
 * GET /chats/{chatId}/attendees for a specific account - used to hydrate the
 * Instagram contact's avatar + profile URL (the chat list carries the name but
 * not the picture). Not subject to the profile-view rate limit.
 */
export async function getChatAttendeesForAccount(
  account: UnipileAccount,
  chatId: string,
): Promise<UnipileAttendee[]> {
  const data = await accountRequest<Paginated<UnipileAttendee>>(
    account,
    `/chats/${encodeURIComponent(chatId)}/attendees`,
  );
  return data.items ?? [];
}

/** POST /chats/{chatId}/messages (multipart `text`) for a specific account. */
export async function sendMessageForAccount(
  account: UnipileAccount,
  chatId: string,
  text: string,
): Promise<{ message_id?: string; id?: string } & Record<string, unknown>> {
  const form = new FormData();
  form.append("text", text);
  return accountRequest(account, `/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: form,
  });
}
