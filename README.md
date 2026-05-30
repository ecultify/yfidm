# Unibox — Unified Social DM Inbox

One inbox for **Instagram**, **Facebook**, and **LinkedIn** direct messages. A
support team reads, assigns, and replies to DMs from all three channels on a
single screen instead of jumping between three apps.

This is a **frontend-only clickable prototype** running entirely on mock data —
but architected so real channel APIs drop in later **with zero UI changes**.

## Stack

- **Next.js 16** (App Router) + **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui** (Radix)
- **TanStack Query** for all data access
- **lucide-react** icons · **Sonner** toasts · **date-fns** · **next-themes** (dark mode)

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build + typecheck
```

## The API-ready seam (the important part)

All data flows through **one typed service layer**. The UI never touches mock
data — it only calls React Query hooks, which call a single service singleton.

```
components/  ──>  lib/hooks/  ──>  lib/services/index.ts  ──>  InboxService
   (UI)            (React Query)      (singleton)            (impl: Mock | Live)
```

- `lib/types.ts` — normalized, platform-agnostic domain types (`Channel`,
  `Conversation`, `Message`, `Agent`, `InternalNote`, …).
- `lib/services/inbox-service.ts` — the `InboxService` interface. The only
  contract the UI depends on.
- `lib/services/mock-inbox-service.ts` — in-memory implementation with seeded
  data, artificial latency, optimistic-friendly mutations, and a `subscribe()`
  realtime simulator (fires a demo inbound message every ~30s).
- `lib/services/index.ts` — **the one line you change to go live:**

  ```ts
  export const inboxService: InboxService = new MockInboxService();
  ```

- `lib/services/adapters/` — typed-but-unimplemented production seam:
  - `channel-adapter.ts` — the `ChannelAdapter` contract.
  - `meta-adapter.ts` — Instagram + Facebook via Meta Graph API (TODO stubs,
    with comments marking exactly where payloads map into the normalized types).
  - `linkedin-adapter.ts` — LinkedIn messaging (TODO stubs).

To integrate for real: implement the adapters, write a `LiveInboxService` that
fans out across them, and swap the singleton. Every hook — and therefore every
component — keeps working untouched. Integration points are marked with
`// TODO: integrate <channel> API`.

## Features

- 3-pane resizable inbox (rail · list · thread) + collapsible contact panel
- Filters that **combine**: channel × status × unread × assigned-to-me × search
- Assign / reassign · status workflow (Open / Pending / Resolved / Snoozed)
- Colored tags (add/remove inline) · mark read/unread · snooze
- Canned replies · **Reply vs Internal note** toggle (notes are team-only)
- **Optimistic send**: a reply appears instantly as _sending_ → _sent_ →
  _delivered_ → _read_; failures are recoverable
- **⌘K** command palette · search · **j/k** to move · **⌘↵** to send · **e** to resolve
- Full dark mode, skeleton loaders, polished empty states
- Mobile: panes stack — list → full-screen thread (back button), contact panel as a Sheet

## Structure

```
src/
  app/                      layout (providers) + page
  components/
    providers.tsx           React Query + theme + tooltips + toasts
    inbox/                  all inbox UI
      inbox-app.tsx         shell: resizable desktop / stacked mobile + keyboard
      inbox-context.tsx     filter/selection/panel UI state
      left-rail · conversation-list · conversation-thread · composer
      contact-panel · command-palette · conversation-actions · …
  lib/
    types.ts                domain types
    services/               the data layer + adapters
    hooks/                  React Query hooks (the only data gateway for the UI)
    channel.ts · format.ts · tag-color.ts
```
