import { NextResponse, type NextRequest } from "next/server";
import { instagramAdapter } from "@/lib/services/adapters/instagram-adapter";
import { mockInstagramConversations } from "@/lib/server/instagram-mock";
import { conversationsWithNotes, mergeConversations } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { applyFilter, errorResponse } from "../../conversations/route";
import type { Conversation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the Instagram channel is wired to the live Unipile API. */
function isReal(): boolean {
  return process.env.INBOX_INSTAGRAM_SOURCE === "real";
}

/**
 * GET Instagram conversations (one page). Supports cursor-based paging via
 * `?cursor=` / `?limit=`; the next-page cursor is returned in the
 * `x-next-cursor` header (the body stays a plain Conversation[]).
 *
 * App-owned state (status / assignee / tags / read) is merged from MySQL, then
 * the ConversationFilter query params are applied — the same pipeline LinkedIn
 * uses, so IG honours All / Unread / Assigned-to-me / Has-notes.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  try {
    const me = await requireUser();

    let base: Conversation[];
    let nextCursor: string | null = null;

    if (isReal()) {
      const limit = Number(params.get("limit")) || 30;
      const cursor = params.get("cursor") ?? undefined;
      const page = await instagramAdapter.fetchConversationsPage({ limit, cursor });
      base = page.conversations;
      nextCursor = page.cursor;
    } else {
      base = mockInstagramConversations();
    }

    const merged = await mergeConversations(base);
    const withNotes = await conversationsWithNotes(merged.map((c) => c.id));
    const res = NextResponse.json(applyFilter(merged, params, me.id, withNotes));
    if (nextCursor) res.headers.set("x-next-cursor", nextCursor);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
