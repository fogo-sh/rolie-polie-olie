import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDb } from "./db.js";
import { createBot } from "./bot.js";
import { createApi } from "./api.js";

const PORT = Number(process.env.RPO_PORT ?? 3000);

initDb();
console.log("[db] Database initialized");

const { client, start } = createBot();
const api = createApi(client);

const uiRoot = `${import.meta.dir}/../ui/dist`;

const app = new Hono()
  .route("/", api)
  // Serve static UI assets, falling back to index.html for SPA routing.
  .use("/*", serveStatic({ root: uiRoot }))
  .use("/*", serveStatic({ root: uiRoot, path: "index.html" }));

const server = Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[server] Listening on http://localhost:${server.port}`);

// Keep the HTTP server up even if Discord login fails — the admin UI is the
// most likely place to see the resulting error message and fix the token.
start().catch((err) => {
  console.error("[bot] Discord login failed:", err);
});
