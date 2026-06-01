import "server-only";

/**
 * Thin server-side wrapper around the Freshdesk API (v2).
 *
 * SERVER ONLY. The Freshdesk key is an admin-level secret that controls the
 * entire helpdesk - it must NEVER reach the browser. Nothing here is
 * `NEXT_PUBLIC_`, this module is imported only by route handlers, and the key is
 * never placed in a response body, log line, or thrown error. The client talks
 * to our own /api/support/* routes, which authorise each request before calling
 * Freshdesk.
 *
 * Mirrors the shape of ./unipile.ts: a typed error carrying the upstream status,
 * env-backed credential getters, a rate-limit-aware request wrapper, and one
 * function per endpoint we expose.
 */

// ──────────────────────────────────────────────────────────────────────────
// Auth + base URL
// ──────────────────────────────────────────────────────────────────────────

const PORTAL_URL = "https://sbiyouthforindia.freshdesk.com";
const BASE_URL = `${PORTAL_URL}/api/v2`;

/** Agent-facing URL for a ticket (for links in exports/notes). */
export function ticketUrl(id: number): string {
  return `${PORTAL_URL}/a/tickets/${id}`;
}

function apiKey(): string {
  const value = process.env.FRESHDESK_API_KEY;
  if (!value) throw new Error("FRESHDESK_API_KEY is not set");
  return value;
}

/**
 * Freshdesk uses HTTP Basic auth: username = API key, password = any dummy
 * string ("X" by convention; Freshdesk ignores it). We build the header here so
 * the raw key never appears anywhere else.
 */
function authHeader(): string {
  const token = Buffer.from(`${apiKey()}:X`).toString("base64");
  return `Basic ${token}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Error type
// ──────────────────────────────────────────────────────────────────────────

interface FreshdeskErrorField {
  field?: string;
  message?: string;
  code?: string;
}

/**
 * Error carrying the upstream HTTP status plus a parsed, key-safe message for
 * route handlers. We deliberately surface only `description` / per-field
 * messages from the JSON error body - never headers - so the auth credential
 * can never leak through an error response.
 */
export class FreshdeskError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: FreshdeskErrorField[] = [],
  ) {
    super(message);
    this.name = "FreshdeskError";
  }
}

/** Human-readable fallbacks for the documented status codes. */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Validation failed",
  401: "Authentication failed",
  403: "Access denied or feature not enabled",
  404: "Resource not found",
  405: "HTTP method not allowed",
  409: "Conflict (e.g. duplicate)",
  415: "Unsupported content type",
  429: "Rate limited",
  500: "Freshdesk server error",
};

/**
 * Turns a non-2xx response into a {@link FreshdeskError}. Parses the documented
 * `{ description, errors:[{field, message, code}] }` body for a useful message
 * and never echoes request headers or the API key.
 */
async function toFreshdeskError(res: Response): Promise<FreshdeskError> {
  let description = "";
  let fields: FreshdeskErrorField[] = [];
  try {
    const body = (await res.json()) as {
      description?: string;
      errors?: FreshdeskErrorField[];
    };
    description = body?.description ?? "";
    if (Array.isArray(body?.errors)) {
      fields = body.errors.map((e) => ({
        field: e.field,
        message: e.message,
        code: e.code,
      }));
    }
  } catch {
    /* non-JSON body (e.g. a raw 500 page); fall back to the status message */
  }

  const fieldSummary = fields
    .map((f) => [f.field, f.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
  const message =
    [description, fieldSummary].filter(Boolean).join(" - ") ||
    STATUS_MESSAGES[res.status] ||
    `Freshdesk request failed (${res.status})`;

  return new FreshdeskError(res.status, message, fields);
}

// ──────────────────────────────────────────────────────────────────────────
// Rate-limit-aware request wrapper
//
// Every Freshdesk response carries X-RateLimit-{Total,Remaining}. On 429 the
// API returns Retry-After (seconds); we honour it, then retry. Even invalid
// requests count toward the per-minute limit, so we also proactively pause when
// the remaining budget is nearly exhausted to keep bulk paging from tripping
// the limit in the first place.
// ──────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pause before the next call when the remaining per-minute budget is tiny. */
async function throttle(remaining: number | null) {
  if (remaining !== null && remaining <= 1) {
    // We can't see the window reset time; a 1s breather avoids hammering the
    // last credit on a tight pagination loop.
    await sleep(1000);
  }
}

let lastRemaining: number | null = null;

interface RawResponse<T> {
  data: T;
  /** The `link` header's next-page URL, or null on the last page. */
  nextLink: string | null;
}

/**
 * Performs a Freshdesk request against an absolute URL (so it can follow the
 * `link` header verbatim). Retries on 429 honouring `Retry-After`, with a
 * bounded exponential fallback. Returns the parsed JSON plus the next-page link.
 */
async function rawRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<RawResponse<T>> {
  const MAX_RETRIES = 4;
  const BACKOFF_MS = [1000, 2000, 4000, 8000];

  for (let attempt = 0; ; attempt++) {
    await throttle(lastRemaining);

    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // Always hit Freshdesk fresh; this is live helpdesk data.
      cache: "no-store",
    });

    const remainingHeader = res.headers.get("x-ratelimit-remaining");
    lastRemaining = remainingHeader === null ? null : Number(remainingHeader);

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) throw await toFreshdeskError(res);

    // 204 (e.g. no content) -> empty object; otherwise parse JSON.
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as T;
    return { data, nextLink: parseNextLink(res.headers.get("link")) };
  }
}

/** Convenience for non-paginated calls that only need the parsed body. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await rawRequest<T>(`${BASE_URL}${path}`, init);
  return data;
}

/**
 * Extracts the next-page URL from a Freshdesk `link` header, formatted as
 * `<https://.../tickets?page=2>; rel="next"`. Returns null when absent (= last
 * page). Pagination is driven by this header, never by blind page increments.
 */
