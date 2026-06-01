import "server-only";

import { execute, query } from "./db";

/**
 * Logs handled queries to a Google Sheet via a bound Apps Script web app
 * webhook (no Google Cloud service account needed). We POST the row fields with
 * a shared secret; the Apps Script validates the secret, computes the S. No.
 * column from the sheet's row count, and appends the row.
 *
 * SERVER ONLY. Fires once per conversation/ticket (deduped via sheet_exports)
 * and is best-effort: it never throws into the caller and no-ops entirely when
 * the webhook isn't configured.
 *
 * Env:
 *   SHEETS_WEBHOOK_URL     the Apps Script web-app URL
 *   SHEETS_WEBHOOK_SECRET  shared secret matching the script's SECRET
 */

export interface SheetRow {
  platform: string; // "Freshdesk" | "Instagram" | "LinkedIn"
  dateReceived: string;
  time: string;
  name: string;
  designation: string;
  organisation: string;
  typeOfQueries: string;
  query: string;
  personTeam: string;
  documentLink: string;
  driveLink: string;
}

/** True when the sheet webhook is configured (so callers can skip extra work). */
export function sheetsConfigured(): boolean {
  return Boolean(process.env.SHEETS_WEBHOOK_URL);
}

const IST = "Asia/Kolkata";

/** Date as DD/MM/YYYY in IST. */
export function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: IST,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Time as HH:MM (24h) in IST. */
export function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: IST,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Strip HTML, unescape common entities, collapse whitespace, clamp length. */
export function plain(input: string, max = 1000): string {
  const t = input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function alreadyExported(key: string): Promise<boolean> {
  try {
    const rows = await query<{ export_key: string }>(
      "SELECT export_key FROM sheet_exports WHERE export_key = ? LIMIT 1",
      [key],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function markExported(key: string): Promise<void> {
  try {
    await execute("INSERT IGNORE INTO sheet_exports (export_key) VALUES (?)", [key]);
  } catch {
    /* best-effort */
  }
}

/**
 * Appends one row to the sheet, at most once per `key`. Best-effort: never
 * throws, no-ops if unconfigured or already exported.
 */
export async function appendSheetRow(key: string, row: SheetRow): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  if (await alreadyExported(key)) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Apps Script web apps 302 to googleusercontent; fetch follows it.
      body: JSON.stringify({
        secret: process.env.SHEETS_WEBHOOK_SECRET ?? "",
        ...row,
      }),
    });
    if (res.ok) await markExported(key);
  } catch {
    /* best-effort; will retry on the next trigger since the key wasn't marked */
  }
}
