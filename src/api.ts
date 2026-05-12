import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { Client } from "discord.js";
import {
  getGuilds,
  getMappings,
  createMapping,
  updateMapping,
  deleteMapping,
} from "./db.js";

export function createApi(discordClient: Client) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error("ADMIN_TOKEN is required");

  const app = new Hono();

  app.use("*", cors());
  app.use("/api/*", bearerAuth({ token }));

  // GET /api/guilds
  app.get("/api/guilds", (c) => {
    const guilds = getGuilds();
    return c.json(guilds);
  });

  // GET /api/guilds/:guildId/roles
  app.get("/api/guilds/:guildId/roles", async (c) => {
    const { guildId } = c.req.param();
    try {
      const guild = await discordClient.guilds.fetch(guildId);
      const roles = await guild.roles.fetch();
      const roleList = roles
        .filter((r) => !r.managed && r.id !== guild.id)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
        .sort((a, b) => b.position - a.position);
      return c.json(roleList);
    } catch {
      return c.json({ error: "Guild not found or bot lacks access" }, 404);
    }
  });

  // GET /api/mappings
  app.get("/api/mappings", (c) => {
    const guildId = c.req.query("guildId");
    const mappings = getMappings(guildId);
    return c.json(mappings);
  });

  // POST /api/mappings
  app.post("/api/mappings", async (c) => {
    let body: {
      message_url: string;
      emoji_key: string;
      role_id: string;
      mode: string;
      enabled: boolean;
      add_reaction?: boolean;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Parse Discord message URL
    // Format: https://discord.com/channels/:guildId/:channelId/:messageId
    const urlMatch = body.message_url.match(
      /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/
    );
    if (!urlMatch) {
      return c.json({ error: "Invalid Discord message URL" }, 400);
    }
    const [, guildId, channelId, messageId] = urlMatch;

    // Fetch the message to verify it exists
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return c.json({ error: "Channel not found or not a text channel" }, 400);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = await (channel as any).messages.fetch(messageId);

      // Optionally add the reaction
      if (body.add_reaction) {
        try {
          await message.react(body.emoji_key);
        } catch {
          // Don't fail if we can't react
          console.warn("[api] Could not add reaction to message");
        }
      }
    } catch {
      return c.json({ error: "Could not fetch message. Check bot permissions." }, 400);
    }

    try {
      const mapping = createMapping({
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
        message_url: body.message_url,
        emoji_key: body.emoji_key,
        role_id: body.role_id,
        mode: body.mode ?? "toggle",
        enabled: body.enabled ?? true,
      });
      return c.json(mapping, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes("UNIQUE")) {
        return c.json({ error: "A mapping for this message and emoji already exists" }, 409);
      }
      return c.json({ error: "Failed to create mapping" }, 500);
    }
  });

  // PATCH /api/mappings/:id
  app.patch("/api/mappings/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    let body: Partial<{ mode: string; enabled: boolean; role_id: string }>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    updateMapping(id, body as Parameters<typeof updateMapping>[1]);
    return c.json({ success: true });
  });

  // DELETE /api/mappings/:id
  app.delete("/api/mappings/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
    deleteMapping(id);
    return c.json({ success: true });
  });

  // POST /api/verify-message
  app.post("/api/verify-message", async (c) => {
    let body: { message_url: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const urlMatch = body.message_url.match(
      /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/
    );
    if (!urlMatch) {
      return c.json({ error: "Invalid Discord message URL" }, 400);
    }
    const [, guildId, channelId, messageId] = urlMatch;

    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return c.json({ error: "Channel not found" }, 400);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = await (channel as any).messages.fetch(messageId);
      return c.json({
        valid: true,
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
        content: message.content?.slice(0, 200),
      });
    } catch {
      return c.json({ error: "Could not fetch message. Check bot permissions." }, 400);
    }
  });

  return app;
}
