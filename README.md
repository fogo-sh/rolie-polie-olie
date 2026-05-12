# roliep-polie-olie

A self-hosted Discord reaction-role management bot with a web admin UI. React to a message with an emoji and automatically receive a role — all managed through a clean browser interface, with Discord OAuth for admin access.

## Stack

- **Backend**: [Bun](https://bun.sh) + TypeScript
- **Bot**: [discord.js](https://discord.js.org) v14
- **API**: [Hono](https://hono.dev) with typed [RPC client](https://hono.dev/docs/guides/rpc)
- **Database**: `bun:sqlite` (SQLite, built into Bun)
- **Admin UI**: React + [React Router](https://reactrouter.com) (data mode) + Vite + Tailwind CSS
- **Auth**: Discord OAuth2 with a Discord-user-ID allowlist, SQLite-backed sessions
- **Deployment**: Docker / Docker Compose

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0 (for local dev)
- [Docker](https://www.docker.com) + Docker Compose (for deployment)
- A Discord application & bot token (see below)

---

## Discord Application Setup

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name, and click **Create**.
3. Copy the **Application ID** from **General Information** — this is your `RPO_DISCORD_CLIENT_ID`.

### 2. Configure the Bot

1. Go to the **Bot** tab and click **Add Bot**.
2. Under **Token**, click **Reset Token** and copy the token — this is your `RPO_DISCORD_TOKEN`.
3. Enable the **Server Members Intent** under **Privileged Gateway Intents**. This is required so the bot can fetch guild members and assign roles. The other two privileged intents (Presence, Message Content) are not needed.

### 3. Configure OAuth2 (admin login)

1. Go to the **OAuth2** tab.
2. Under **Client Secret**, click **Reset Secret** and copy it — this is your `RPO_DISCORD_CLIENT_SECRET`.
3. Under **Redirects**, add the callback URL:
   - For local dev: `http://localhost:3000/api/auth/discord/callback`
   - For production: `${RPO_PUBLIC_URL}/api/auth/discord/callback`

### 4. Invite the Bot to Your Server

Use the following URL (replace `YOUR_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268446720&scope=bot
```

Permissions included in `268446720`:

- **View Channels** — read channel messages
- **Read Message History** — fetch older messages
- **Add Reactions** — optionally react to messages on your behalf
- **Manage Roles** — assign/remove roles from members

### 5. Bot Role Position

The bot's role in your server **must be positioned above any role it manages**. Go to **Server Settings → Roles** and drag the bot's role above the roles you want it to assign.

### 6. Find Your Discord User ID

You'll need this for `RPO_ADMIN_USER_IDS`:

1. In Discord, enable **Settings → Advanced → Developer Mode**.
2. Right-click your username anywhere and choose **Copy User ID**.

Add a comma-separated list of user IDs to `RPO_ADMIN_USER_IDS`. Only these users will be able to sign in to the admin UI.

---

## Environment Variables

All env vars are prefixed with `RPO_`:

| Variable                     | Required | Description                                                                                  |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `RPO_DISCORD_TOKEN`          | yes      | Bot token from the Bot tab                                                                   |
| `RPO_DISCORD_CLIENT_ID`      | yes      | Application ID from General Information                                                      |
| `RPO_DISCORD_CLIENT_SECRET`  | yes      | OAuth2 client secret                                                                         |
| `RPO_PUBLIC_URL`             | yes      | Public-facing URL of this server (e.g. `http://localhost:3000`). Used to build redirect URI. |
| `RPO_ADMIN_USER_IDS`         | yes      | Comma-separated Discord user IDs allowed to sign in                                          |
| `RPO_DATABASE_PATH`          | no       | SQLite path (default `./data/rolebot.sqlite`)                                                |
| `RPO_PORT`                   | no       | HTTP port (default `3000`)                                                                   |

---

## Local Development

```bash
# 1. Clone and enter the repo
git clone https://github.com/fogo-sh/roliep-polie-olie
cd roliep-polie-olie

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum: RPO_DISCORD_TOKEN, RPO_DISCORD_CLIENT_ID,
# RPO_DISCORD_CLIENT_SECRET, RPO_PUBLIC_URL, RPO_ADMIN_USER_IDS

# 3. Install dependencies
bun install
cd ui && bun install && cd ..

# 4. Build the UI
cd ui && bun run build && cd ..

# 5. Start the bot + API server
bun run dev
```

The server runs at **http://localhost:3000**.

### UI hot-reload

For Vite hot-reload during UI development:

```bash
cd ui && bun run dev
```

Vite serves on http://localhost:5173 and proxies `/api/*` to http://localhost:3000.

> **Note on OAuth during dev with Vite:** because OAuth redirects use `RPO_PUBLIC_URL`, you have two options when running Vite alongside the API server:
>
> 1. **Recommended:** browse via the API server at http://localhost:3000 (UI is served from `ui/dist`, no HMR). Set `RPO_PUBLIC_URL=http://localhost:3000`.
> 2. To use Vite HMR through OAuth, set `RPO_PUBLIC_URL=http://localhost:5173` and add `http://localhost:5173/api/auth/discord/callback` as a redirect in your Discord app. Vite's proxy forwards the callback to the API server, and the session cookie is set on the Vite origin where it persists.

---

## Docker Deployment

```bash
cp .env.example .env
# Edit .env, then:
docker compose up -d
docker compose logs -f
```

The admin UI and API are accessible at the URL you put in `RPO_PUBLIC_URL`.

SQLite data is persisted to `./data/rolebot.sqlite` via the volume mount.

---

## Admin UI Usage

1. Open `RPO_PUBLIC_URL` in your browser.
2. Click **Continue with Discord** to sign in. Only user IDs listed in `RPO_ADMIN_USER_IDS` will be allowed.
3. Your connected guilds will appear. Click a guild to select it.
4. Use the **Create Reaction-Role Mapping** form:
   - **Message URL**: Right-click a Discord message → **Copy Message Link**.
   - **Emoji**: Paste a Unicode emoji (e.g. `👍`) or use `<:name:id>` for custom emojis.
   - **Role**: Select from the dropdown (populated from the guild's roles).
   - **Mode**:
     - `toggle` — add role on react, remove on unreact.
     - `add-only` — add role on react, never remove.
     - `remove-on-unreact` — only removes the role when unreacting (does not add).
   - **Add bot reaction** — the bot will add the emoji reaction to the message automatically.
5. Existing mappings are listed at the bottom. You can **enable/disable** or **delete** them.

---

## Architecture Notes

- **Typed API:** the UI uses [Hono's RPC client](https://hono.dev/docs/guides/rpc) (`hc<AppType>`) so endpoints, params, and response shapes are fully typed end-to-end. Changing a route signature on the backend surfaces as a type error in the UI build.
- **Data-mode routing:** the UI uses `createBrowserRouter` with `loader` and `action` exports — there are no `useEffect` data fetches. Mutations use `useFetcher` for optimistic UI without full navigations.
- **Sessions:** a 32-byte random session ID is stored in an httpOnly cookie and a `sessions` row in SQLite. Sessions expire after 30 days. The `oauth_states` table guards the OAuth flow against CSRF.

---

## Limitations

- The bot must share a server with the user (standard Discord bot limitation).
- Custom emoji must belong to a server the bot has access to.
- Reaction events for messages sent before the bot joined may not be received if the message is not cached (handled via `Partials`).