function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/<([^>]+)>\s*;\s*rel="next"/i);
  return match ? match[1] : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Enum maps (numeric -> human label). The frontend never sees raw integers.
// ──────────────────────────────────────────────────────────────────────────

export const TICKET_STATUS: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
};

export const TICKET_PRIORITY: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export const TICKET_SOURCE: Record<number, string> = {
  1: "Email",
  2: "Portal",
  3: "Phone",
  7: "Chat",
  9: "Feedback Widget",
  10: "Outbound Email",
};

/** A numeric enum value paired with its display label. */
export interface Labeled {
  code: number;
  label: string;
}

function label(map: Record<number, string>, code: number | undefined): Labeled {
  return { code: code ?? 0, label: (code && map[code]) || "Unknown" };
}

// ──────────────────────────────────────────────────────────────────────────
// Raw Freshdesk response shapes (only the fields we consume)
// ──────────────────────────────────────────────────────────────────────────

interface RawTicket {
  id: number;
  subject: string | null;
  description?: string; // present with ?include=description
  description_text?: string;
  status: number;
  priority: number;
  source: number;
  type?: string | null;
  tags?: string[];
  requester_id?: number;
  responder_id?: number | null;
  group_id?: number | null;
  due_by?: string | null;
  created_at: string;
  updated_at: string;
  requester?: RawRequester; // present with ?include=requester
  conversations?: RawConversation[]; // present with ?include=conversations
  stats?: RawTicketStats; // present with ?include=stats
}

interface RawTicketStats {
  agent_responded_at?: string | null;
  first_responded_at?: string | null;
  requester_responded_at?: string | null;
}

