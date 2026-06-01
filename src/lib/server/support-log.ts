import "server-only";

import { execute, query, toIso } from "./db";

/**
 * Audit logging for the Freshdesk support desk and for sensitive admin actions.
 *
 * SERVER ONLY. Writes are best-effort: logging must never break the user's
 * actual action (sending a reply, changing a role), so every write is wrapped
 * and swallows errors. When MySQL is unavailable in local dev the DB layer
 * already no-ops, so these simply record nothing locally.
 */

export interface Actor {
  id: string;
  name: string;
}

export type TicketAction =
  | "viewed"
  | "reply"
  | "note"
  | "status_change"
  | "bulk_status"
  | "scenario"
  | "quick_action";

/** Strips HTML tags + collapses whitespace, then clamps, for storing snippets. */
export function snippet(html: string, max = 280): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Records a support-desk action. Best-effort; never throws. */
export async function logTicketActivity(
  actor: Actor | undefined,
  ticketId: number,
  action: TicketAction,
  detail = "",
): Promise<void> {
  try {
    await execute(
      `INSERT INTO support_ticket_activity (actor_id, actor_name, ticket_id, action, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [actor?.id ?? null, actor?.name ?? "", ticketId, action, detail],
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Logs a 'viewed' event, but only once per (agent, ticket) per 10 minutes, so
 * React Query refetches / cache invalidations don't flood the trail with
 * duplicate opens. Best-effort; never throws.
 */
export async function logTicketViewOnce(
  actor: Actor | undefined,
  ticketId: number,
): Promise<void> {
  try {
    const recent = await query<{ id: number }>(
      `SELECT id FROM support_ticket_activity
        WHERE actor_id = ? AND ticket_id = ? AND action = 'viewed'
          AND created_at > (UTC_TIMESTAMP() - INTERVAL 10 MINUTE)
        LIMIT 1`,
      [actor?.id ?? "", ticketId],
    );
    if (recent.length) return;
    await logTicketActivity(actor, ticketId, "viewed");
  } catch {
    /* best-effort */
  }
}

export type AdminAction = "password_reset" | "role_change" | "status_change";

/** Records a sensitive admin action against a target user. Best-effort. */
export async function logAdminAudit(
  actor: Actor | undefined,
  target: { id: string; email: string },
  action: AdminAction,
  detail = "",
): Promise<void> {
  try {
    await execute(
      `INSERT INTO admin_audit (actor_id, actor_name, target_user_id, target_email, action, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actor?.id ?? null, actor?.name ?? "", target.id, target.email, action, detail],
    );
  } catch {
    /* best-effort */
  }
}

// ── reads (for analytics) ────────────────────────────────────────────────────

export interface TicketActivityEntry {
  id: number;
  actorId: string | null;
  actorName: string;
  ticketId: number;
  action: TicketAction;
  detail: string;
  createdAt: string;
}

interface TicketActivityRow {
  id: number;
  actor_id: string | null;
  actor_name: string;
  ticket_id: number;
  action: TicketAction;
  detail: string | null;
  created_at: string;
}

/** Recent support-desk activity across all tickets, newest first. */
export async function listTicketActivity(
  limit = 200,
): Promise<TicketActivityEntry[]> {
  const rows = await query<TicketActivityRow>(
    `SELECT id, actor_id, actor_name, ticket_id, action, detail, created_at
       FROM support_ticket_activity
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    ticketId: r.ticket_id,
    action: r.action,
    detail: r.detail ?? "",
    createdAt: toIso(r.created_at),
  }));
}
