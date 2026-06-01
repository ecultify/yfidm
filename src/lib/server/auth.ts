import "server-only";

import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, execute, toIso } from "./db";
import type { ManagedUser, SessionUser, UserRole } from "@/lib/auth/types";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export { SESSION_COOKIE };
const SESSION_TTL_DAYS = 30;
const INVITE_TTL_DAYS = 7;
const BCRYPT_COST = 12;

// ---- password hashing ----

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  // MySQL DATETIME format (UTC).
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// ---- DB row shapes ----

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  avatar_url: string;
  status: "invited" | "active" | "disabled";
  created_at: string;
}

function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatar_url,
  };
}

function toManagedUser(u: UserRow): ManagedUser {
  return {
    ...toSessionUser(u),
    status: u.status,
    createdAt: toIso(u.created_at),
  };
}

// ---- dev-only auth bypass (localhost testing) ----

/**
 * When DISABLE_AUTH=true, the login gate is skipped and every request is
 * treated as a built-in admin "Dev User". HARD-GATED to non-production so a
 * stray flag can never open the app up on a real deploy (Hostinger runs with
 * NODE_ENV=production). The proxy mirrors this same check. Remove the env var
 * to restore normal login.
 */
export const AUTH_DISABLED =
  process.env.DISABLE_AUTH === "true" && process.env.NODE_ENV !== "production";

const DEV_USER: SessionUser = {
  id: "dev-user",
  name: "Dev User",
  email: "dev@localhost",
  role: "admin",
  avatarUrl: "",
};

// ---- sessions ----

/** Creates a session row and sets the HTTP-only cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  await execute(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, userId, daysFromNow(SESSION_TTL_DAYS)],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

/** Reads + validates the session cookie, returning the active user or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (AUTH_DISABLED) return DEV_USER;

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<UserRow>(
    `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()
        AND u.status = 'active'
      LIMIT 1`,
    [token],
  );
  return row ? toSessionUser(row) : null;
}

/** Clears the current session (DB row + cookie). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await execute("DELETE FROM sessions WHERE token = ?", [token]);
  jar.delete(SESSION_COOKIE);
}

// ---- login ----

/** Verifies credentials; on success creates a session. Returns the user or null. */
export async function login(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const row = await queryOne<UserRow>(
    "SELECT * FROM users WHERE email = ? AND status = 'active' LIMIT 1",
    [email.trim().toLowerCase()],
  );
  if (!row?.password_hash) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  await createSession(row.id);
  return toSessionUser(row);
}

// ---- guards (for route handlers) ----

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Returns the logged-in user or throws AuthError(401). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Not authenticated");
  return user;
}

/** Returns the logged-in admin or throws AuthError(401/403). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError(403, "Admin only");
  return user;
}

// ---- password change / invite acceptance ----

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const row = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
  if (!row?.password_hash) return false;
  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) return false;
  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [
    await hashPassword(newPassword),
    userId,
  ]);
  return true;
}

export interface InviteInfo {
  token: string;
  name: string;
  email: string;
}

/** Returns invite details if the token is valid + unused, else null. */
export async function getInvite(token: string): Promise<InviteInfo | null> {
  const row = await queryOne<{ token: string; name: string; email: string }>(
    `SELECT i.token, u.name, u.email FROM invites i
       JOIN users u ON u.id = i.user_id
      WHERE i.token = ? AND i.accepted_at IS NULL
        AND i.expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [token],
  );
  return row ?? null;
}

/** Sets the password for an invited user and activates the account. */
export async function acceptInvite(
  token: string,
  password: string,
): Promise<boolean> {
  const invite = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM invites
      WHERE token = ? AND accepted_at IS NULL AND expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [token],
  );
  if (!invite) return false;
  await execute(
    "UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?",
    [await hashPassword(password), invite.user_id],
  );
  await execute("UPDATE invites SET accepted_at = UTC_TIMESTAMP() WHERE token = ?", [
    token,
  ]);
  return true;
}

// ---- admin user management ----

export async function listUsers(): Promise<ManagedUser[]> {
  const rows = await query<UserRow>(
    "SELECT * FROM users ORDER BY created_at ASC",
  );
  return rows.map(toManagedUser);
}

/**
 * Creates an 'invited' user and a fresh invite token. Returns the user plus the
 * invite token (the caller turns it into a full /invite/<token> URL).
 */
export async function createInvitedUser(opts: {
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  createdBy: string;
}): Promise<{ user: ManagedUser; inviteToken: string }> {
  const email = opts.email.trim().toLowerCase();
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE email = ?",
    [email],
  );
  if (existing) throw new AuthError(409, "A user with that email already exists");

  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, name, email, role, avatar_url, status)
     VALUES (?, ?, ?, ?, ?, 'invited')`,
    [id, opts.name.trim(), email, opts.role, opts.avatarUrl],
  );

  const inviteToken = randomToken();
  await execute(
    "INSERT INTO invites (token, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)",
    [inviteToken, id, opts.createdBy, daysFromNow(INVITE_TTL_DAYS)],
  );

  const row = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return { user: toManagedUser(row as UserRow), inviteToken };
}

/** Regenerates an invite link for an existing (still-invited) user. */
export async function regenerateInvite(
  userId: string,
  createdBy: string,
): Promise<string> {
  const inviteToken = randomToken();
  await execute(
    "INSERT INTO invites (token, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)",
    [inviteToken, userId, createdBy, daysFromNow(INVITE_TTL_DAYS)],
  );
  return inviteToken;
}

export async function deleteUser(userId: string): Promise<void> {
  await execute("DELETE FROM users WHERE id = ?", [userId]);
}

/** A readable one-off password for an admin to share with a user (12 chars). */
export function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/**
 * Admin-initiated password reset: sets a fresh random password (and activates
 * the account if it was still 'invited') and returns the plaintext ONCE so the
 * admin can hand it over. The plaintext is never stored. Returns null if the
 * user doesn't exist.
 */
export async function adminResetPassword(
  userId: string,
): Promise<{ user: ManagedUser; password: string } | null> {
  const row = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
  if (!row) return null;
  const password = generatePassword();
  await execute(
    "UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?",
    [await hashPassword(password), userId],
  );
  const updated = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [
    userId,
  ]);
  return { user: toManagedUser(updated as UserRow), password };
}

/** Changes a user's role (agent <-> admin). Returns the updated user, or null. */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<ManagedUser | null> {
  await execute("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  const updated = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [
    userId,
  ]);
  return updated ? toManagedUser(updated) : null;
}
