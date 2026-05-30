import { NextResponse, type NextRequest } from "next/server";
import { linkedinAdapter } from "@/lib/services/adapters/linkedin-adapter";
import { logActivity } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the LinkedIn message thread for a conversation. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const messages = await linkedinAdapter.fetchMessages(id);
    return NextResponse.json(messages);
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST a reply to a LinkedIn conversation via Unipile. */
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
    const message = await linkedinAdapter.sendMessage(id, text);
    // Record who replied (visible to the whole team via the activity log).
    await logActivity(id, { id: me.id, name: me.name }, "reply", text.slice(0, 120));
    return NextResponse.json(message);
  } catch (e) {
    return errorResponse(e);
  }
}
