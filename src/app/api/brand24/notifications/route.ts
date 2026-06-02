import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireUser } from "@/lib/server/auth";
import { listBrand24Notifications } from "@/lib/server/brand24";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists Brand24 alerts captured from Slack (see /api/slack/events), newest
 * first. The Brand24 page polls this so new mentions "pop up" shortly after
 * Brand24 posts them. Optional `?limit=` and `?sinceId=` query params.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const params = req.nextUrl.searchParams;
    const limit = Number(params.get("limit")) || undefined;
    const sinceId = Number(params.get("sinceId")) || undefined;

    const items = await listBrand24Notifications({ limit, sinceId });
    return NextResponse.json(items);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
