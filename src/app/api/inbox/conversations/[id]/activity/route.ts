import { NextResponse, type NextRequest } from "next/server";
import { listActivity } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the activity timeline for a conversation (who assigned/replied/tagged...). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    return NextResponse.json(await listActivity(id));
  } catch (e) {
    return errorResponse(e);
  }
}
