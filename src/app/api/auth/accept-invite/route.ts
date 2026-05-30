import { NextResponse, type NextRequest } from "next/server";
import { acceptInvite, getInvite } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?token= - validates an invite token and returns the invitee's name/email. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const invite = await getInvite(token);
  if (!invite) {
    return NextResponse.json(
      { error: "This invite link is invalid or has expired" },
      { status: 404 },
    );
  }
  return NextResponse.json({ name: invite.name, email: invite.email });
}

/** POST { token, password } - sets the password and activates the account. */
export async function POST(req: NextRequest) {
  const { token, password } = (await req.json()) as {
    token?: string;
    password?: string;
  };
  if (!token || !password) {
    return NextResponse.json(
      { error: "Token and password are required" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }
  const ok = await acceptInvite(token, password);
  if (!ok) {
    return NextResponse.json(
      { error: "This invite link is invalid or has expired" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
