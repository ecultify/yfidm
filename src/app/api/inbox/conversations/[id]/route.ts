import { NextResponse, type NextRequest } from "next/server";
import { linkedinAdapter } from "@/lib/services/adapters/linkedin-adapter";
import {
  addTag,
  mergeConversation,
  removeTag,
  setAssignee,
  setRead,
  setStatus,
} from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../route";
import type { ConversationStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET a single merged LinkedIn conversation. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    if (process.env.INBOX_LINKEDIN_SOURCE !== "real") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const base = await linkedinAdapter.fetchConversation(id);
    if (!base) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(await mergeConversation(base));
  } catch (e) {
    return errorResponse(e);
  }
}

interface PatchBody {
  status?: ConversationStatus;
  assigneeId?: string | null;
  addTag?: string;
  removeTag?: string;
  read?: boolean;
}

/**
 * PATCH app-owned workflow state (status / assignee / tags / read). Persists to
 * MySQL (shared across users), tagged with the acting user for the activity log.
 * Channel-agnostic — used by LinkedIn AND Instagram conversations.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as PatchBody;
    const actor = { id: me.id, name: me.name };

    if (body.status) await setStatus(id, body.status, actor);
    if ("assigneeId" in body) await setAssignee(id, body.assigneeId ?? null, actor);
    if (body.addTag) await addTag(id, body.addTag, actor);
    if (body.removeTag) await removeTag(id, body.removeTag, actor);
    if (typeof body.read === "boolean") await setRead(id, body.read, actor);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
