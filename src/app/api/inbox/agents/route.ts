import { NextResponse } from "next/server";
import { listUsers, requireUser, AuthError } from "@/lib/server/auth";
import type { Agent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET the team roster (real users from the database). Used for assignment
 * dropdowns and avatars. Only ACTIVE users are assignable.
 */
export async function GET() {
  try {
    await requireUser();
    const agents: Agent[] = (await listUsers())
      .filter((u) => u.status === "active")
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
      }));
    return NextResponse.json(agents);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
