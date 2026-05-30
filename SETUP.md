# Unibox — Setup, Database & Deployment

This app is a multi-user team inbox for **Instagram + LinkedIn** DMs (via
Unipile), with **email/password auth**, an **admin-managed team**, and
**shared workflow state** (status / assignment / tags / read / notes) persisted
in **MySQL** so every logged-in agent sees changes in near-realtime (the app
polls every ~20s).

Facebook/Messenger is intentionally **not connected** (shows a "not connected"
note when selected).

---

## 1. Prerequisites

- Node.js **20 LTS or newer**
- A **MySQL / MariaDB** database (Hostinger provides this in hPanel → Databases)

## 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

- **Unipile**: `UNIPILE_DSN`, `UNIPILE_API_KEY`, `UNIPILE_ACCOUNT_ID`,
  `UNIPILE_SBI_MAILBOX_ID`, `UNIPILE_IG_ACCOUNT_ID`, `UNIPILE_WEBHOOK_SECRET`.
- **Database**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

> `.env.local` is gitignored — your keys never get committed. Rotate the Unipile
> API key before production (it unlocks every mailbox on the account).

## 3. Create the database tables

Run the schema **once** against your database:

```bash
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < db/schema.sql
```

On Hostinger you can instead open **hPanel → Databases → phpMyAdmin → Import**
and upload `db/schema.sql`.

This creates all tables **and seeds the admin account**:

- **Admin:** Abhinav Rai — `98abrai@gmail.com`
- **Password:** _provided to you separately_ (not stored in the repo).
  Change it after first login via the avatar menu → **Change password**.

## 4. Run locally

```bash
npm install
npm run build
npm start        # production server on http://localhost:3000
# or: npm run dev   (hot-reload dev server)
```

Open the app → you'll be redirected to **/login** → sign in as the admin.

---

## 5. Managing the team (admin only)

Avatar menu (bottom-left) → **Manage team**, or go to `/team`:

- **Add a team member** — enter name + email, pick role (Agent/Admin) and an
  avatar (Female/Male). This creates the account and generates an **invite link**
  (auto-copied to your clipboard). Send that link to the person.
- The invitee opens `/invite/<token>`, **sets their own password**, and can then
  sign in. They can change their password anytime from the same menu.
- **Remove** a user with the trash icon. Admins can't delete themselves.

Only **admins** see the team section and can add/remove users.

---

## 6. Push to GitHub

> Do **not** use your account password for git — GitHub requires a **Personal
> Access Token (PAT)** or SSH key. Create a PAT at
> github.com → Settings → Developer settings → Personal access tokens (classic),
> scope `repo`.

From the project root:

```bash
git add -A
git commit -m "Instagram channel, MySQL auth + team management"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main          # paste your PAT when prompted for a password
```

`.env.local`, `node_modules/`, and `.next/` are gitignored, so no secrets or
build artifacts are pushed. `.env.example` *is* committed as a template.

---

## 7. Deploy on Hostinger (Node.js app)

1. **Database:** hPanel → Databases → create a MySQL DB + user. Import
   `db/schema.sql`. Note the host/user/password/name.
2. **Node app:** hPanel → your Node.js app:
   - **Application root:** your repo folder (deploy via Git or upload).
   - **Node version:** 20+.
   - **Build command:** `npm install && npm run build`. The build produces a
     slim **standalone** server at `.next/standalone/server.js` (config
     `output: "standalone"`) and `postbuild` copies the static assets + the
     runtime DB packages into it. This is the key fix for 503 / restart loops:
     it uses ~45 MB instead of loading the full ~600 MB `node_modules`.
   - **Start command:** `npm start` (now runs `node .next/standalone/server.js`).
     The standalone server listens on the platform's `PORT` automatically.
   - **Instances / workers:** set to **1**. Two instances both bind the same
     port (`EADDRINUSE`) and crash-loop — that is what produced the repeated
     `✓ Ready` and the 503s.
   - Optionally set `HOSTNAME=0.0.0.0` so it binds all interfaces.
3. **Environment variables:** add every key from `.env.example` (Unipile + DB +
   `APP_URL`) in the Node app's **Environment Variables** section. Use
   `DB_HOST=127.0.0.1` (forces IPv4 — `localhost` can resolve to IPv6 `::1` and
   fail the grant). Set `APP_URL` to your real domain (e.g.
   `https://your-site.hostingersite.com`) so invite links point at the site and
   not the internal `0.0.0.0:3000` address. **Restart the app after any env change.**
4. **Port:** Hostinger injects a `PORT`; `next start` honours it automatically.
5. **Webhook (optional realtime):** point your Unipile webhook at
   `https://<your-domain>/api/inbox/webhook?secret=<UNIPILE_WEBHOOK_SECRET>`.

After it boots, visit your domain → **/login** → sign in as the admin → set a
new password → invite your team.

---

## How realtime works

There's no WebSocket dependency (most shared Node hosts don't keep them alive).
Instead the client **polls** the MySQL-backed API every ~20s and refetches after
each action, so when one agent assigns / tags / resolves / reads / replies, the
shared state updates and everyone else picks it up on their next poll. The
`activity_log` table also records who did what (assignments + replies) for
auditing and future timeline UI.
