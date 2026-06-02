import { NextResponse } from "next/server";
import { getInboxPulse } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../conversations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/pulse - the global inbox revision counter. Cheap (one DB read,
 * no Unipile). Browsers poll this every few seconds; when `rev` increases (an
 * inbound-message webhook fired) they refetch conversations/messages. This keeps
 * the inbox near-realtime without polling the provider on a timer.
 */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ rev: await getInboxPulse() });
  } catch (e) {
    return errorResponse(e);
  }
}
