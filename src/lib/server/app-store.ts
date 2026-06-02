import "server-only";

import type {
  Conversation,
  ConversationStatus,
  InternalNote,
} from "@/lib/types";
import crypto from "crypto";
import { execute, query, queryOne, toIso } from "./db";

/**
 * App-owned conversation state that Unipile does NOT store: status, assignee,
 * custom tags, internal notes, and read-state overrides.
 *
 * This is now backed by MySQL (see db/schema.sql), so the state is SHARED across
 * every logged-in user and survives restarts. The app polls, so when one agent
 * assigns / tags / resolves / reads a conversation, everyone else sees it within
 * the poll interval (near-realtime).
 *
 * Unipile remains the source of truth for messages / contacts / timestamps;
 * THIS store is the source of truth for workflow state. Reads merge the two via
 * {@link mergeConversation} / {@link mergeConversations}.
 */

export interface Actor {
  id: string;
  name: string;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

// ---- realtime pulse ----
//
// A single shared counter bumped whenever a Unipile webhook reports a new
// inbound message. Clients poll this cheap counter (DB only, never Unipile) and
// refetch conversations/messages from Unipile ONLY when it changes — so
// realtime updates are event-driven and don't burn the provider rate limit.

/** Increments the global inbox pulse. Best-effort; never throws. */
export async function bumpInboxPulse(): Promise<void> {
  try {
    await execute(
      `INSERT INTO inbox_pulse (k, rev) VALUES ('global', 1)
       ON DUPLICATE KEY UPDATE rev = rev + 1`,
    );
  } catch {
    /* best-effort */
  }
}

/** Reads the global inbox pulse revision (0 if unset / DB unavailable). */
export async function getInboxPulse(): Promise<number> {
  try {
    const row = await queryOne<{ rev: number }>(
      "SELECT rev FROM inbox_pulse WHERE k = 'global'",
    );
    return Number(row?.rev ?? 0);
  } catch {
    return 0;
  }
}

/**
 * A new inbound message reopens a conversation that had been resolved/snoozed:
 * it needs attention again. Only flips those "done" states — leaves open/pending
 * alone — and only when a state row already exists (untouched chats are already
 * effectively open). Best-effort; never throws.
 */
export async function reopenOnInbound(conversationId: string): Promise<void> {
  try {
    await execute(
      `UPDATE conversation_state SET status = 'open'
        WHERE conversation_id = ? AND status IN ('resolved','snoozed')`,
      [conversationId],
    );
  } catch {
    /* best-effort */
  }
}

// ---- mutations ----

export async function setStatus(
  id: string,
  status: ConversationStatus,
  actor?: Actor,
): Promise<void> {
  await execute(
    `INSERT INTO conversation_state (conversation_id, status, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), updated_by = VALUES(updated_by)`,
    [id, status, actor?.id ?? null],
  );
  await logActivity(id, actor, "status_change", status);
}

export async function setAssignee(
  id: string,
  assigneeId: string | null,
  actor?: Actor,
): Promise<void> {
  await execute(
    `INSERT INTO conversation_state (conversation_id, assignee_id, has_assignee, updated_by)
     VALUES (?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE assignee_id = VALUES(assignee_id), has_assignee = 1, updated_by = VALUES(updated_by)`,
    [id, assigneeId, actor?.id ?? null],
  );
  await logActivity(id, actor, "assign", assigneeId ?? "unassigned");
}

export async function addTag(id: string, tag: string, actor?: Actor): Promise<void> {
  await execute(
    `INSERT IGNORE INTO conversation_tags (conversation_id, tag, created_by)
     VALUES (?, ?, ?)`,
    [id, tag, actor?.id ?? null],
  );
  await logActivity(id, actor, "tag_add", tag);
}

export async function removeTag(id: string, tag: string, actor?: Actor): Promise<void> {
  await execute(
    "DELETE FROM conversation_tags WHERE conversation_id = ? AND tag = ?",
    [id, tag],
  );
  await logActivity(id, actor, "tag_remove", tag);
}

export async function setRead(id: string, read: boolean, actor?: Actor): Promise<void> {
  await execute(
    `INSERT INTO conversation_state (conversation_id, read_override, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE read_override = VALUES(read_override), updated_by = VALUES(updated_by)`,
    [id, read ? 1 : 0, actor?.id ?? null],
  );
}

// ---- notes ----

interface NoteRow {
  id: string;
  conversation_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export async function listNotes(id: string): Promise<InternalNote[]> {
  const rows = await query<NoteRow>(
    "SELECT * FROM notes WHERE conversation_id = ? ORDER BY created_at ASC",
    [id],
  );
  return rows.map((n) => ({
    id: n.id,
    conversationId: n.conversation_id,
    authorId: n.author_id ?? "",
    authorName: n.author_name,
    body: n.body,
    createdAt: toIso(n.created_at),
  }));
}

export async function addNote(
  id: string,
  body: string,
  author: Actor,
): Promise<InternalNote> {
  // A bare UUID is 36 chars and fits notes.id (VARCHAR). Do NOT prefix it —
  // "note-" + uuid is 41 chars and overflows a VARCHAR(40) column.
  const noteId = crypto.randomUUID();
  await execute(
    `INSERT INTO notes (id, conversation_id, author_id, author_name, body)
     VALUES (?, ?, ?, ?, ?)`,
    [noteId, id, author.id, author.name, body],
  );
  await logActivity(id, author, "note", body.slice(0, 120));
  const rows = await query<NoteRow>("SELECT * FROM notes WHERE id = ?", [noteId]);
  const n = rows[0];
  return {
    id: n.id,
    conversationId: n.conversation_id,
    authorId: n.author_id ?? "",
    authorName: n.author_name,
    body: n.body,
    createdAt: toIso(n.created_at),
  };
}

/** Returns the subset of the given ids that have at least one note. */
export async function conversationsWithNotes(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await query<{ conversation_id: string }>(
    `SELECT DISTINCT conversation_id FROM notes WHERE conversation_id IN (${placeholders(ids.length)})`,
    ids,
  );
  return new Set(rows.map((r) => r.conversation_id));
}

// ---- activity log ----

export async function logActivity(
  conversationId: string,
  actor: Actor | undefined,
  action: string,
  detail = "",
): Promise<void> {
  try {
    await execute(
      `INSERT INTO activity_log (conversation_id, actor_id, actor_name, action, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [conversationId, actor?.id ?? null, actor?.name ?? "", action, detail],
    );
  } catch {
    // Activity logging is best-effort; never fail the user's action over it.
  }
}

export interface ActivityEntry {
  id: number;
  actorId: string | null;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

interface ActivityRow {
  id: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  detail: string;
  created_at: string;
}

/** Recent activity for a conversation, newest first. */
export async function listActivity(
  id: string,
  limit = 40,
): Promise<ActivityEntry[]> {
  const rows = await query<ActivityRow>(
    `SELECT id, actor_id, actor_name, action, detail, created_at
       FROM activity_log WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    [id, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    detail: r.detail,
    createdAt: toIso(r.created_at),
  }));
}

export interface GlobalActivityEntry extends ActivityEntry {
  conversationId: string;
}

interface GlobalActivityRow extends ActivityRow {
  conversation_id: string;
}

/** Recent activity across ALL conversations (admin analytics), newest first. */
export async function listAllActivity(limit = 200): Promise<GlobalActivityEntry[]> {
  const rows = await query<GlobalActivityRow>(
    `SELECT id, conversation_id, actor_id, actor_name, action, detail, created_at
       FROM activity_log
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    detail: r.detail,
    createdAt: toIso(r.created_at),
  }));
}

// ---- merge (read path) ----

interface StateRow {
  conversation_id: string;
  status: ConversationStatus | null;
  assignee_id: string | null;
  has_assignee: number;
  read_override: number | null;
}

function applyState(
  base: Conversation,
  state: StateRow | undefined,
  tags: string[],
): Conversation {
  const allTags = Array.from(new Set([...base.tags, ...tags]));
  if (!state) return { ...base, tags: allTags };

  let unreadCount = base.unreadCount;
  if (state.read_override === 1) unreadCount = 0;
  else if (state.read_override === 0) unreadCount = Math.max(base.unreadCount, 1);

  return {
    ...base,
    status: state.status ?? base.status,
    assigneeId: state.has_assignee ? state.assignee_id : base.assigneeId,
    tags: allTags,
    unreadCount,
  };
}

/** Batch-merges app-owned state into many conversations with two queries. */
export async function mergeConversations(
  bases: Conversation[],
): Promise<Conversation[]> {
  if (bases.length === 0) return [];
  const ids = bases.map((b) => b.id);

  const [stateRows, tagRows] = await Promise.all([
    query<StateRow>(
      `SELECT conversation_id, status, assignee_id, has_assignee, read_override
         FROM conversation_state WHERE conversation_id IN (${placeholders(ids.length)})`,
      ids,
    ),
    query<{ conversation_id: string; tag: string }>(
      `SELECT conversation_id, tag FROM conversation_tags
        WHERE conversation_id IN (${placeholders(ids.length)})`,
      ids,
    ),
  ]);

  const stateById = new Map(stateRows.map((s) => [s.conversation_id, s]));
  const tagsById = new Map<string, string[]>();
  for (const t of tagRows) {
    const list = tagsById.get(t.conversation_id) ?? [];
    list.push(t.tag);
    tagsById.set(t.conversation_id, list);
  }

  return bases.map((base) =>
    applyState(base, stateById.get(base.id), tagsById.get(base.id) ?? []),
  );
}

/** Single-conversation merge (used by the single GET routes). */
export async function mergeConversation(base: Conversation): Promise<Conversation> {
  const [merged] = await mergeConversations([base]);
  return merged ?? base;
}
