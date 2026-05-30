import { NextResponse, type NextRequest } from "next/server";
import { instagramAdapter } from "@/lib/services/adapters/instagram-adapter";
import { mockInstagramMessages } from "@/lib/server/instagram-mock";
import { logActivity } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../../../conversations/route";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isReal(): boolean {
  return process.env.INBOX_INSTAGRAM_SOURCE === "real";
}

/** GET the Instagram message thread for a conversation. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const messages = isReal()
      ? await instagramAdapter.fetchMessages(id)
      : mockInstagramMessages(id);
    return NextResponse.json(messages);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST a reply to an Instagram conversation via Unipile.
 *
 * Meta's 24h Customer Service Window is enforced upstream: a send outside the
 * window comes back as a non-2xx and surfaces here as a clean { error, status }
 * (the client marks the optimistic bubble 'failed' and toasts). The composer
 * also pre-disables send when the window is closed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const { text } = (await req.json()) as { text?: string };
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    await logActivity(id, { id: me.id, name: me.name }, "reply", text.slice(0, 120));

    if (!isReal()) {
      // Mock mode: echo back an optimistic outbound message (not persisted).
      const message: Message = {
        id: `instagram-mock-out-${Date.now()}`,
        conversationId: id,
        channel: "instagram",
        direction: "outbound",
        body: text,
        sentAt: new Date().toISOString(),
        deliveryStatus: "sent",
        authorType: "agent",
        authorName: "SBI YFI (Instagram)",
      };
      return NextResponse.json(message);
    }

    const message = await instagramAdapter.sendMessage(id, text);
    return NextResponse.json(message);
  } catch (e) {
    return errorResponse(e);
  }
}
