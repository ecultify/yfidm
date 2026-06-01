import "server-only";

import {
  addNote,
  bulkUpdateProperties,
  getTicket,
  replyToTicket,
  ticketUrl,
  updateTicketProperties,
} from "./freshdesk";
import {
  appendSheetRow,
  fmtDate,
  fmtTime,
  plain,
  sheetsConfigured,
} from "./sheets-log";

/**
 * Predefined "quick actions" for the support desk. Each one replicates a
 * Freshdesk scenario automation (which the public API can't execute) by doing,
 * in order, against one ticket:
 *   1. a property update  (PUT /tickets/{id})       — status / priority
 *   2. a customer-facing reply (POST /tickets/{id}/reply) — exact fixed wording
 *
 * The reply sends a REAL outbound email to the requester; treat it as
 * irreversible. The wording below is sent verbatim — do not edit, summarise, or
 * reorder it. These are defined here in code (not user-editable).
 *
 * SERVER ONLY. The reply bodies never go to the client; the frontend only sees
 * key + label + summary.
 */

export interface QuickAction {
  key: string;
  label: string;
  /** Freshdesk numeric properties to set: 2=Open 3=Pending 4=Resolved 5=Closed; priority 1=Low..4=Urgent. */
  properties: Record<string, number>;
  /** Exact reply text, as written, including blank lines. */
  replyText: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "applicant_response",
    label: "Applicant Response",
    properties: { status: 5, priority: 3 }, // Closed, High
    replyText: `Dear Applicant,

Thank you for reaching out to us.

As stated in the official communication, applications for the SBI Youth for India Fellowship 2026–27 cycle are closed, as the programme is undergoing an internal organisational review and alignment process.

Accordingly, no fresh Fellow registrations, recruitment outreach, selection process, or induction activity will be undertaken for the 2026–27 cycle.

The official website will remain the source for any official information regarding the Fellowship.

Thank you for your understanding.

Regards,
Team SBI Youth for India Fellowship`,
  },
  {
    key: "recruitment_query",
    label: "Recruitment Query",
    properties: { status: 5 }, // Closed
    replyText: `Hi

Thank you for reaching out to us.

This channel is dedicated to communication related to the SBI Youth for India Fellowship. For job opportunities, recruitment updates, or career-related queries with SBI, we request you to refer to the official SBI Careers portal or the relevant official SBI communication channels.

Regards,
Team SBI Youth for India Fellowship`,
  },
  {
    key: "registered_selected",
    label: "Registered/Selected Candidates",
    properties: { status: 5 }, // Closed
    replyText: `Dear Applicant,

Thank you for applying to the SBI Youth for India Fellowship.

Relevant communication regarding the 2026–27 Fellowship cycle has been shared through official email communication sent to registered email IDs.

We request you to check your registered email inbox for any communication from the SBI Youth for India Fellowship team.

Regards,
Team SBI Youth for India Fellowship`,
  },
];

const STATUS_LABELS: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
};
const PRIORITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/** Human summary of an action's property changes, for the confirm dialog. */
function summarize(a: QuickAction): string {
  const parts: string[] = [];
  if (a.properties.status) parts.push(STATUS_LABELS[a.properties.status] ?? `status ${a.properties.status}`);
  if (a.properties.priority) parts.push(PRIORITY_LABELS[a.properties.priority] ?? `priority ${a.properties.priority}`);
  parts.push("sends a reply");
  return parts.join(", ");
}

/** Public, key-safe list for the client (no reply bodies). */
export function quickActionList(): { key: string; label: string; summary: string }[] {
  return QUICK_ACTIONS.map((a) => ({
    key: a.key,
    label: a.label,
    summary: summarize(a),
  }));
}

function getAction(key: string): QuickAction {
  const a = QUICK_ACTIONS.find((x) => x.key === key);
  if (!a) throw new Error(`Unknown quick action "${key}"`);
  return a;
}

/**
 * Turns the exact reply text into email-safe HTML, preserving paragraph
 * structure. We use <br><br> for blank-line paragraph breaks and a single <br>
 * for in-paragraph breaks, NOT <p> tags: Freshdesk's outbound email template
 * zeroes out <p> margins, which collapses paragraph spacing. <br><br> renders a
 * real blank line in every mail client. HTML-special characters are escaped;
 * the wording itself is never altered.
 */
