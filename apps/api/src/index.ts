import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { appRouter } from "./trpc/router";
import { DATA_DIR, HOST, PORT, WEB_ORIGIN } from "./lib/paths";
import {
  driftAll,
  exportLibrary,
  getMeta,
  installServer,
  listEvents,
  listHarnesses,
  listServers,
  overview,
  recordEvent,
  scanAll,
  scanHarness,
  uninstallServer,
} from "./lib/store";
import { listRegistry } from "./lib/registry";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return WEB_ORIGIN;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return origin;
      }
      return "";
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

const requireToken = async (c: any, next: () => Promise<void>) => {
  const token = process.env.MCPDECK_TOKEN;
  if (!token) return next();
  const header = c.req.header("authorization") ?? "";
  if (header !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
};

app.get("/", (c) =>
  c.json({
    name: "MCP Deck API",
    version: "0.1.0",
    docs: "See README.md",
    endpoints: {
      trpc: "/trpc",
      health: "GET /api/health",
      overview: "GET /api/overview",
      servers: "GET /api/servers",
      harnesses: "GET /api/harnesses",
      drift: "GET /api/drift",
      events: "GET /api/events?limit=50",
      registry: "GET /api/registry?q=search",
      export: "GET /api/export",
      hookSync: "POST /api/hooks/sync",
      hookInstall: "POST /api/hooks/install",
    },
  }),
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    version: "0.1.0",
    uptime: Math.round(process.uptime()),
    dataDir: DATA_DIR,
    lastSyncAt: getMeta("last_sync_at"),
    harnesses: listHarnesses().map((harness) => ({
      id: harness.id,
      name: harness.name,
      detected: harness.detected,
      configPath: harness.configPath,
      serverCount: harness.serverCount,
    })),
  }),
);

app.get("/api/overview", (c) => c.json(overview()));

app.get("/api/servers", (c) => {
  const query = c.req.query("q");
  const harnessId = c.req.query("harness") ?? undefined;
  const transport = c.req.query("transport");
  return c.json(
    listServers({
      query: query || undefined,
      harnessId,
      transport:
        transport === "stdio" || transport === "http" ? transport : undefined,
    }),
  );
});

app.get("/api/harnesses", (c) => c.json(listHarnesses()));

app.get("/api/drift", (c) => c.json(driftAll()));

app.get("/api/events", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json(listEvents(Number.isFinite(limit) ? limit : 50));
});

app.get("/api/registry", (c) => c.json(listRegistry(c.req.query("q") ?? undefined)));

app.get("/api/export", (c) => {
  c.header(
    "Content-Disposition",
    `attachment; filename="mcpdeck-export-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  return c.json(exportLibrary());
});

app.post("/api/hooks/sync", requireToken, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body?.harnessId && typeof body.harnessId === "string") {
    const result = scanHarness(body.harnessId);
    return c.json(result, result.error ? 502 : 200);
  }
  const result = scanAll();
  return c.json(result);
});

app.post("/api/hooks/install", requireToken, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.serverId || !body?.harnessId) {
    return c.json({ error: "serverId and harnessId are required" }, 400);
  }
  try {
    return c.json(installServer(body.serverId, body.harnessId));
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});

app.post("/api/hooks/uninstall", requireToken, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.serverId || !body?.harnessId) {
    return c.json({ error: "serverId and harnessId are required" }, 400);
  }
  try {
    return c.json(uninstallServer(body.serverId, body.harnessId));
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});

app.all("/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({}),
  }),
);

app.notFound((c) => c.json({ error: "Not found", path: c.req.path }, 404));

app.onError((error, c) => {
  console.error("[api]", error);
  recordEvent({
    kind: "sync",
    status: "error",
    message: `API error: ${error.message}`,
  });
  return c.json({ error: error.message }, 500);
});

// First run: mirror the harness configs that already exist on this machine.
if (!getMeta("last_sync_at")) {
  try {
    scanAll();
  } catch (error) {
    console.error("[bootstrap] initial scan failed:", error);
  }
}

const stats = overview();
console.log(
  `\n  MCP Deck API  ·  http://${HOST}:${PORT}\n` +
    `  ${stats.serverCount} servers · ${stats.installCount} installs · ` +
    `${stats.detectedHarnessCount}/${stats.harnessCount} harnesses detected\n` +
    `  data: ${DATA_DIR}\n`,
);

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
  idleTimeout: 60,
});
