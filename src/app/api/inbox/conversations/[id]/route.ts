import { NextResponse, type NextRequest } from "next/server";
import { linkedinAdapter } from "@/lib/services/adapters/linkedin-adapter";
import { instagramAdapter } from "@/lib/services/adapters/instagram-adapter";
import {
  addTag,
  mergeConversation,
  removeTag,
  setAssignee,
  setRead,
  setStatus,
} from "@/lib/server/app-store";
import { requireUser } from "@/lib/server/auth";
import {
  getChat,
  getChatForAccount,
  instagramAccount,
} from "@/lib/server/unipile";
import {
  appendSheetRow,
  fmtDate,
  fmtTime,
  plain,
  sheetsConfigured,
} from "@/lib/server/sheets-log";
import { errorResponse } from "../route";
import type { Channel, ConversationStatus, Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Determines a conversation's TRUE channel from the raw Unipile chat's
 * account_type ("LINKEDIN" / "INSTAGRAM"). We can't trust the adapters for
 * detection: both run on the same Unipile account, so the LinkedIn adapter will
 * happily resolve an Instagram chat and stamp it "linkedin". Returns null if it
 * can't be determined.
 */
async function detectChannel(id: string): Promise<Channel | null> {
  let accountType = "";
  try {
    accountType = ((await getChat(id)).account_type ?? "").toUpperCase();
  } catch {
    // IG may live under a different Unipile account; try that explicitly.
    try {
      accountType = (
        (await getChatForAccount(instagramAccount(), id)).account_type ?? ""
      ).toUpperCase();
    } catch {
      return null;
    }
  }
  if (accountType === "INSTAGRAM") return "instagram";
  if (accountType === "LINKEDIN") return "linkedin";
  return null;
}

/**
 * Best-effort: when an Instagram/LinkedIn conversation is marked Resolved AND
 * we've sent a reply, log the handled query to the Google Sheet (once per
 * conversation). Channel is detected from the raw chat's account_type so the
 * platform label and profile URL are correct. Never throws into the handler.
 */
async function logResolvedConversation(id: string): Promise<void> {
  if (!sheetsConfigured()) return;

  const channel = await detectChannel(id);
  if (!channel) return;

  const adapter = channel === "linkedin" ? linkedinAdapter : instagramAdapter;
  const conv = await adapter.fetchConversation(id).catch(() => null);
  if (!conv) return;

  let messages: Message[] = [];
  try {
    messages = await adapter.fetchMessages(id);
  } catch {
    return;
  }

  // Only log if our side actually replied.
  if (!messages.some((m) => m.direction === "outbound")) return;

  const sorted = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const firstInbound = sorted.find((m) => m.direction === "inbound");
  const when = firstInbound?.sentAt ?? conv.lastMessageAt;
  const tags = conv.tags.filter(Boolean);

  await appendSheetRow(`${channel}:${id}`, {
    platform: channel === "linkedin" ? "LinkedIn" : "Instagram",
    dateReceived: fmtDate(when),
    time: fmtTime(when),
    name: conv.contact.displayName,
    designation: "Applicant",
    organisation: "",
    typeOfQueries: tags.length ? tags.join(", ") : "General enquiry",
    query: plain(firstInbound?.body ?? conv.lastMessagePreview),
    personTeam: "",
    documentLink: conv.contact.profileUrl,
    driveLink: "",
  });
}

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
 * Channel-agnostic - used by LinkedIn AND Instagram conversations.
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

    // Log handled queries to the Google Sheet when resolved (best-effort).
    if (body.status === "resolved") {
      try {
        await logResolvedConversation(id);
      } catch {
        /* never block the status change on the sheet export */
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
