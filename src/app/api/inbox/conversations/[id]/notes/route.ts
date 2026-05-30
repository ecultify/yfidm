import { NextResponse, type NextRequest } from "next/server";
import { addNote, listNotes } from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET internal notes for a conversation (app-owned state). Channel-agnostic. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    return NextResponse.json(await listNotes(id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST a new internal note (team-only, never sent to the contact). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const { body } = (await req.json()) as { body?: string };
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    return NextResponse.json(
      await addNote(id, body, { id: me.id, name: me.name }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
