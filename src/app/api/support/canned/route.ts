import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createCanned, listCanned } from "@/lib/server/canned";
import { errorResponse } from "../tickets/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/support/canned - the current agent's reply templates. */
export async function GET() {
  try {
    const me = await requireUser();
    return NextResponse.json(await listCanned(me.id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/support/canned - create a template { title, body }. */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
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
    return NextResponse.json(await createCanned(me.id, title, body), {
      status: 201,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
