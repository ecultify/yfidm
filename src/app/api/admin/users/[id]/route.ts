import { NextResponse, type NextRequest } from "next/server";
import {
  AuthError,
  deleteUser,
  regenerateInvite,
  requireAdmin,
} from "@/lib/server/auth";
import { publicOrigin } from "@/lib/server/request-origin";

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
