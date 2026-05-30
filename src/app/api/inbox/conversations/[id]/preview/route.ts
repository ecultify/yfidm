import { NextResponse, type NextRequest } from "next/server";
import { linkedinAdapter } from "@/lib/services/adapters/linkedin-adapter";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand hydration of a single LinkedIn row: its contact AND last-message
 * preview. Called lazily by the client as rows scroll into view, so a cold
 * inbox load fans out nothing per-row. `?sig=` is the row's known last-activity
 * timestamp, used to keep the cached preview fresh.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  try {
    await requireUser();
    const data = await linkedinAdapter.fetchRowData(id, sig);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