export function textToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((para) => escape(para).replace(/\n/g, "<br>"))
    .join("<br><br>");
}

/** A private internal note recording that a quick action was applied. */
function quickActionNoteHtml(label: string, actorName?: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const by = actorName ? ` by ${esc(actorName)}` : "";
  return `<p>Quick action "<b>${esc(label)}</b>" applied via the support app${by}.</p>`;
}

/**
 * Best-effort: log a closed+replied Freshdesk ticket to the Google Sheet. The
 * quick action both closes and replies, so this is the "handled query" moment.
 * Type of Queries = the quick action's label. Never throws.
 */
async function logTicketToSheet(ticketId: number, actionLabel: string) {
  if (!sheetsConfigured()) return;
  try {
    const t = await getTicket(ticketId, { requester: true });
    await appendSheetRow(`freshdesk:${ticketId}`, {
      platform: "Freshdesk",
      dateReceived: fmtDate(t.createdAt),
      time: fmtTime(t.createdAt),
      name: t.requester?.name ?? "",
      designation: "Applicant",
      organisation: "",
      typeOfQueries: actionLabel,
      query: plain(t.description ?? ""),
      personTeam: "",
      documentLink: ticketUrl(ticketId),
      driveLink: "",
    });
  } catch {
    /* best-effort */
  }
}

/** Raised when a quick action fails, naming which step failed. */
export class QuickActionError extends Error {
  constructor(
    public readonly step: "property" | "reply",
    public readonly cause: unknown,
  ) {
    super(`Quick action failed during the ${step} step`);
    this.name = "QuickActionError";
  }
}

/**
 * Applies a quick action to a single ticket: property update first, then the
 * reply. If either step fails it throws a {@link QuickActionError} naming the
 * step (so the route can report exactly what failed — never a silent success).
 * Note: if the property update succeeds but the reply fails, the status change
 * has already happened; the error makes that explicit.
 */
export async function applyQuickAction(
  ticketId: number,
  actionKey: string,
  actorName?: string,
): Promise<{ action: string }> {
  const action = getAction(actionKey);

  try {
    await updateTicketProperties(ticketId, action.properties);
  } catch (e) {
    throw new QuickActionError("property", e);
  }

  try {
    await replyToTicket(ticketId, textToHtml(action.replyText));
  } catch (e) {
    throw new QuickActionError("reply", e);
  }

  // Best-effort private note on the ticket recording the action. The reply has
  // already sent, so a note hiccup must not fail the request.
  try {
    await addNote(ticketId, quickActionNoteHtml(action.label, actorName));
  } catch {
    /* note is best-effort */
  }

  // Best-effort: log the handled query to the Google Sheet (closed + replied).
  await logTicketToSheet(ticketId, action.label);

  return { action: action.label };
}

export interface QuickActionBulkResult {
  action: string;
  results: {
    id: number;
    propertyOk: boolean;
    replyOk: boolean;
    error?: string;
  }[];
}

/**
 * Applies a quick action to many tickets: the property update goes through the
 * async bulk endpoint (one job), then the reply is sent per ticket in a loop
 * (replies can't be bulked). The shared request wrapper already honours
 * X-RateLimit / Retry-After and backs off on 429. Reports per-ticket which
 * steps succeeded.
 */
export async function applyQuickActionBulk(
  ids: number[],
  actionKey: string,
  actorName?: string,
): Promise<QuickActionBulkResult> {
  const action = getAction(actionKey);
  const html = textToHtml(action.replyText);
  const noteHtml = quickActionNoteHtml(action.label, actorName);

  const prop = await bulkUpdateProperties(ids, action.properties);
  const propOk = new Set(prop.succeeded);

  const results: QuickActionBulkResult["results"] = [];
  for (const id of ids) {
    const propertyOk = propOk.has(id);
    let replyOk = false;
    let error: string | undefined;
    try {
      await replyToTicket(id, html);
      replyOk = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "reply failed";
    }
    if (replyOk) {
      // Best-effort note per ticket where the reply landed.
      try {
        await addNote(id, noteHtml);
      } catch {
        /* note is best-effort */
      }
    }
    // Log to the sheet only when the ticket was both closed and replied.
    if (propertyOk && replyOk) await logTicketToSheet(id, action.label);
    if (!propertyOk && !error) error = "status change did not apply";
    results.push({ id, propertyOk, replyOk, error });
  }

  return { action: action.label, results };
}
