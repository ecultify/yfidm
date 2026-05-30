import "server-only";

import type { NextRequest } from "next/server";

/**
 * Resolves the PUBLIC origin of the app (e.g. https://yourdomain.com), used to
 * build absolute links like invite URLs.
 *
 * Behind Hostinger's reverse proxy, `req.nextUrl.origin` is the internal bind
 * address (e.g. http://0.0.0.0:3000), which is useless in an emailed link. So we
 * prefer an explicit APP_URL env, then the proxy's forwarded host headers, and
 * only fall back to the request origin as a last resort.
 */
export function publicOrigin(req: NextRequest): string {
  const env = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}