interface RawRequester {
  id?: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface RawConversation {
  id: number;
  body?: string; // HTML
  body_text?: string;
  incoming: boolean; // true = from requester, false = from an agent
  private: boolean; // true = internal note
  user_id?: number;
  from_email?: string | null;
  to_emails?: string[] | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Our shaped DTOs (what route handlers return to the frontend)
// ──────────────────────────────────────────────────────────────────────────

export interface TicketSummary {
  id: number;
  subject: string;
  description: string | null; // present only when requested via include
  status: Labeled;
  priority: Labeled;
  source: Labeled;
  type: string | null;
  tags: string[];
  requesterId: number | null;
  responderId: number | null;
  createdAt: string;
  updatedAt: string;
  dueBy: string | null;
  /** True when an agent has responded at least once (needs ?include=stats). */
  repliedByAgent: boolean;
}

export interface TicketRequester {
  id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface TicketConversation {
  id: number;
  body: string;
  incoming: boolean;
  private: boolean;
  userId: number | null;
  fromEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends TicketSummary {
  requester: TicketRequester | null;
  conversations: TicketConversation[];
}

function shapeTicket(t: RawTicket): TicketSummary {
  return {
    id: t.id,
    subject: t.subject ?? "(no subject)",
    description: t.description ?? null,
    status: label(TICKET_STATUS, t.status),
    priority: label(TICKET_PRIORITY, t.priority),
    source: label(TICKET_SOURCE, t.source),
    type: t.type ?? null,
    tags: t.tags ?? [],
    requesterId: t.requester_id ?? null,
    responderId: t.responder_id ?? null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    dueBy: t.due_by ?? null,
    repliedByAgent: Boolean(
      t.stats && (t.stats.first_responded_at || t.stats.agent_responded_at),
    ),
  };
}

function shapeRequester(r: RawRequester): TicketRequester {
  return {
    id: r.id ?? null,
    name: r.name ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
  };
}

function shapeConversation(c: RawConversation): TicketConversation {
  return {
    id: c.id,
    body: c.body ?? "",
    incoming: c.incoming,
    private: c.private,
    userId: c.user_id ?? null,
    fromEmail: c.from_email ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ──────────────────────────────────────────────────────────────────────────

const MAX_PAGES = 300; // Freshdesk caps /tickets at 300 pages (30,000 tickets).
const PER_PAGE = 100; // API maximum.

export interface ListTicketsOptions {
  /** ISO-8601 (e.g. "2025-01-01T00:00:00Z") to fetch tickets older than 30 days. */
  updatedSince?: string;
  /** Stop after this many pages (defaults to the 300-page API ceiling). */
  maxPages?: number;
}

/**
 * GET /tickets - lists tickets, paging via the `link` header (never blind page
 * increments). Includes `description` so the list carries body text (required
 * for accounts created after 2018-11-30). Capped at {@link MAX_PAGES}.
 */
export async function listTickets(
  opts: ListTicketsOptions = {},
): Promise<{ tickets: TicketSummary[]; truncated: boolean }> {
  const cap = Math.min(opts.maxPages ?? MAX_PAGES, MAX_PAGES);

  const qs = new URLSearchParams({
    per_page: String(PER_PAGE),
    page: "1",
    include: "description",
  });
  if (opts.updatedSince) qs.set("updated_since", opts.updatedSince);

  let url: string | null = `${BASE_URL}/tickets?${qs.toString()}`;
  const all: TicketSummary[] = [];
  let pages = 0;

  while (url && pages < cap) {
    const { data, nextLink }: RawResponse<RawTicket[]> =
      await rawRequest<RawTicket[]>(url);
    all.push(...data.map(shapeTicket));
    url = nextLink;
    pages++;
  }

  // Newest activity first. Freshdesk's list order isn't guaranteed across pages,
  // so we sort here (ISO timestamps compare lexicographically).
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // truncated = there was another page but we hit our own page cap.
  return { tickets: all, truncated: Boolean(url) };
}

export interface GetTicketOptions {
  /** Embed up to 10 conversations (costs 2 API credits). */
  conversations?: boolean;
  /** Embed requester contact details (email, name, phone). */
  requester?: boolean;
}

/**
 * GET /tickets/{id} - a single ticket. The base call returns subject +
 * description but NOT the thread; pass `conversations` to embed up to 10
 * messages and `requester` for contact details.
 */
export async function getTicket(
  id: number,
  opts: GetTicketOptions = {},
): Promise<TicketDetail> {
  const include = [
    opts.conversations && "conversations",
    opts.requester && "requester",
  ].filter(Boolean) as string[];

  const qs = include.length ? `?include=${include.join(",")}` : "";
  const t = await request<RawTicket>(`/tickets/${id}${qs}`);

  return {
    ...shapeTicket(t),
    requester: t.requester ? shapeRequester(t.requester) : null,
    conversations: (t.conversations ?? []).map(shapeConversation),
  };
}

/**
 * GET /tickets/{id}/conversations - the full thread, paginated via the `link`
 * header. Use this when a ticket has more than the 10 conversations the
 * embedded include returns.
 */
export async function getConversations(
  id: number,
  opts: { maxPages?: number } = {},
): Promise<TicketConversation[]> {
  const cap = opts.maxPages ?? 50;
  let url: string | null = `${BASE_URL}/tickets/${id}/conversations?per_page=${PER_PAGE}&page=1`;
  const all: TicketConversation[] = [];
  let pages = 0;

  while (url && pages < cap) {
    const { data, nextLink }: RawResponse<RawConversation[]> =
      await rawRequest<RawConversation[]>(url);
    all.push(...data.map(shapeConversation));
    url = nextLink;
    pages++;
  }

  return all;
}

/** Thrown when a reply/note body is empty after stripping HTML/whitespace. */
export class EmptyBodyError extends Error {
  constructor() {
    super("Reply/note body must be non-empty HTML");
    this.name = "EmptyBodyError";
  }
}

/** True when `html` contains visible text once tags + whitespace are stripped. */
function hasVisibleContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

/**
 * POST /tickets/{id}/reply - sends a CUSTOMER-FACING email to the requester.
 * This is a real, irreversible outbound side effect; the calling route must
 * gate it behind an explicit confirmation. `body` is HTML and is the only
 * required field. Throws {@link EmptyBodyError} for blank bodies.
 */
export async function replyToTicket(
  id: number,
  body: string,
): Promise<TicketConversation> {
  if (!hasVisibleContent(body)) throw new EmptyBodyError();
  const c = await request<RawConversation>(`/tickets/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return shapeConversation(c);
}

/**
 * POST /tickets/{id}/notes - adds a PRIVATE internal note (never sent to the
 * requester). Kept separate from {@link replyToTicket} so the two can never be
 * confused. `private` is forced true. Throws {@link EmptyBodyError} for blanks.
 */
export async function addNote(
  id: number,
  body: string,
): Promise<TicketConversation> {
  if (!hasVisibleContent(body)) throw new EmptyBodyError();
  const c = await request<RawConversation>(`/tickets/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ body, private: true }),
  });
  return shapeConversation(c);
}

// ──────────────────────────────────────────────────────────────────────────
// Paginated list + total count (drives lazy-loading in the sidebar)
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_PER_PAGE = 30;

export interface TicketPage {
  tickets: TicketSummary[];
  page: number;
  /** True when the `link` header advertised a next page. */
  hasMore: boolean;
}

/**
 * One page of tickets, newest-updated first, with `hasMore` derived from the
 * `link` header (never a blind page increment). Asking Freshdesk to sort
 * (`order_by=updated_at desc`) keeps pages consistent so lazy-loading on scroll
 * doesn't reorder rows the agent has already seen. Defaults to the last-30-day
 * window the API uses unless `updatedSince` is given.
 */
export async function listTicketsPage(
  opts: { page?: number; perPage?: number; updatedSince?: string } = {},
): Promise<TicketPage> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(opts.perPage ?? DEFAULT_PER_PAGE, PER_PAGE);

  const qs = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    // stats gives first/agent_responded_at, which drives the Open vs Replied tabs.
    include: "description,stats",
    order_by: "updated_at",
    order_type: "desc",
  });
  if (opts.updatedSince) qs.set("updated_since", opts.updatedSince);

