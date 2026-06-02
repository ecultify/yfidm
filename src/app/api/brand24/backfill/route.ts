import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { backfillChannelHistory } from "@/lib/server/slack-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off (re-runnable) backfill of older Brand24 alerts from Slack channel
 * history into `slack_notifications`. Admin-only because it calls Slack with the
 * bot token and writes to the DB. Idempotent — safe to run more than once; rows
 * already captured are counted as duplicates, not re-added.
 */
export async function POST() {
  try {
    await requireAdmin();
    const result = await backfillChannelHistory();
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
