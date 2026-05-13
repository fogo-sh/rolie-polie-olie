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
  // Defence-in-depth path-safety check before hono/bun's serveStatic. That
  // middleware already rejects `../` traversal in both raw and percent-encoded
  // forms, but it passes percent-decoded null bytes (%00) through to Bun.file,
  // which throws a 500 with a stack trace. Catch those (plus any other
  // suspicious decoded characters) and serve index.html instead.
  .use("/*", async (c, next) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(c.req.path);
    } catch {
      return c.html(await Bun.file(`${uiRoot}/index.html`).text());
    }
    if (decoded.includes("\0") || decoded.includes("\\")) {
      return c.html(await Bun.file(`${uiRoot}/index.html`).text());
    }
    await next();
  })
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
