import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only middleware so `npm run dev` can serve the real Vercel serverless
// handlers at /api/verify and /api/leaderboard.
function localApiPlugin() {
  return {
    name: "ltcoe-local-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) {
          return next();
        }

        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk;
        });
        req.on("end", async () => {
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (obj) => {
            if (!res.getHeader("Content-Type")) {
              res.setHeader("Content-Type", "application/json");
            }
            res.end(JSON.stringify(obj));
            return res;
          };
          res.send = (obj) =>
            typeof obj === "object" && obj !== null ? res.json(obj) : res.end(String(obj));

          req.body = raw;

          try {
            const parsedUrl = new URL(req.url, "http://localhost");
            req.query = Object.fromEntries(parsedUrl.searchParams.entries());

            const urlPath = parsedUrl.pathname;
            let handlerMod = null;
            if (urlPath === "/api/verify" || urlPath === "/api/verify.js") {
              handlerMod = await server.ssrLoadModule("/api/verify.js");
            } else if (urlPath === "/api/leaderboard" || urlPath === "/api/leaderboard.js") {
              handlerMod = await server.ssrLoadModule("/api/leaderboard.js");
            } else if (urlPath === "/api/solves" || urlPath === "/api/solves.js") {
              handlerMod = await server.ssrLoadModule("/api/solves.js");
            } else {
              return next();
            }
            await handlerMod.default(req, res);
          } catch (err) {
            server.config.logger.error(`[local-api] ${err?.stack || err}`);
            if (!res.writableEnded) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, reason: "server_error" }));
            }
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load every var from .env* (not just VITE_*) into process.env so the
  // serverless handler can read the non-public ones (flags, service key).
  // These stay server-side; only VITE_* reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), localApiPlugin()],
  };
});