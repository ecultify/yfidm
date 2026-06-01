import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireUser } from "@/lib/server/auth";
import {
  EmptyBodyError,
  FreshdeskError,
  listTicketsPage,
} from "@/lib/server/freshdesk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Maps service-layer errors to clean JSON responses. Crucially, this never
 * leaks the Freshdesk auth header / API key - {@link FreshdeskError} only ever
 * carries a parsed `description` + per-field messages, not request headers.
 */
export function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof EmptyBodyError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  if (e instanceof FreshdeskError) {
    return NextResponse.json(
      { error: e.message, fields: e.fields },
      { status: e.status },
    );
  }
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * GET /api/support/tickets - one PAGE of helpdesk tickets (status/priority/
 * source already mapped to labels), newest-updated first. The sidebar lazy-
 * loads by bumping `page` as the agent scrolls. Query params:
 *   - page=N         1-based page number (default 1)
 *   - perPage=M      page size, capped at 100 by the service (default 30)
 *   - updatedSince=YYYY-MM-DDTHH:MM:SSZ  to reach tickets older than 30 days
 * Returns { tickets, page, hasMore }.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();

    const params = req.nextUrl.searchParams;
    const updatedSince = params.get("updatedSince") ?? undefined;

    const pageRaw = params.get("page");
    const page = pageRaw ? Number(pageRaw) : 1;
    if (!Number.isFinite(page) || page < 1) {
      return NextResponse.json(
        { error: "page must be a positive integer" },
        { status: 400 },
      );
    }

    const perPageRaw = params.get("perPage");
    const perPage = perPageRaw ? Number(perPageRaw) : undefined;
    if (perPage !== undefined && (!Number.isFinite(perPage) || perPage < 1)) {
      return NextResponse.json(
        { error: "perPage must be a positive integer" },
        { status: 400 },
      );
    }

    const result = await listTicketsPage({ page, perPage, updatedSince });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
