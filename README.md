# rolie-polie-olie

A self-hosted Discord reaction-role management bot with a web admin UI. React to a message with an emoji and automatically receive a role.

Managed through a web interface, with Discord OAuth for admin access..

- **Backend**: [Bun](https://bun.sh) + TypeScript
- **Bot**: [discord.js](https://discord.js.org)
- **API**: [Hono](https://hono.dev) with typed [RPC client](https://hono.dev/docs/guides/rpc)
- **Database**: `bun:sqlite` (SQLite, built into Bun)
- **Admin UI**: React + [React Router](https://reactrouter.com) (data mode) + Vite + Tailwind CSS
- **Auth**: Discord OAuth2 with a Discord-user-ID allowlist, SQLite-backed sessions
- **Deployment**: Docker / Docker Compose

---

| Variable                    | Required | Description                                                                                  |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `RPO_DISCORD_TOKEN`         | yes      | Bot token from the Bot tab                                                                   |
| `RPO_DISCORD_CLIENT_ID`     | yes      | Application ID from General Information                                                      |
| `RPO_DISCORD_CLIENT_SECRET` | yes      | OAuth2 client secret                                                                         |
| `RPO_PUBLIC_URL`            | yes      | Public-facing URL of this server (e.g. `http://localhost:3000`). Used to build redirect URI. |
| `RPO_ADMIN_USER_IDS`        | yes      | Comma-separated Discord user IDs allowed to sign in                                          |
| `RPO_DATABASE_PATH`         | no       | SQLite path (default `./data/rolebot.sqlite`)                                                |
| `RPO_PORT`                  | no       | HTTP port (default `3000`)                                                                   |
