import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireUser } from "@/lib/server/auth";
import { listBrand24Notifications } from "@/lib/server/brand24";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists Brand24 alerts captured from Slack (see /api/slack/events), newest
 * first by real post time. Returns one page: `{ items, total, page, pageSize }`.
 * The Brand24 page polls this so new mentions "pop up" shortly after Brand24
 * posts them. Optional `?page=` and `?pageSize=` query params.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const params = req.nextUrl.searchParams;
    const page = Number(params.get("page")) || undefined;
    const pageSize = Number(params.get("pageSize")) || undefined;
    const q = params.get("q") || undefined;

    const result = await listBrand24Notifications({ page, pageSize, q });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
