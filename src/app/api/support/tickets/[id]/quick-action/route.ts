import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { FreshdeskError } from "@/lib/server/freshdesk";
import { applyQuickAction, QuickActionError } from "@/lib/server/quick-actions";
import { logTicketActivity } from "@/lib/server/support-log";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/support/tickets/{id}/quick-action - run a predefined quick action
 * on one ticket: a property update (status/priority) then a customer-facing
 * reply with fixed wording. Body: { "actionKey": string }.
 *
 * This sends a real email to the requester — the UI gates it behind a confirm.
 * On failure we report exactly which step broke (property vs reply); a Closed
 * move can trip 400 required-field validation (we name the fields), and 403 is
 * surfaced as an access/scope error.
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

    const { actionKey } = (await req.json()) as { actionKey?: string };
    if (!actionKey?.trim()) {
      return NextResponse.json({ error: "actionKey is required" }, { status: 400 });
    }

    try {
      const { action } = await applyQuickAction(numericId, actionKey, me.name);
      await logTicketActivity(me, numericId, "quick_action", action);
      return NextResponse.json({ ok: true, action });
    } catch (e) {
      if (e instanceof QuickActionError) {
        const where =
          e.step === "property" ? "updating the ticket" : "sending the reply";
        const c = e.cause;
        if (c instanceof FreshdeskError) {
          if (c.status === 400 && c.fields.length) {
            const missing = c.fields.map((f) => f.field).filter(Boolean).join(", ");
            return NextResponse.json(
              {
                error: missing
                  ? `Couldn't finish: while ${where}, required field(s) not set — ${missing}.`
                  : `Couldn't finish while ${where}: ${c.message}`,
                step: e.step,
                fields: c.fields,
              },
              { status: 400 },
            );
          }
          if (c.status === 403) {
            return NextResponse.json(
              {
                error: `Access denied while ${where}: your agent scope doesn't allow this on this ticket.`,
                step: e.step,
              },
              { status: 403 },
            );
          }
          return NextResponse.json(
            { error: `Failed while ${where}: ${c.message}`, step: e.step },
            { status: c.status },
          );
        }
        return NextResponse.json(
          { error: `Failed while ${where}.`, step: e.step },
          { status: 500 },
        );
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
