import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { applyQuickActionBulk } from "@/lib/server/quick-actions";
import { logTicketActivity } from "@/lib/server/support-log";
import { errorResponse } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BULK = 50; // each ticket also gets its own reply call; keep it sane

/**
 * POST /api/support/tickets/quick-action-bulk - apply a quick action to many
 * tickets. Body: { "ids": number[], "actionKey": string }.
 *
 * Properties go through the async bulk endpoint; replies are sent per ticket
 * (rate-limit-aware). Returns per-ticket results so the UI can show which
 * succeeded and which failed (scope / validation). This sends real emails — the
 * UI gates it behind an explicit confirm.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const { ids, actionKey } = (await req.json()) as {
      ids?: unknown;
      actionKey?: string;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids must be a non-empty array" },
        { status: 400 },
      );
    }
    const cleanIds = ids
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (cleanIds.length === 0) {
      return NextResponse.json({ error: "No valid ticket ids" }, { status: 400 });
    }
    if (cleanIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Too many tickets at once (max ${MAX_BULK}).` },
        { status: 400 },
      );
    }
    if (!actionKey?.trim()) {
      return NextResponse.json({ error: "actionKey is required" }, { status: 400 });
    }

    const result = await applyQuickActionBulk(cleanIds, actionKey, me.name);

    // Log the tickets where at least the reply or property landed (best-effort).
    await Promise.all(
      result.results
        .filter((r) => r.propertyOk || r.replyOk)
        .map((r) => logTicketActivity(me, r.id, "quick_action", result.action)),
    );

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
