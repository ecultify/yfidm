import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getConversations } from "@/lib/server/freshdesk";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * GET /api/support/tickets/{id}/conversations - the full, paginated thread
 * (used when a ticket has more than the 10 messages the embedded include
 * returns). Paging is driven by Freshdesk's `link` header in the service layer.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const numericId = ticketId(id);
    if (numericId === null) {
      return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
    }
    return NextResponse.json(await getConversations(numericId));
  } catch (e) {
    return errorResponse(e);
  }
}
