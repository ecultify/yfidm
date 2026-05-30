import { NextResponse, type NextRequest } from "next/server";
import { instagramAdapter } from "@/lib/services/adapters/instagram-adapter";
import { mockInstagramConversation } from "@/lib/server/instagram-mock";
import { mergeConversation } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../../conversations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET a single merged Instagram conversation (thread header / contact panel).
 *
 * NOTE: there is intentionally no PATCH here. App-owned workflow state
 * (status / assignee / tags / read) is channel-agnostic and is written through
 * the existing /api/inbox/conversations/[id] PATCH route, which only touches the
 * shared app-store. Instagram reuses it as-is.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const base =
      process.env.INBOX_INSTAGRAM_SOURCE === "real"
        ? await instagramAdapter.fetchConversation(id)
        : mockInstagramConversation(id);
    if (!base) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(await mergeConversation(base));
  } catch (e) {
    return errorResponse(e);
  }
}
