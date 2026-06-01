import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getTicket } from "@/lib/server/freshdesk";
import { logTicketViewOnce } from "@/lib/server/support-log";
import { errorResponse } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parses a numeric ticket id from the route segment, or null if invalid. */
function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * GET /api/support/tickets/{id} - a single ticket with the requester and the
 * embedded conversation thread (up to 10 messages). For longer threads the
 * client follows up with /tickets/{id}/conversations.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const numericId = ticketId(id);
    if (numericId === null) {
      return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
    }
    const ticket = await getTicket(numericId, {
      conversations: true,
      requester: true,
    });
    await logTicketViewOnce(me, numericId);
    return NextResponse.json(ticket);
  } catch (e) {
    return errorResponse(e);
  }
}
