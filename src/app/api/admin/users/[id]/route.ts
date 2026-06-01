import { NextResponse, type NextRequest } from "next/server";
import {
  adminResetPassword,
  AuthError,
  deleteUser,
  regenerateInvite,
  requireAdmin,
  setUserRole,
} from "@/lib/server/auth";
import { logAdminAudit } from "@/lib/server/support-log";
import { publicOrigin } from "@/lib/server/request-origin";
import type { UserRole } from "@/lib/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** DELETE - remove a user (admin only). Admins cannot delete themselves. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (id === admin.id) {
      return NextResponse.json(
        { error: "You can't delete your own account" },
        { status: 400 },
      );
    }
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

/** POST - regenerate an invite link for a still-pending user (admin only). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const token = await regenerateInvite(id, admin.id);
    const inviteUrl = `${publicOrigin(req)}/invite/${token}`;
    return NextResponse.json({ inviteUrl });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PATCH - admin actions on a team member (admin only):
 *   { "resetPassword": true }        -> sets + returns a new password (once)
 *   { "role": "admin" | "agent" }    -> changes the user's role
 * Both are recorded in admin_audit. Admins can't change their own role (so they
 * can't accidentally lock themselves out of admin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await req.json()) as {
      resetPassword?: boolean;
      role?: UserRole;
    };

    if (body.resetPassword) {
      const result = await adminResetPassword(id);
      if (!result) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      await logAdminAudit(
        { id: admin.id, name: admin.name },
        { id: result.user.id, email: result.user.email },
        "password_reset",
        `Reset password for ${result.user.name}`,
      );
      // The plaintext is returned ONCE here for the admin to share; never stored.
      return NextResponse.json({ user: result.user, password: result.password });
    }

    if (body.role === "admin" || body.role === "agent") {
      if (id === admin.id) {
        return NextResponse.json(
          { error: "You can't change your own role." },
          { status: 400 },
        );
      }
      const updated = await setUserRole(id, body.role);
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      await logAdminAudit(
        { id: admin.id, name: admin.name },
        { id: updated.id, email: updated.email },
        "role_change",
        `Set role to ${body.role}`,
      );
      return NextResponse.json(updated);
    }

    return NextResponse.json(
      { error: "Nothing to update. Send resetPassword or role." },
      { status: 400 },
    );
  } catch (e) {
    return handleError(e);
  }
}
