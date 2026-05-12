# roliep-polie-olie

A self-hosted Discord reaction-role management bot with a web admin UI. React to a message with an emoji and automatically receive a role — all managed through a clean browser interface.

## Stack

- **Backend**: [Bun](https://bun.sh) + TypeScript
- **Bot**: [discord.js](https://discord.js.org) v14
- **API**: [Hono](https://hono.dev)
- **Database**: `bun:sqlite` (SQLite, built into Bun)
- **Admin UI**: React + Vite + Tailwind CSS
- **Deployment**: Docker / Docker Compose

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0 (for local dev)
- [Docker](https://www.docker.com) + Docker Compose (for deployment)
- A Discord application & bot token (see below)

---

## Discord Bot Setup

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name, and click **Create**.
3. Go to the **Bot** tab and click **Add Bot**.
4. Under **Token**, click **Reset Token** and copy the token — this is your `DISCORD_TOKEN`.
5. Copy the **Application ID** from the **General Information** tab — this is your `DISCORD_CLIENT_ID`.

### 2. Enable Privileged Gateway Intents

On the **Bot** tab, enable all three **Privileged Gateway Intents**:

- ✅ Presence Intent
- ✅ Server Members Intent
- ✅ Message Content Intent

### 3. Invite the Bot to Your Server

Use the following URL (replace `YOUR_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268446720&scope=bot
```

Required permissions included in `268446720`:
- **View Channels** — read channel messages
- **Read Message History** — fetch older messages
- **Add Reactions** — optionally react to messages on your behalf
- **Manage Roles** — assign/remove roles from members

### 4. Bot Role Position

The bot's role in your server **must be positioned above any role it manages**. Go to **Server Settings → Roles** and drag the bot's role above the roles you want it to assign.

---

## Local Development

```bash
# 1. Clone and enter the repo
git clone https://github.com/fogo-sh/roliep-polie-olie
cd roliep-polie-olie

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your DISCORD_TOKEN, DISCORD_CLIENT_ID, and ADMIN_TOKEN

# 3. Install backend dependencies
bun install

# 4. Install UI dependencies
cd ui && bun install && cd ..

# 5. Build the UI
cd ui && bun run build && cd ..

# 6. Start the bot + API server
bun run dev
```

The server runs at **http://localhost:3000**.

For UI hot-reload during development, run the Vite dev server separately:

```bash
cd ui && bun run dev
```

This proxies `/api/*` requests to `http://localhost:3000`.

---

## Docker Deployment

```bash
# 1. Copy and fill in environment variables
cp .env.example .env

# 2. Build and start
docker compose up -d

# 3. View logs
docker compose logs -f
```

The admin UI and API are accessible at **http://localhost:3000** (or the `PORT` you set).

SQLite data is persisted to `./data/rolebot.sqlite` via the volume mount.

---

## Admin UI Usage

1. Open `http://localhost:3000` in your browser.
2. Enter your `ADMIN_TOKEN` in the **Admin Token** field and click **Set Token**.
3. Your connected guilds will appear. Click a guild to select it.
4. Use the **Create Reaction-Role Mapping** form to add a new mapping:
   - **Message URL**: Right-click a Discord message → **Copy Message Link**.
   - **Emoji**: Paste a Unicode emoji (e.g. `👍`) or use `<:name:id>` for custom emojis.
   - **Role**: Select from the dropdown (populated from your guild's roles).
   - **Mode**:
     - `toggle` — add role on react, remove on unreact.
     - `add-only` — add role on react, never remove.
     - `remove-on-unreact` — only removes the role when unreacting (does not add).
   - **Add bot reaction** — the bot will add the emoji reaction to the message automatically.
5. Existing mappings are listed at the bottom. You can **enable/disable** or **delete** them.

---

## Limitations

- The bot must share a server with the user (standard Discord bot limitation).
- Custom emoji must belong to a server the bot has access to.
- The admin UI has no multi-user auth — protect it behind a reverse proxy or VPN in production.
- Reaction events for messages sent before the bot joined may not be received if the message is not cached (handled via `Partials`).

discord role giver bot
