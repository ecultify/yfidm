import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { listScenarios } from "@/lib/server/freshdesk";
import { errorResponse } from "../tickets/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/scenarios - the account's scenario automations (name +
 * action summary). Admin-defined in Freshdesk; the API can only list and run
 * them, so this is read-only.
 */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await listScenarios());
  } catch (e) {
    return errorResponse(e);
  }
}
