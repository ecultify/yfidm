import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { addNote } from "@/lib/server/freshdesk";
import { logTicketActivity, snippet } from "@/lib/server/support-log";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/support/tickets/{id}/notes - adds a PRIVATE internal note. Never
 * sent to the requester, so (unlike /reply) it needs no send confirmation.
 * Kept on a separate route from /reply so the two can never be confused.
 *
 * Body: { "body": "<html>" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const numericId = ticketId(id);
    if (numericId === null) {
      return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
    }

    const { body } = (await req.json()) as { body?: string };
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const note = await addNote(numericId, body);
    await logTicketActivity(me, numericId, "note", snippet(body));
    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
