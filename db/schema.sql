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
