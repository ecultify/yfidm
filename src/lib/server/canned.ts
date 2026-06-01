import "server-only";

import crypto from "crypto";
import { execute, query, queryOne, toIso } from "./db";

/**
 * Canned responses (reply templates) for the Freshdesk support desk, stored in
 * OUR database rather than Freshdesk. Freshdesk's v2 canned-response endpoints
 * can't reliably list saved responses and have folder-ID bugs, so they're
 * unusable as the source of truth.
 *
 * SERVER ONLY. Templates are scoped per agent (owner_id), matching the app's
 * auth model: each agent manages their own. Every function takes the owner id
 * and scopes its SQL to it, so one agent can't read or mutate another's.
 */

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface CannedRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function toCanned(r: CannedRow): CannedResponse {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

/** Lists the agent's own templates, most recently updated first. */
export async function listCanned(ownerId: string): Promise<CannedResponse[]> {
  const rows = await query<CannedRow>(
    `SELECT id, title, body, created_at, updated_at
       FROM canned_responses WHERE owner_id = ?
      ORDER BY updated_at DESC`,
    [ownerId],
  );
  return rows.map(toCanned);
}

/** Creates a template owned by the agent. */
export async function createCanned(
  ownerId: string,
  title: string,
  body: string,
): Promise<CannedResponse> {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO canned_responses (id, owner_id, title, body)
     VALUES (?, ?, ?, ?)`,
    [id, ownerId, title.trim(), body],
  );
  const row = await queryOne<CannedRow>(
    "SELECT id, title, body, created_at, updated_at FROM canned_responses WHERE id = ?",
    [id],
  );
  // Null here means the write didn't land (e.g. MySQL not running in local dev,
  // where the DB layer degrades to no-ops). Surface a clear, actionable error
  // instead of a null-deref 500.
  if (!row) {
    throw new Error(
      "Could not save the template. The database is unavailable — canned responses require MySQL.",
    );
  }
  return toCanned(row);
}

/**
 * Updates one of the agent's templates. Returns null if it doesn't exist or
 * isn't owned by this agent (so the route can return 404 rather than touch
 * someone else's row).
 */
export async function updateCanned(
  ownerId: string,
  id: string,
  title: string,
  body: string,
): Promise<CannedResponse | null> {
  const affected = await execute(
    `UPDATE canned_responses SET title = ?, body = ?
      WHERE id = ? AND owner_id = ?`,
    [title.trim(), body, id, ownerId],
  );
  if (affected === 0) {
    // Either missing or not owned by this agent. Confirm which for the caller.
    const exists = await queryOne<{ id: string }>(
      "SELECT id FROM canned_responses WHERE id = ? AND owner_id = ?",
      [id, ownerId],
    );
    if (!exists) return null;
  }
  const row = await queryOne<CannedRow>(
    "SELECT id, title, body, created_at, updated_at FROM canned_responses WHERE id = ? AND owner_id = ?",
    [id, ownerId],
  );
  return row ? toCanned(row) : null;
}

/** Deletes one of the agent's templates. Returns true if a row was removed. */
export async function deleteCanned(ownerId: string, id: string): Promise<boolean> {
  const affected = await execute(
    "DELETE FROM canned_responses WHERE id = ? AND owner_id = ?",
    [id, ownerId],
  );
  return affected > 0;
}