  const { data, nextLink } = await rawRequest<RawTicket[]>(
    `${BASE_URL}/tickets?${qs.toString()}`,
  );
  return { tickets: data.map(shapeTicket), page, hasMore: Boolean(nextLink) };
}

/** A YYYY-MM-DD date `days` before now (UTC), for search-window queries. */
function daysAgoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Grand total ticket count. The basic list endpoint returns no total, so we use
 * the search endpoint (which returns `total`), scoped to the SAME last-30-day
 * window the list uses so the number matches what the agent can page through.
 */
export async function countTickets(opts: { sinceDays?: number } = {}): Promise<number> {
  const since = daysAgoDate(opts.sinceDays ?? 30);
  const query = `"updated_at:>'${since}'"`;
  const data = await request<{ total?: number }>(
    `/search/tickets?query=${encodeURIComponent(query)}`,
  );
  return data.total ?? 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Status changes (single + bulk)
// ──────────────────────────────────────────────────────────────────────────

const STATUS_CODE_BY_LABEL: Record<string, number> = Object.fromEntries(
  Object.entries(TICKET_STATUS).map(([code, lbl]) => [lbl.toLowerCase(), Number(code)]),
);

/** Resolves a human status label ("Open", "Resolved", …) to its numeric code. */
export function statusCodeFromLabel(label: string): number | null {
  return STATUS_CODE_BY_LABEL[label.trim().toLowerCase()] ?? null;
}

/**
 * PUT /tickets/{id} with ONLY `{ status }` (partial update; no other fields).
 * Freshdesk may reject a move to Resolved/Closed with 400 + an `errors[]` list
 * of required fields, or 403 if the agent can't touch this ticket. Both arrive
 * as a {@link FreshdeskError} carrying the upstream status and parsed field
 * messages, which the route turns into a specific, key-safe error.
 */
export async function updateTicketStatus(
  id: number,
  status: number,
): Promise<TicketSummary> {
  const t = await request<RawTicket>(`/tickets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  return shapeTicket(t);
}

/**
 * PUT /tickets/{id} with an arbitrary property set (status, priority, …). A
 * partial update — only the given fields are sent. Used by quick actions.
 * Throws {@link FreshdeskError} (e.g. 400 required-field on close, 403 scope).
 */
export async function updateTicketProperties(
  id: number,
  properties: Record<string, number>,
): Promise<TicketSummary> {
  const t = await request<RawTicket>(`/tickets/${id}`, {
    method: "PUT",
    body: JSON.stringify(properties),
  });
  return shapeTicket(t);
}

export interface BulkPropertiesResult {
  jobId: string | null;
  succeeded: number[];
  failed: { id: number; reason: string }[];
}

/**
 * POST /tickets/bulk_update with arbitrary properties (e.g. status + priority),
 * polls the async job, then verifies each ticket actually has the new values
 * (Freshdesk can fail individual tickets silently on agent scope). Returns which
 * ids took the change.
 */
export async function bulkUpdateProperties(
  ids: number[],
  properties: Record<string, number>,
): Promise<BulkPropertiesResult> {
  if (ids.length === 0) return { jobId: null, succeeded: [], failed: [] };

  const start = await request<{ job_id?: string; id?: string }>(
    `/tickets/bulk_update`,
    {
      method: "POST",
      body: JSON.stringify({ bulk_action: { ids, properties } }),
    },
  );
  const jobId = start.job_id ?? start.id ?? null;

  if (jobId) {
    for (let i = 0; i < 10; i++) {
      try {
        const job = await request<{ status?: string }>(`/jobs/${jobId}`);
        if (/complete|success|finish/i.test(job.status ?? "")) break;
      } catch {
        /* keep waiting; verification is the source of truth */
      }
      await sleep(1000);
    }
  }

  const keys = Object.keys(properties);
  const succeeded: number[] = [];
  const failed: { id: number; reason: string }[] = [];
  for (const id of ids) {
    try {
      const t = (await request<RawTicket>(`/tickets/${id}`)) as unknown as Record<
        string,
        number
      >;
      if (keys.every((k) => t[k] === properties[k])) succeeded.push(id);
      else failed.push({ id, reason: "properties did not apply" });
    } catch {
      failed.push({ id, reason: "could not verify (access denied?)" });
    }
  }
  return { jobId, succeeded, failed };
}

export interface BulkStatusResult {
  jobId: string | null;
  succeeded: number[];
  /** Tickets that did NOT reach the target status, with their current status. */
  failed: { id: number; status: Labeled }[];
}

/**
 * POST /tickets/bulk_update to change many tickets' status at once. The call is
 * asynchronous (returns a job_id), so we poll GET /jobs/{id} until it finishes,
 * then VERIFY by re-reading each ticket's status. Verification matters because
 * Freshdesk can fail individual tickets silently (e.g. agent scope) without
 * flagging it in the job, so the refetch is the source of truth for which ids
 * actually changed.
 */
export async function bulkUpdateStatus(
  ids: number[],
  status: number,
): Promise<BulkStatusResult> {
  if (ids.length === 0) return { jobId: null, succeeded: [], failed: [] };

  const start = await request<{ job_id?: string; id?: string }>(
    `/tickets/bulk_update`,
    {
      method: "POST",
      body: JSON.stringify({ bulk_action: { ids, properties: { status } } }),
    },
  );
  const jobId = start.job_id ?? start.id ?? null;

  // Poll the job a bounded number of times. The per-ticket refetch below is the
  // real source of truth, so we don't hard-fail on an unexpected job shape.
  if (jobId) {
    for (let i = 0; i < 10; i++) {
      try {
        const job = await request<{ status?: string }>(`/jobs/${jobId}`);
        if (/complete|success|finish/i.test(job.status ?? "")) break;
      } catch {
        /* keep waiting; verification handles the truth */
      }
      await sleep(1000);
    }
  }

  const succeeded: number[] = [];
  const failed: { id: number; status: Labeled }[] = [];
  for (const id of ids) {
    try {
      const t = await request<RawTicket>(`/tickets/${id}`);
      if (t.status === status) succeeded.push(id);
      else failed.push({ id, status: label(TICKET_STATUS, t.status) });
    } catch {
      // Couldn't read it back (e.g. access denied) → treat as failed/unknown.
      failed.push({ id, status: { code: 0, label: "Unknown" } });
    }
  }
  return { jobId, succeeded, failed };
}

// ──────────────────────────────────────────────────────────────────────────
// Scenario automations (defined by an admin in Freshdesk; the API can only
// LIST and EXECUTE them — it can't create/edit them or read the reply text).
// ──────────────────────────────────────────────────────────────────────────

interface RawScenarioAction {
  name: string;
  value?: string;
}

interface RawScenario {
  id: number;
  name: string;
  description?: string;
  actions?: RawScenarioAction[];
  private?: boolean;
}

export interface ScenarioSummary {
  id: number;
  name: string;
  description: string;
  /** Human summary of what running it does, e.g. "set status to Closed, send a reply". */
  summary: string;
}

function summarizeScenario(actions: RawScenarioAction[]): string {
  const parts = actions.map((a) => {
    switch (a.name) {
      case "status":
        return `set status to ${TICKET_STATUS[Number(a.value)] ?? a.value}`;
      case "priority":
        return `set priority to ${TICKET_PRIORITY[Number(a.value)] ?? a.value}`;
      case "add_reply":
        return "send a reply";
      case "add_note":
        return "add a note";
      default:
        return a.name.replace(/_/g, " ");
    }
  });
  return parts.join(", ");
}

/**
 * GET /scenario_automations - the account's scenario automations (admin-defined
 * in Freshdesk). The reply body inside an automation is NOT exposed by the API,
 * so we only surface the name + a summary of its actions.
 */
export async function listScenarios(): Promise<ScenarioSummary[]> {
  const data = await request<RawScenario[]>(`/scenario_automations?per_page=100`);
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? "",
    summary: summarizeScenario(s.actions ?? []),
  }));
}

/**
 * PUT /tickets/{id}/scenario - run a scenario automation on a ticket. Freshdesk
 * expects BOTH ids in the body. This applies the scenario's actions (which may
 * send a customer-facing reply and change status), so the calling route gates
 * it behind an explicit confirmation. Returns nothing on success.
 */
export async function executeScenario(
  ticketId: number,
  scenarioId: number,
): Promise<void> {
  await request(`/tickets/${ticketId}/scenario`, {
    method: "PUT",
    body: JSON.stringify({ scenario_id: scenarioId, ticket_id: ticketId }),
  });
}
