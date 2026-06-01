import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { quickActionList } from "@/lib/server/quick-actions";
import { errorResponse } from "../tickets/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/quick-actions - the predefined quick actions (key + label +
 * action summary). The reply bodies stay server-side and are never sent here.
 */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(quickActionList());
  } catch (e) {
    return errorResponse(e);
  }
}
