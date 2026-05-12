import { Database } from "bun:sqlite";

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

const DB_PATH = process.env.DATABASE_PATH ?? "./data/rolebot.sqlite";

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

export function updateMapping(id: number, data: Partial<Pick<RoleMapping, "mode" | "enabled" | "role_id">>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.mode !== undefined) { fields.push("mode = ?"); values.push(data.mode); }
  if (data.enabled !== undefined) { fields.push("enabled = ?"); values.push(data.enabled ? 1 : 0); }
  if (data.role_id !== undefined) { fields.push("role_id = ?"); values.push(data.role_id); }
  if (fields.length === 0) return;
  values.push(id);
  db.run(`UPDATE role_mappings SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function deleteMapping(id: number) {
  db.run("DELETE FROM role_mappings WHERE id = ?", [id]);
}
