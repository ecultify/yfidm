import { NextResponse, type NextRequest } from "next/server";
import {
  AuthError,
  createInvitedUser,
  listUsers,
  requireAdmin,
} from "@/lib/server/auth";
import { avatarForPreset } from "@/lib/avatars";
import type { UserRole } from "@/lib/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inviteUrl(req: NextRequest, token: string): string {
  return new URL(`/invite/${token}`, req.nextUrl.origin).toString();
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** GET — list the team (admin only). */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listUsers());
  } catch (e) {
    return handleError(e);
  }
}

/** POST — create an invited user and return the invite link (admin only). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { name, email, role, avatar } = (await req.json()) as {
      name?: string;
      email?: string;
      role?: UserRole;
      avatar?: string; // 'male' | 'female'
    };
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }
    const { user, inviteToken } = await createInvitedUser({
      name,
      email,
      role: role === "admin" ? "admin" : "agent",
      avatarUrl: avatarForPreset(avatar),
      createdBy: admin.id,
    });
    return NextResponse.json({ ...user, inviteUrl: inviteUrl(req, inviteToken) });
  } catch (e) {
    return handleError(e);
  }
}
