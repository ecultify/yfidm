import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/server/auth";
import { getBrand24Analytics } from "@/lib/server/brand24";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregated analytics over captured Brand24 alerts: a per-platform breakdown
 * and a ranked list of post links with reference counts. Powers the left
 * "Analytics" column on the Brand24 page.
 */
export async function GET() {
  try {
    await requireUser();
    const analytics = await getBrand24Analytics();
    return NextResponse.json(analytics);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
