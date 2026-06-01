"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * Client-side hooks for the Freshdesk-backed support desk. These talk ONLY to
 * our own /api/support/* routes (never to Freshdesk directly) — the API key
 * stays server-side. Types mirror the shaped DTOs returned by those routes.
 */

export interface Labeled {
  code: number;
  label: string;
}

export interface TicketSummary {
  id: number;
  subject: string;
  description: string | null;
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

interface TicketPage {
  tickets: TicketSummary[];
  page: number;
  hasMore: boolean;
}

export interface BulkStatusResult {
  jobId: string | null;
  targetStatus: string;
  succeeded: number[];
  failed: { id: number; status: Labeled }[];
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSummary {
  id: number;
  name: string;
  description: string;
  summary: string;
}

export interface QuickAction {
  key: string;
  label: string;
  summary: string;
}

export interface QuickActionBulkResult {
  action: string;
  results: {
    id: number;
    propertyOk: boolean;
    replyOk: boolean;
    error?: string;
  }[];
}

/** The status labels the agent can move a ticket to. */
export const STATUS_OPTIONS = ["Open", "Pending", "Resolved", "Closed"] as const;
export type StatusOption = (typeof STATUS_OPTIONS)[number];

// ── fetch helpers ───────────────────────────────────────────────────────────

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function apiSend<T>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

// ── query keys ────────────────────────────────────────────────────────────

export const supportKeys = {
  all: ["support"] as const,
  tickets: () => [...supportKeys.all, "tickets"] as const,
  ticket: (id: number) => [...supportKeys.all, "ticket", id] as const,
  count: () => [...supportKeys.all, "count"] as const,
  canned: () => [...supportKeys.all, "canned"] as const,
  scenarios: () => [...supportKeys.all, "scenarios"] as const,
  quickActions: () => [...supportKeys.all, "quick-actions"] as const,
};

// ── tickets list (lazy / infinite) + count ──────────────────────────────────

/**
 * Lazy-loads tickets page by page as the agent scrolls. Pagination is driven by
 * the backend's `hasMore` (from Freshdesk's link header), not blind increments.
 */
export function useInfiniteTickets() {
  return useInfiniteQuery({
    queryKey: supportKeys.tickets(),
    queryFn: ({ pageParam }) =>
      apiGet<TicketPage>(`/api/support/tickets?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    // Cache the list + already-loaded pages so re-entering the Freshdesk page
    // (or reselecting tickets) is instant. Mutations invalidate this key.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

/** Grand total ticket count for the sidebar header. */
export function useTicketCount() {
  return useQuery({
    queryKey: supportKeys.count(),
    queryFn: () => apiGet<{ total: number }>("/api/support/tickets/count"),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

// ── single ticket ────────────────────────────────────────────────────────────

export function useTicket(id: number | null) {
  return useQuery({
    queryKey: id === null ? supportKeys.all : supportKeys.ticket(id),
    queryFn: () => apiGet<TicketDetail>(`/api/support/tickets/${id}`),
    enabled: id !== null,
    // Keep opened tickets warm so flipping between them doesn't refetch each
    // time; reply/note/status mutations invalidate the specific ticket.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

// ── reply / note ──────────────────────────────────────────────────────────

export function useReplyToTicket(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiSend<TicketConversation>("POST", `/api/support/tickets/${id}/reply`, {
        body,
        confirm: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(id) });
      qc.invalidateQueries({ queryKey: supportKeys.tickets() });
    },
  });
}

export function useAddTicketNote(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiSend<TicketConversation>("POST", `/api/support/tickets/${id}/notes`, {
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(id) });
    },
  });
}

// ── status changes ──────────────────────────────────────────────────────────

function invalidateTicketViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: supportKeys.tickets() });
  qc.invalidateQueries({ queryKey: supportKeys.count() });
}

export function useUpdateTicketStatus(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: StatusOption) =>
      apiSend<TicketSummary>("PUT", `/api/support/tickets/${id}/status`, {
        status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(id) });
      invalidateTicketViews(qc);
    },
  });
}

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { ids: number[]; status: StatusOption }) =>
      apiSend<BulkStatusResult>("POST", "/api/support/tickets/bulk-status", vars),
    onSuccess: () => invalidateTicketViews(qc),
  });
}

// ── canned responses (our DB, per-agent) ─────────────────────────────────────

export function useCannedResponses() {
  return useQuery({
    queryKey: supportKeys.canned(),
    queryFn: () => apiGet<CannedResponse[]>("/api/support/canned"),
    // Templates change rarely; cache them so the picker opens instantly.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useCreateCanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { title: string; body: string }) =>
      apiSend<CannedResponse>("POST", "/api/support/canned", vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.canned() }),
  });
}

export function useUpdateCanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; title: string; body: string }) =>
      apiSend<CannedResponse>("PUT", `/api/support/canned/${vars.id}`, {
        title: vars.title,
        body: vars.body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.canned() }),
  });
}

export function useDeleteCanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend<{ ok: boolean }>("DELETE", `/api/support/canned/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.canned() }),
  });
}

// ── scenario automations (admin-defined in Freshdesk; list + run only) ────────

export function useScenarios() {
  return useQuery({
    queryKey: supportKeys.scenarios(),
    queryFn: () => apiGet<ScenarioSummary[]>("/api/support/scenarios"),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * Runs a scenario on a ticket. The backend also drops an internal note and logs
 * the action. Invalidates the ticket + list since the scenario can change status
 * and append a reply.
 */
export function useRunScenario(ticketId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { scenarioId: number; scenarioName: string }) =>
      apiSend<{ ok: boolean }>(
        "POST",
        `/api/support/tickets/${ticketId}/scenario`,
        vars,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: supportKeys.tickets() });
      qc.invalidateQueries({ queryKey: supportKeys.count() });
    },
  });
}

// ── quick actions (our replica of scenario automations) ──────────────────────

export function useQuickActions() {
  return useQuery({
    queryKey: supportKeys.quickActions(),
    queryFn: () => apiGet<QuickAction[]>("/api/support/quick-actions"),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
}

/**
 * Applies a quick action (property update + customer-facing reply) to one
 * ticket. Invalidates the ticket + list since status changes and a reply lands.
 */
export function useApplyQuickAction(ticketId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (actionKey: string) =>
      apiSend<{ ok: boolean; action: string }>(
        "POST",
        `/api/support/tickets/${ticketId}/quick-action`,
        { actionKey },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: supportKeys.tickets() });
      qc.invalidateQueries({ queryKey: supportKeys.count() });
    },
  });
}

/** Applies a quick action to many selected tickets; returns per-ticket results. */
export function useApplyQuickActionBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { ids: number[]; actionKey: string }) =>
      apiSend<QuickActionBulkResult>(
        "POST",
        "/api/support/tickets/quick-action-bulk",
        vars,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: supportKeys.tickets() });
      qc.invalidateQueries({ queryKey: supportKeys.count() });
    },
  });
}
