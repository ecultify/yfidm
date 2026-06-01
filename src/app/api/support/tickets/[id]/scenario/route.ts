import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { addNote, executeScenario } from "@/lib/server/freshdesk";
import { logTicketActivity } from "@/lib/server/support-log";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * POST /api/support/tickets/{id}/scenario - run a Freshdesk scenario automation
 * on a ticket. Body: { "scenarioId": number, "scenarioName": string }.
 *
 * After the scenario runs we automatically drop a PRIVATE internal note on the
 * ticket recording which scenario was run and by whom, so the team has a trail
 * (the scenario's own actions, e.g. its reply, aren't otherwise attributed in
 * the thread). The destructive confirm lives in the UI.
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

    const { scenarioId, scenarioName } = (await req.json()) as {
      scenarioId?: number | string;
      scenarioName?: string;
    };
    const sid = Number(scenarioId);
    if (!Number.isFinite(sid) || sid <= 0) {
      return NextResponse.json(
        { error: "scenarioId is required" },
        { status: 400 },
      );
    }

    await executeScenario(numericId, sid);

    // Auto internal note + activity trail. Best-effort: the scenario already
    // ran, so a logging hiccup shouldn't fail the request.
    const name = scenarioName?.trim() || `#${sid}`;
    try {
      await addNote(
        numericId,
        `<p>Ran scenario automation "<b>${escapeHtml(name)}</b>" via the support app (by ${escapeHtml(me.name)}).</p>`,
      );
    } catch {
      /* note is best-effort */
    }
    await logTicketActivity(me, numericId, "scenario", name);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
