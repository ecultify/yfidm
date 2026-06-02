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

  const sorted = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  // The "query" is the latest thing they actually asked (the message we just
  // handled), NOT their oldest message ever — DM threads accumulate history.
  const inbound = sorted.filter((m) => m.direction === "inbound");
  const query = inbound[inbound.length - 1];
  if (!query) return; // nothing inbound to log

  // Only log if an agent actually REPLIED to that latest message. If the agent
  // resolved without responding (after their last message), the query was
  // useless / spam — don't record it on the sheet.
  const repliedAfter = sorted.some(
    (m) =>
      m.direction === "outbound" &&
      new Date(m.sentAt).getTime() > new Date(query.sentAt).getTime(),
  );
  if (!repliedAfter) return;

  const tags = conv.tags.filter(Boolean);

  // Dedupe per query-round (conversation + the message we handled), so a
  // re-engaged + re-resolved chat logs the new round but never double-logs the
  // same one.
  await appendSheetRow(`${channel}:${id}:${query.id}`, {
    platform: channel === "linkedin" ? "LinkedIn" : "Instagram",
    dateReceived: fmtDate(query.sentAt),
    time: fmtTime(query.sentAt),
    name: conv.contact.displayName,
    designation: "Applicant",
    organisation: "",
    typeOfQueries: tags.length ? tags.join(", ") : "General enquiry",
    query: plain(query.body),
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
