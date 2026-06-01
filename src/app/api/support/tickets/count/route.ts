import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { countTickets } from "@/lib/server/freshdesk";
import { errorResponse } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/tickets/count - the grand total ticket count for the same
 * last-30-day window the list pages through (the list endpoint returns no total
 * of its own, so this uses Freshdesk's search endpoint). Fetched once for the
 * sidebar header rather than on every page load.
 */
export async function GET() {
  try {
    await requireUser();
    const total = await countTickets();
    return NextResponse.json({ total });
  } catch (e) {
    return errorResponse(e);
  }
}
