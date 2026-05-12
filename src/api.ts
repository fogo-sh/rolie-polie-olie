import { Hono } from "hono";
import { cors } from "hono/cors";
import { validator } from "hono/validator";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { Client } from "discord.js";
import {
  getGuilds,
  getMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  createSession,
  getSession,
  deleteSession,
  createOAuthState,
  consumeOAuthState,
  type Session,
} from "./db.js";

const MESSAGE_URL_RE = /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
const SESSION_COOKIE = "rpo_session";

const MODES = ["toggle", "add-only", "remove-on-unreact"] as const;
type Mode = (typeof MODES)[number];

interface CreateMappingInput {
  message_url: string;
  emoji_key: string;
  role_id: string;
  mode?: Mode;
  enabled?: boolean;
  add_reaction?: boolean;
}

interface UpdateMappingInput {
  mode?: Mode;
  enabled?: boolean;
  role_id?: string;
}

// Lightweight JSON validators. Using `hono/validator` is what wires up the
// body types for the RPC client; the runtime check is intentionally minimal
// since this is a single-tenant admin API.
const createMappingValidator = validator(
  "json",
  (value, c): CreateMappingInput | Response => {
    const v = value as Partial<CreateMappingInput>;
    if (
      typeof v?.message_url !== "string" ||
      typeof v?.emoji_key !== "string" ||
      typeof v?.role_id !== "string"
    ) {
      return c.json({ error: "Invalid body" }, 400);
    }
    return v as CreateMappingInput;
  },
);

const updateMappingValidator = validator(
  "json",
  (value): UpdateMappingInput => value as UpdateMappingInput,
);

type Variables = { user: Session };

function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function randomToken(): string {
  // 32 bytes of entropy, hex-encoded.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createApi(discordClient: Client) {
  const clientId = requireEnv("RPO_DISCORD_CLIENT_ID");
  const clientSecret = requireEnv("RPO_DISCORD_CLIENT_SECRET");
  const publicUrl = requireEnv("RPO_PUBLIC_URL").replace(/\/$/, "");
  const allowlist = parseAllowlist(process.env.RPO_ADMIN_USER_IDS);
  if (allowlist.size === 0) {
    throw new Error(
      "RPO_ADMIN_USER_IDS must contain at least one Discord user ID",
    );
  }

  const redirectUri = `${publicUrl}/api/auth/discord/callback`;
  const isHttps = publicUrl.startsWith("https://");

  // Auth middleware: resolves the session from the cookie and rejects with 401
  // if the request is not authenticated. Only applied to /api/* routes that
  // require auth; the OAuth routes themselves are unprotected.
  const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (
    c,
    next,
  ) => {
    const sid = getCookie(c, SESSION_COOKIE);
    const session = sid ? getSession(sid) : null;
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", session);
    await next();
  };

  // Chain all routes on a single app so `typeof routes` captures every route
  // signature for the Hono RPC client.
  const routes = new Hono<{ Variables: Variables }>()
    .use("*", cors({ origin: publicUrl, credentials: true }))

    // --- Auth routes (unprotected) ---

    .get("/api/auth/discord/login", (c) => {
      const state = randomToken();
      createOAuthState(state);
      const url = new URL("https://discord.com/api/oauth2/authorize");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "identify");
      url.searchParams.set("state", state);
      url.searchParams.set("prompt", "none");
      return c.redirect(url.toString());
    })

    .get("/api/auth/discord/callback", async (c) => {
      const code = c.req.query("code");
      const state = c.req.query("state");
      const errParam = c.req.query("error");

      if (errParam) return c.redirect(`/?login_error=${encodeURIComponent(errParam)}`);
      if (!code || !state) return c.redirect("/?login_error=missing_params");
      if (!consumeOAuthState(state))
        return c.redirect("/?login_error=invalid_state");

      // Exchange code for token.
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        console.warn("[auth] token exchange failed:", tokenRes.status);
        return c.redirect("/?login_error=token_exchange_failed");
      }
      const tokenJson = (await tokenRes.json()) as {
        access_token: string;
        token_type: string;
      };

      // Fetch the user.
      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (!userRes.ok) {
        console.warn("[auth] /users/@me failed:", userRes.status);
        return c.redirect("/?login_error=user_fetch_failed");
      }
      const user = (await userRes.json()) as {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      };

      if (!allowlist.has(user.id)) {
        console.warn(`[auth] denied login for ${user.username} (${user.id})`);
        return c.redirect("/?login_error=not_authorized");
      }

      const sessionId = randomToken();
      createSession({
        id: sessionId,
        user_id: user.id,
        username: user.global_name ?? user.username,
        avatar: user.avatar ?? null,
      });

      setCookie(c, SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });

      return c.redirect("/");
    })

    .get("/api/auth/me", requireAuth, (c) => {
      const user = c.get("user");
      return c.json(
        {
          user_id: user.user_id,
          username: user.username,
          avatar: user.avatar,
        },
        200,
      );
    })

    .post("/api/auth/logout", (c) => {
      const sid = getCookie(c, SESSION_COOKIE);
      if (sid) deleteSession(sid);
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.json({ ok: true }, 200);
    })

    // --- Application routes (protected) ---

    .get("/api/guilds", requireAuth, (c) => c.json(getGuilds()))

    .get("/api/guilds/:guildId/roles", requireAuth, async (c) => {
      const { guildId } = c.req.param();
      try {
        const guild = await discordClient.guilds.fetch(guildId);
        const roles = await guild.roles.fetch();
        const roleList = roles
          .filter((r) => !r.managed && r.id !== guild.id)
          .map((r) => ({
            id: r.id,
            name: r.name,
            color: r.hexColor,
            position: r.position,
          }))
          .sort((a, b) => b.position - a.position);
        return c.json(roleList, 200);
      } catch {
        return c.json({ error: "Guild not found or bot lacks access" }, 404);
      }
    })

    .get("/api/mappings", requireAuth, (c) => {
      const guildId = c.req.query("guildId");
      return c.json(getMappings(guildId));
    })

    .post("/api/mappings", requireAuth, createMappingValidator, async (c) => {
      const body = c.req.valid("json");

      const match = body.message_url.match(MESSAGE_URL_RE);
      if (!match) {
        return c.json({ error: "Invalid Discord message URL" }, 400);
      }
      const [, guildId, channelId, messageId] = match;

      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          return c.json({ error: "Channel not found or not a text channel" }, 400);
        }
        const message = await channel.messages.fetch(messageId);

        if (body.add_reaction) {
          try {
            await message.react(body.emoji_key);
          } catch {
            console.warn("[api] Could not add reaction to message");
          }
        }
      } catch {
        return c.json(
          { error: "Could not fetch message. Check bot permissions." },
          400,
        );
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
      } catch (err) {
        if (err instanceof Error && err.message.includes("UNIQUE")) {
          return c.json(
            { error: "A mapping for this message and emoji already exists" },
            409,
          );
        }
        return c.json({ error: "Failed to create mapping" }, 500);
      }
    })

    .patch(
      "/api/mappings/:id",
      requireAuth,
      updateMappingValidator,
      (c) => {
        const id = Number(c.req.param("id"));
        if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
        updateMapping(id, c.req.valid("json"));
        return c.json({ success: true });
      },
    )

    .delete("/api/mappings/:id", requireAuth, (c) => {
      const id = Number(c.req.param("id"));
      if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
      deleteMapping(id);
      return c.json({ success: true });
    });

  return routes;
}

// AppType exported for use by the typed Hono RPC client in the UI.
export type AppType = ReturnType<typeof createApi>;
