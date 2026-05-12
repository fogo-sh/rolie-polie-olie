import { initDb } from "./db.js";
import { createBot } from "./bot.js";
import { createApi } from "./api.js";

const PORT = Number(process.env.PORT ?? 3000);

initDb();
console.log("[db] Database initialized");

const { client, start } = createBot();
const api = createApi(client);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve API routes via Hono
    if (url.pathname.startsWith("/api/")) {
      return api.fetch(req);
    }

    // Serve static UI files
    const uiPath = `${import.meta.dir}/../ui/dist${url.pathname === "/" ? "/index.html" : url.pathname}`;
    const file = Bun.file(uiPath);
    if (await file.exists()) {
      return new Response(file);
    }

    // Fall back to index.html for SPA routing
    const indexFile = Bun.file(`${import.meta.dir}/../ui/dist/index.html`);
    if (await indexFile.exists()) {
      return new Response(indexFile, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[server] Listening on http://localhost:${server.port}`);

await start();
