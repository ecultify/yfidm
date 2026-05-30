/** Client-safe auth types (no server-only imports). */

export type UserRole = "admin" | "agent";

export type UserStatus = "invited" | "active" | "disabled";

/** The currently authenticated user, as exposed to the client via /api/auth/me. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
}

/** A user row as shown in the admin "team" management screen. */
export interface ManagedUser extends SessionUser {
  status: UserStatus;
  createdAt: string;
  /** Present right after an admin creates a user: the link to send them. */
  inviteUrl?: string;
}
