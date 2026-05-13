import { Database, type SQLQueryBindings } from "bun:sqlite";

export interface Guild {
  id: string;
  name: string;
  created_at: string;
}

export interface RoleMapping {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  message_url: string;
  emoji_key: string;
  role_id: string;
  mode: "toggle" | "add-only" | "remove-on-unreact";
  enabled: number; // SQLite stores booleans as 0/1
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  created_at: string;
  expires_at: string;
}

export interface OAuthState {
  state: string;
  expires_at: string;
}

const DB_PATH = process.env.RPO_DATABASE_PATH ?? "./data/rolebot.sqlite";

export const db = new Database(DB_PATH, { create: true });

export function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS role_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_url TEXT NOT NULL,
      emoji_key TEXT NOT NULL,
      role_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'toggle',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(guild_id, message_id, emoji_key),
      FOREIGN KEY (guild_id) REFERENCES guilds(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    )
  `);

  // Opportunistically prune expired sessions and oauth states on startup.
  db.run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  db.run("DELETE FROM oauth_states WHERE expires_at < datetime('now')");
}

export function upsertGuild(id: string, name: string) {
  db.run(
    `INSERT INTO guilds (id, name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
    [id, name]
  );
}

export function getGuilds(): Guild[] {
  return db.query("SELECT * FROM guilds ORDER BY created_at DESC").all() as Guild[];
}

export function getMappings(guildId?: string): RoleMapping[] {
  if (guildId) {
    return db.query("SELECT * FROM role_mappings WHERE guild_id = ? ORDER BY created_at DESC").all(guildId) as RoleMapping[];
  }
  return db.query("SELECT * FROM role_mappings ORDER BY created_at DESC").all() as RoleMapping[];
}

export function getMappingsForMessage(messageId: string): RoleMapping[] {
  return db.query("SELECT * FROM role_mappings WHERE message_id = ? AND enabled = 1").all(messageId) as RoleMapping[];
}

export function createMapping(data: {
  guild_id: string;
  channel_id: string;
  message_id: string;
  message_url: string;
  emoji_key: string;
  role_id: string;
  mode: string;
  enabled: boolean;
}): RoleMapping {
  const result = db.run(
    `INSERT INTO role_mappings (guild_id, channel_id, message_id, message_url, emoji_key, role_id, mode, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.guild_id, data.channel_id, data.message_id, data.message_url, data.emoji_key, data.role_id, data.mode, data.enabled ? 1 : 0]
  );
  return db.query("SELECT * FROM role_mappings WHERE id = ?").get(result.lastInsertRowid) as RoleMapping;
}

export function updateMapping(
  id: number,
  data: {
    mode?: RoleMapping["mode"];
    enabled?: boolean;
    role_id?: string;
    emoji_key?: string;
  },
) {
  const fields: string[] = [];
  const values: SQLQueryBindings[] = [];
  if (data.mode !== undefined) { fields.push("mode = ?"); values.push(data.mode); }
  if (data.enabled !== undefined) { fields.push("enabled = ?"); values.push(data.enabled ? 1 : 0); }
  if (data.role_id !== undefined) { fields.push("role_id = ?"); values.push(data.role_id); }
  if (data.emoji_key !== undefined) { fields.push("emoji_key = ?"); values.push(data.emoji_key); }
  if (fields.length === 0) return;
  values.push(id);
  db.run(`UPDATE role_mappings SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function deleteMapping(id: number) {
  db.run("DELETE FROM role_mappings WHERE id = ?", [id]);
}

// --- Sessions ---

const SESSION_TTL_DAYS = 30;

export function createSession(data: {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
}): Session {
  db.run(
    `INSERT INTO sessions (id, user_id, username, avatar, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`,
    [data.id, data.user_id, data.username, data.avatar, `+${SESSION_TTL_DAYS} days`],
  );
  return db
    .query("SELECT * FROM sessions WHERE id = ?")
    .get(data.id) as Session;
}

export function getSession(id: string): Session | null {
  return db
    .query(
      "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')",
    )
    .get(id) as Session | null;
}

export function deleteSession(id: string) {
  db.run("DELETE FROM sessions WHERE id = ?", [id]);
}

// --- OAuth state (CSRF guard) ---

const OAUTH_STATE_TTL_MINUTES = 10;

export function createOAuthState(state: string) {
  db.run(
    `INSERT INTO oauth_states (state, expires_at) VALUES (?, datetime('now', ?))`,
    [state, `+${OAUTH_STATE_TTL_MINUTES} minutes`],
  );
}

export function consumeOAuthState(state: string): boolean {
  const row = db
    .query(
      "SELECT state FROM oauth_states WHERE state = ? AND expires_at > datetime('now')",
    )
    .get(state) as { state: string } | null;
  if (!row) return false;
  db.run("DELETE FROM oauth_states WHERE state = ?", [state]);
  return true;
}
