import { NextResponse, type NextRequest } from "next/server";
import { linkedinAdapter } from "@/lib/services/adapters/linkedin-adapter";
import { conversationsWithNotes, mergeConversations } from "@/lib/server/app-store";
import { UnipileError } from "@/lib/server/unipile";
import { AuthError, requireUser } from "@/lib/server/auth";
import type { Conversation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Applies ConversationFilter semantics (passed as query params). `meId` is the
 * current user (for "Assigned to me"); `withNotes` is the prefetched set of
 * conversation ids that have at least one internal note.
 */
export function applyFilter(
  convs: Conversation[],
  params: URLSearchParams,
  meId: string,
  withNotes: Set<string>,
): Conversation[] {
  let out = convs;

  const status = params.get("status");
  if (status) out = out.filter((c) => c.status === status);

  if (params.get("unread") === "true") out = out.filter((c) => c.unreadCount > 0);

  if (params.get("assignedToMe") === "true")
    out = out.filter((c) => c.assigneeId === meId);

  if (params.has("assigneeId")) {
    const raw = params.get("assigneeId");
    const want = raw === "null" || raw === "" ? null : raw;
    out = out.filter((c) => c.assigneeId === want);
  }

  if (params.get("hasNotes") === "true") out = out.filter((c) => withNotes.has(c.id));

  const search = params.get("search")?.toLowerCase().trim();
  if (search) {
    out = out.filter(
      (c) =>
        c.contact.displayName.toLowerCase().includes(search) ||
        c.contact.handle.toLowerCase().includes(search) ||
        c.lastMessagePreview.toLowerCase().includes(search) ||
        c.tags.some((t) => t.toLowerCase().includes(search)),
    );
  }

  return out;
}

export function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof UnipileError) {
    return NextResponse.json(
      { error: `Unipile error: ${e.body || e.message}` },
      { status: e.status },
    );
  }
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();

    // LinkedIn realness is gated server-side by INBOX_LINKEDIN_SOURCE. When it's
    // not 'real', serve no LinkedIn conversations (mock IG/FB still render).
    if (process.env.INBOX_LINKEDIN_SOURCE !== "real") {
      return NextResponse.json([]);
    }

    // Contacts hydrate lazily on the client (cached-only here) to stay within
    // LinkedIn rate limits on a cold load.
    const base = await linkedinAdapter.fetchConversations();
    const merged = await mergeConversations(base);
    const withNotes = await conversationsWithNotes(merged.map((c) => c.id));
    return NextResponse.json(
      applyFilter(merged, req.nextUrl.searchParams, me.id, withNotes),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
