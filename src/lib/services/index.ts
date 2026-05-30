import type { InboxService } from "./inbox-service";
import { MockInboxService } from "./mock-inbox-service";
import { RealInboxService } from "./real-inbox-service";

/**
 * The single source of truth for the app's data layer.
 *
 * - `RealInboxService` (default): LinkedIn flows through our server-side
 *   /api/inbox/* routes backed by Unipile; Instagram + Facebook stay on mock
 *   data until their adapters are built. Whether LinkedIn returns real data is
 *   gated SERVER-SIDE by `INBOX_LINKEDIN_SOURCE` (the browser never sees the
 *   Unipile key).
 * - `MockInboxService`: set `NEXT_PUBLIC_INBOX_MODE=mock` to run the whole app
 *   on seeded data (no network), useful for design/demo work.
 *
 * The UI and React Query hooks consume this singleton and are untouched.
 */
export const inboxService: InboxService =
  process.env.NEXT_PUBLIC_INBOX_MODE === "mock"
    ? new MockInboxService()
    : new RealInboxService();

export type { InboxService } from "./inbox-service";
