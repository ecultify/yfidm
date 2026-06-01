import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { deleteCanned, updateCanned } from "@/lib/server/canned";
import { errorResponse } from "../../tickets/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/support/canned/{id} - edit one of the agent's own templates. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const { title, body } = (await req.json()) as {
      title?: string;
      body?: string;
    };
    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!body?.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    const updated = await updateCanned(me.id, id, title, body);
    if (!updated) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/support/canned/{id} - remove one of the agent's own templates. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const removed = await deleteCanned(me.id, id);
    if (!removed) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
