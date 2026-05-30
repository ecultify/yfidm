import { NextResponse, type NextRequest } from "next/server";
import { listAllActivity } from "@/lib/server/app-store";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the global activity feed for admin analytics (admin only). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 200, 500);
    return NextResponse.json(await listAllActivity(limit));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
