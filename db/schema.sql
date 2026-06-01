-- ============================================================================
--  Unibox — MySQL / MariaDB schema
--  Run this ONCE against your Hostinger SQL database (hPanel → phpMyAdmin →
--  Import, or `mysql -u <user> -p <db> < db/schema.sql`).
--
--  It creates the auth tables (users / sessions / invites) and the shared,
--  multi-user workflow state (conversation status, assignment, tags, notes,
--  activity log) that the app polls so changes show up for everyone in
--  near-realtime.
--
--  Charset utf8mb4 throughout so emoji / non-Latin names are safe.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
--  Users — the real people who log in. Replaces the old seeded "agents".
--  role: 'admin' can manage users; 'agent' is a normal team member.
--  status: 'invited' (no password set yet), 'active', 'disabled'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(100) NULL,
  role          ENUM('admin','agent') NOT NULL DEFAULT 'agent',
  avatar_url    VARCHAR(400) NOT NULL DEFAULT '',
  status        ENUM('invited','active','disabled') NOT NULL DEFAULT 'invited',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Sessions — one row per logged-in browser. `token` is the opaque value
--  stored in an HTTP-only cookie. Expired rows are ignored and cleaned lazily.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token       VARCHAR(64) NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME    NOT NULL,
  PRIMARY KEY (token),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Invites — generated when an admin adds a user. The admin sends the link
--  /invite/<token>; the invitee sets their own password to activate.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  token       VARCHAR(64) NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  created_by  VARCHAR(36) NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME    NOT NULL,
  accepted_at DATETIME    NULL,
  PRIMARY KEY (token),
  KEY idx_invites_user (user_id),
  CONSTRAINT fk_invites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Conversation workflow state — app-owned data Unipile does NOT store. One
--  row per conversation (LinkedIn / Instagram chat id, or mock id). Shared
--  across all users, which is what makes status / assignment / read sync live.
--  read_override: 1 = force read, 0 = force unread, NULL = use provider count.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_state (
  conversation_id VARCHAR(191) NOT NULL,
  channel         VARCHAR(20)  NOT NULL DEFAULT '',
  status          ENUM('open','pending','resolved','snoozed') NULL,
  assignee_id     VARCHAR(36)  NULL,
  has_assignee    TINYINT(1)   NOT NULL DEFAULT 0,
  read_override   TINYINT(1)   NULL,
  updated_by      VARCHAR(36)  NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  KEY idx_state_assignee (assignee_id),
  CONSTRAINT fk_state_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Tags — in-app labels added on top of any provider tag. One row per tag.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_tags (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id VARCHAR(191) NOT NULL,
  tag             VARCHAR(80)  NOT NULL,
  created_by      VARCHAR(36)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tag (conversation_id, tag),
  KEY idx_tag_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Internal notes — team-only, never sent to the contact.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id              VARCHAR(64)  NOT NULL,
  conversation_id VARCHAR(191) NOT NULL,
  author_id       VARCHAR(36)  NULL,
  author_name     VARCHAR(120) NOT NULL,
  body            TEXT         NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Activity log — who did what (assigned, tagged, replied, resolved…). Lets
--  the team see who is handling / replied to each conversation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id VARCHAR(191) NOT NULL,
  actor_id        VARCHAR(36)  NULL,
  actor_name      VARCHAR(120) NOT NULL DEFAULT '',
  action          VARCHAR(40)  NOT NULL,
  detail          VARCHAR(400) NOT NULL DEFAULT '',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_conv (conversation_id),
  KEY idx_activity_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Canned responses — reusable reply templates for the Freshdesk support desk.
--  Stored in OUR database (NOT Freshdesk): its v2 canned-response endpoints
--  can't reliably list saved responses and have folder-ID bugs. Scoped per
--  agent via owner_id, so each agent manages their own templates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canned_responses (
  id          VARCHAR(36)  NOT NULL,
  owner_id    VARCHAR(36)  NOT NULL,
  title       VARCHAR(190) NOT NULL,
  body        TEXT         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_canned_owner (owner_id),
  CONSTRAINT fk_canned_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Freshdesk ticket activity — our own audit trail of what agents do on the
--  support desk: who opened which ticket, who replied (and the text), who left
--  a note, and every status change (single or part of a bulk update). Freshdesk
--  remains the source of truth for tickets; this records OUR side of the work.
--  actor_id is stored as a plain value (no FK) so history survives user
--  deletion, mirroring activity_log. ticket_id is the numeric Freshdesk id.
--  action: 'viewed' | 'reply' | 'note' | 'status_change' | 'bulk_status'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_ticket_activity (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    VARCHAR(36)  NULL,
  actor_name  VARCHAR(120) NOT NULL DEFAULT '',
  ticket_id   BIGINT       NOT NULL,
  action      VARCHAR(40)  NOT NULL,
  detail      TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_activity_ticket (ticket_id),
  KEY idx_support_activity_actor (actor_id),
  KEY idx_support_activity_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Admin audit — sensitive account actions performed by admins: password
--  resets, role changes (agent <-> admin), and status changes. Records the
--  acting admin and the target user. No FKs on the id columns so the trail
--  outlives deleted users.
--  action: 'password_reset' | 'role_change' | 'status_change'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id       VARCHAR(36)  NULL,
  actor_name     VARCHAR(120) NOT NULL DEFAULT '',
  target_user_id VARCHAR(36)  NULL,
  target_email   VARCHAR(190) NOT NULL DEFAULT '',
  action         VARCHAR(40)  NOT NULL,
  detail         VARCHAR(400) NOT NULL DEFAULT '',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_target (target_user_id),
  KEY idx_admin_audit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
--  Sheet exports — dedupe ledger for the Google Sheet logger. One row per
--  conversation/ticket that has been pushed to the sheet, so a handled query is
--  logged exactly once even if it's re-resolved or a quick action re-runs.
--  export_key is e.g. 'freshdesk:122795', 'instagram:<id>', 'linkedin:<id>'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sheet_exports (
  export_key VARCHAR(120) NOT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (export_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
--  Seed: the admin account.
--  Abhinav Rai — 98abrai@gmail.com — role admin, already active.
--  Password (bcrypt, cost 12): see SETUP.md / the value handed to you.
--  Change it after first login from the in-app "Change password" screen.
-- ============================================================================
INSERT INTO users (id, name, email, password_hash, role, avatar_url, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Abhinav Rai',
  '98abrai@gmail.com',
  '$2b$12$fdHo3nVjYwzmBXBNDlevxOvHICl/pct4.ma6jMg7AxeAqndQZPY4.',
  'admin',
  'https://api.dicebear.com/9.x/notionists/svg?seed=Abhinav&backgroundColor=b6e3f4',
  'active'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = 'admin',
  status = 'active';
