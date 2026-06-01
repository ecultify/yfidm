import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import {
  FreshdeskError,
  statusCodeFromLabel,
  updateTicketStatus,
} from "@/lib/server/freshdesk";
import { logTicketActivity } from "@/lib/server/support-log";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PUT /api/support/tickets/{id}/status - change a single ticket's status.
 * Body: { "status": "Open" | "Pending" | "Resolved" | "Closed" }. The label is
 * mapped to Freshdesk's numeric code server-side; the client never sends raw
 * integers. Moving to Resolved/Closed can trip Freshdesk required-field
 * validation (400) — we name the missing fields. 403 means the agent can't
 * access this ticket.
 */
export async function PUT(
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

    const { status } = (await req.json()) as { status?: string };
    if (!status || !status.trim()) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }
    const code = statusCodeFromLabel(status);
    if (code === null) {
      return NextResponse.json(
        { error: `Unknown status "${status}". Use Open, Pending, Resolved, or Closed.` },
        { status: 400 },
      );
    }

    try {
      const ticket = await updateTicketStatus(numericId, code);
      await logTicketActivity(me, numericId, "status_change", status);
      return NextResponse.json(ticket);
    } catch (e) {
      // Freshdesk rejects Resolved/Closed when required fields are unset: turn
      // its errors[] into a specific, actionable message.
      if (e instanceof FreshdeskError && e.status === 400 && e.fields.length) {
        const missing = e.fields
          .map((f) => f.field)
          .filter(Boolean)
          .join(", ");
        return NextResponse.json(
          {
            error: missing
              ? `Can't set status to ${status}: required field(s) not set — ${missing}.`
              : e.message,
            fields: e.fields,
          },
          { status: 400 },
        );
      }
      if (e instanceof FreshdeskError && e.status === 403) {
        return NextResponse.json(
          { error: "Access denied: your agent scope doesn't allow changing this ticket." },
          { status: 403 },
        );
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
