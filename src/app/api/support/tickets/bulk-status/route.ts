import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { bulkUpdateStatus, statusCodeFromLabel } from "@/lib/server/freshdesk";
import { logTicketActivity } from "@/lib/server/support-log";
import { errorResponse } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BULK = 100;

/**
 * POST /api/support/tickets/bulk-status - change the status of many tickets at
 * once. Body: { "ids": number[], "status": "Resolved" }.
 *
 * Freshdesk runs this asynchronously and can fail individual tickets silently,
 * so the service verifies each ticket afterwards. We return per-ticket results:
 * { succeeded: number[], failed: [{ id, status }] }. The destructive confirm
 * step lives in the UI; this route just executes what was confirmed.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();

    const { ids, status } = (await req.json()) as {
      ids?: unknown;
      status?: string;
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

    const result = await bulkUpdateStatus(cleanIds, code);
    // Record each ticket that actually changed (verified server-side).
    await Promise.all(
      result.succeeded.map((tid) =>
        logTicketActivity(me, tid, "bulk_status", status),
      ),
    );
    return NextResponse.json({ ...result, targetStatus: status });
  } catch (e) {
    return errorResponse(e);
  }
}
