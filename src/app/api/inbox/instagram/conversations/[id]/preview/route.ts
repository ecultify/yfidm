import { NextResponse, type NextRequest } from "next/server";
import { instagramAdapter } from "@/lib/services/adapters/instagram-adapter";
import { mockInstagramMessages } from "@/lib/server/instagram-mock";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../../../conversations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand last-message preview for a single Instagram row, fetched lazily by
 * the client as the row scrolls into view (IntersectionObserver). The IG chat
 * list carries no message snippet, so this fetches only the latest message
 * (limit=1) — no N+1 storm on cold load. Unlike LinkedIn the contact name is
 * already known from the list, so only the preview is returned.
 *
 * `?sig=` is the row's known last-activity timestamp, used to key the preview
 * cache so it auto-refreshes when a newer message arrives.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  try {
    await requireUser();
    if (process.env.INBOX_INSTAGRAM_SOURCE !== "real") {
      const messages = mockInstagramMessages(id);
      const last = messages[messages.length - 1];
      const text = (last?.body ?? "").trim();
      const lastMessagePreview = text
        ? last.direction === "outbound"
          ? `You: ${text}`
          : text
        : "";
      return NextResponse.json({ lastMessagePreview });
    }

    const data = await instagramAdapter.fetchRowData(id, sig);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
