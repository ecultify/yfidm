import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { replyToTicket } from "@/lib/server/freshdesk";
import { logTicketActivity, snippet } from "@/lib/server/support-log";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/support/tickets/{id}/reply - sends a CUSTOMER-FACING email to the
 * requester. This is a real, irreversible outbound side effect, so it is gated
 * two ways to prevent accidental sends:
 *   1. an authenticated user is required, and
 *   2. the request must carry an explicit `confirm: true`.
 *
 * Body: { "body": "<html>", "confirm": true }
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

    const { body, confirm } = (await req.json()) as {
      body?: string;
      confirm?: boolean;
    };

    if (confirm !== true) {
      return NextResponse.json(
        {
          error:
            "Sending a reply emails the requester. Resend with confirm: true to proceed.",
        },
        { status: 400 },
      );
    }
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const reply = await replyToTicket(numericId, body);
    await logTicketActivity(me, numericId, "reply", snippet(body));
    return NextResponse.json(reply, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
