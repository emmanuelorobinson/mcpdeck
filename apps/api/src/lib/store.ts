import { existsSync } from "node:fs";
import { basename } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  HARNESSES,
  HARNESS_BY_ID,
  REGISTRY,
  REGISTRY_BY_ID,
  slugify,
  type DriftDTO,
  type EventDTO,
  type HarnessDTO,
  type InstallDTO,
  type OverviewStats,
  type ScanResultDTO,
  type ServerDTO,
  type SyncAllResult,
  type Transport,
} from "@mcpdeck/shared";
import { db } from "../db";
import {
  events,
  installations,
  meta,
  servers,
} from "../db/schema";
import { decryptJson, encryptJson } from "./crypto";
import {
  entriesMatch,
  readHarness,
  resolveConfigPath,
  supportsHarness,
  writeHarnessEntry,
} from "./harness-config";
import { detectRoots } from "./paths";
import {
  createServerInput,
  updateServerInput,
} from "./validation";

type ServerRow = typeof servers.$inferSelect;
type InstallRow = typeof installations.$inferSelect;

type CreateInput = z.infer<typeof createServerInput>;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function keyList(value: string | null | undefined): string[] {
  return parseJson<string[]>(value, []).filter(
    (key): key is string => typeof key === "string" && key.length > 0,
  );
}

function cleanRecord(record?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    const trimmed = key.trim();
    if (trimmed) result[trimmed] = value;
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function entryForRow(row: ServerRow) {
  const env = decryptJson<Record<string, string>>(row.envEnc, {});
  const headers = decryptJson<Record<string, string>>(row.headerEnc, {});

  return {
    transport: row.transport as Transport,
    command: row.transport === "stdio" ? (row.command ?? undefined) : undefined,
    args: row.transport === "stdio" ? parseJson<string[]>(row.args, []) : [],
    url: row.transport === "http" ? (row.url ?? undefined) : undefined,
    env: row.transport === "stdio" && Object.keys(env).length ? env : undefined,
    headers:
      row.transport === "http" && Object.keys(headers).length
        ? headers
        : undefined,
    enabled: true,
  };
}

type FingerprintInput = {
  transport: Transport;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
};

function normalizeCommand(command?: string | null): string {
  const value = (command ?? "").trim().replace(/\\/g, "/");
  if (!value) return "";
  return basename(value).toLowerCase();
}

function normalizeArg(arg: string): string {
  const value = arg.trim();
  if (!value) return "";
  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    const at = value.indexOf("@", slash + 1);
    const name = slash > 0 && at > slash ? value.slice(0, at) : value;
    return name.toLowerCase();
  }
  const at = value.indexOf("@");
  if (
    at > 0 &&
    !value.includes("/") &&
    /^[a-z0-9._-]+$/i.test(value.slice(0, at))
  ) {
    return value.slice(0, at).toLowerCase();
  }
  return value;
}

function normalizeUrl(url?: string | null): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${path}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

/**
 * Stable identity for the same server appearing under different names in
 * different harnesses. Runner flags and package versions are ignored so
 * `npx -y pkg@1` and `npx pkg` resolve to the same entry.
 */
function fingerprint(input: FingerprintInput): string | null {
  if (input.transport === "http") {
    const url = normalizeUrl(input.url);
    return url ? `http:${url}` : null;
  }
  if (input.transport === "stdio") {
    const command = normalizeCommand(input.command);
    if (!command) return null;
    const args = (input.args ?? [])
      .map((arg) => arg.trim())
      .filter((arg) => arg && arg !== "-y" && arg !== "--yes")
      .map(normalizeArg)
      .join("\u0000");
    return `stdio:${command}:${args}`;
  }
  return null;
}

function fingerprintRow(row: ServerRow): string | null {
  return fingerprint({
    transport: row.transport as Transport,
    command: row.command,
    args: parseJson<string[]>(row.args, []),
    url: row.url,
  });
}

function findServerByFingerprint(
  input: FingerprintInput,
  exclude: Set<string> = new Set(),
): ServerRow | undefined {
  const target = fingerprint(input);
  if (!target) return undefined;
  return db
    .select()
    .from(servers)
    .all()
    .find((row) => !exclude.has(row.id) && fingerprintRow(row) === target);
}

function missingRequired(row: ServerRow): string[] {
  const env = decryptJson<Record<string, string>>(row.envEnc, {});
  const headers = decryptJson<Record<string, string>>(row.headerEnc, {});
  return [
    ...keyList(row.requiredEnv).filter((key) => !env[key]?.trim()),
    ...keyList(row.requiredHeaders)
      .filter((key) => !headers[key]?.trim())
      .map((key) => `${key} (header)`),
  ];
}

function installDTO(row: InstallRow, slug: string): InstallDTO {
  return {
    harnessId: row.harnessId,
    enabled: row.enabled === 1,
    configKey: row.configKey || slug,
    configPath: row.configPath,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

function toDTO(row: ServerRow, installs: InstallRow[]): ServerDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    transport: row.transport as Transport,
    command: row.command,
    args: parseJson<string[]>(row.args, []),
    url: row.url,
    envKeys: keyList(row.envKeys),
    headerKeys: keyList(row.headerKeys),
    requiredEnv: keyList(row.requiredEnv),
    requiredHeaders: keyList(row.requiredHeaders),
    missingRequired: missingRequired(row),
    category: row.category,
    tags: parseJson<string[]>(row.tags, []),
    homepage: row.homepage,
    repository: row.repository,
    source: row.source as ServerDTO["source"],
    isFavorite: row.isFavorite === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    installs: installs.map((install) => installDTO(install, row.slug)),
  };
}

function requireRow(id: string): ServerRow {
  const row = db.select().from(servers).where(eq(servers.id, id)).all()[0];
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Server not found." });
  }
  return row;
}

function uniqueSlug(name: string): string {
  const base = slugify(name) || "server";
  let candidate = base;
  let counter = 2;
  while (
    db.select().from(servers).where(eq(servers.slug, candidate)).all().length
  ) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function assertValidConfig(
  transport: Transport,
  command: string | null,
  url: string | null,
) {
  if (transport === "stdio" && !command?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A stdio server needs a command.",
    });
  }
  if (transport === "http") {
    if (!url?.trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A remote server needs a URL.",
      });
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The URL must start with http:// or https://.",
      });
    }
  }
}

export function getMeta(key: string): string | null {
  return db.select().from(meta).where(eq(meta.key, key)).all()[0]?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db.insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } })
    .run();
}

export function recordEvent(input: {
  kind: EventDTO["kind"];
  status?: EventDTO["status"];
  harnessId?: string | null;
  serverId?: string | null;
  serverName?: string | null;
  message: string;
}) {
  db.insert(events)
    .values({
      id: crypto.randomUUID(),
      kind: input.kind,
      status: input.status ?? "success",
      harnessId: input.harnessId ?? null,
      serverId: input.serverId ?? null,
      serverName: input.serverName ?? null,
      message: input.message,
      createdAt: Date.now(),
    })
    .run();
}

export function listEvents(limit = 50): EventDTO[] {
  return db
    .select()
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind as EventDTO["kind"],
      status: row.status as EventDTO["status"],
      harnessId: row.harnessId,
      serverId: row.serverId,
      serverName: row.serverName,
      message: row.message,
      createdAt: row.createdAt,
    }));
}

export function listServers(filter?: {
  query?: string;
  category?: string;
  transport?: Transport;
  harnessId?: string;
  favoritesOnly?: boolean;
  needsSetupOnly?: boolean;
}): ServerDTO[] {
  const rows = db
    .select()
    .from(servers)
    .orderBy(desc(servers.isFavorite), desc(servers.updatedAt))
    .all();
  const installRows = db.select().from(installations).all();
  const installsByServer = new Map<string, InstallRow[]>();
  for (const install of installRows) {
    const list = installsByServer.get(install.serverId) ?? [];
    list.push(install);
    installsByServer.set(install.serverId, list);
  }

  const query = filter?.query?.trim().toLowerCase();
  let result = rows.map((row) => toDTO(row, installsByServer.get(row.id) ?? []));

  if (query) {
    result = result.filter((server) => {
      const haystack = [
        server.name,
        server.slug,
        server.description,
        server.category,
        server.command,
        server.url,
        ...server.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }
  if (filter?.category && filter.category !== "All") {
    result = result.filter((server) => server.category === filter.category);
  }
  if (filter?.transport) {
    result = result.filter((server) => server.transport === filter.transport);
  }
  if (filter?.harnessId) {
    result = result.filter((server) =>
      server.installs.some(
        (install) => install.harnessId === filter.harnessId,
      ),
    );
  }
  if (filter?.favoritesOnly) {
    result = result.filter((server) => server.isFavorite);
  }
  if (filter?.needsSetupOnly) {
    const needsSetup = new Set(
      rows.filter((row) => missingRequired(row).length > 0).map((row) => row.id),
    );
    result = result.filter((server) => needsSetup.has(server.id));
  }
  return result;
}

export function getServer(id: string): ServerDTO {
  const row = requireRow(id);
  const installs = db
    .select()
    .from(installations)
    .where(eq(installations.serverId, id))
    .all();
  return toDTO(row, installs);
}

export function revealServer(id: string) {
  const row = requireRow(id);
  return {
    env: decryptJson<Record<string, string>>(row.envEnc, {}),
    headers: decryptJson<Record<string, string>>(row.headerEnc, {}),
  };
}

export function setFavorite(id: string, value: boolean): ServerDTO {
  requireRow(id);
  db.update(servers)
    .set({ isFavorite: value ? 1 : 0, updatedAt: Date.now() })
    .where(eq(servers.id, id))
    .run();
  return getServer(id);
}

export function createServer(input: CreateInput): ServerDTO {
  const transport = input.transport;
  const command = input.command?.trim() || null;
  const url = input.url?.trim() || null;
  assertValidConfig(transport, command, url);

  const env = cleanRecord(input.env);
  const headers = cleanRecord(input.headers);
  const requiredEnv = unique(input.requiredEnv ?? []);
  const requiredHeaders = unique(input.requiredHeaders ?? []);
  const envKeys = unique([...(input.envKeys ?? []), ...Object.keys(env)]);
  const headerKeys = unique([
    ...(input.headerKeys ?? []),
    ...Object.keys(headers),
  ]);
  const now = Date.now();
  const id = crypto.randomUUID();
  const slug = uniqueSlug(input.name);

  db.insert(servers)
    .values({
      id,
      name: input.name,
      slug,
      description: input.description,
      transport,
      command: transport === "stdio" ? command : null,
      args: JSON.stringify(transport === "stdio" ? input.args : []),
      url: transport === "http" ? url : null,
      envEnc: encryptJson(env),
      envKeys: JSON.stringify(envKeys),
      headerEnc: encryptJson(headers),
      headerKeys: JSON.stringify(headerKeys),
      requiredEnv: JSON.stringify(requiredEnv),
      requiredHeaders: JSON.stringify(requiredHeaders),
      category: input.category,
      tags: JSON.stringify(unique(input.tags)),
      homepage: input.homepage || null,
      repository: input.repository || null,
      source: "manual",
      sourceId: null,
      isFavorite: input.isFavorite ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  recordEvent({
    kind: "create",
    serverId: id,
    serverName: input.name,
    message: `Added ${input.name} to the library`,
  });

  return getServer(id);
}

export function updateServer(
  input: z.infer<typeof updateServerInput>,
): ServerDTO {
  const row = requireRow(input.id);
  const transport = (input.transport ?? row.transport) as Transport;
  const command =
    input.command !== undefined
      ? input.command.trim() || null
      : row.command;
  const url =
    input.url !== undefined ? input.url.trim() || null : row.url;
  assertValidConfig(transport, command, url);

  const envExisting = decryptJson<Record<string, string>>(row.envEnc, {});
  const env = { ...envExisting, ...cleanRecord(input.env) };
  for (const key of input.removeEnvKeys ?? []) delete env[key];

  const headersExisting = decryptJson<Record<string, string>>(
    row.headerEnc,
    {},
  );
  const headers = { ...headersExisting, ...cleanRecord(input.headers) };
  for (const key of input.removeHeaderKeys ?? []) delete headers[key];

  const requiredEnv =
    input.requiredEnv !== undefined
      ? unique(input.requiredEnv)
      : keyList(row.requiredEnv);
  const requiredHeaders =
    input.requiredHeaders !== undefined
      ? unique(input.requiredHeaders)
      : keyList(row.requiredHeaders);

  const envKeys = unique([
    ...(input.envKeys !== undefined ? input.envKeys : keyList(row.envKeys)),
    ...Object.keys(env),
  ]).filter((key) => !(input.removeEnvKeys ?? []).includes(key));

  const headerKeys = unique([
    ...(input.headerKeys !== undefined
      ? input.headerKeys
      : keyList(row.headerKeys)),
    ...Object.keys(headers),
  ]).filter((key) => !(input.removeHeaderKeys ?? []).includes(key));

  const now = Date.now();
  db.update(servers)
    .set({
      name: input.name ?? row.name,
      description: input.description ?? row.description,
      transport,
      command: transport === "stdio" ? command : null,
      args:
        input.args !== undefined
          ? JSON.stringify(transport === "stdio" ? input.args : [])
          : row.args,
      url: transport === "http" ? url : null,
      envEnc: encryptJson(env),
      envKeys: JSON.stringify(envKeys),
      headerEnc: encryptJson(headers),
      headerKeys: JSON.stringify(headerKeys),
      requiredEnv: JSON.stringify(requiredEnv),
      requiredHeaders: JSON.stringify(requiredHeaders),
      category: input.category ?? row.category,
      tags:
        input.tags !== undefined
          ? JSON.stringify(unique(input.tags))
          : row.tags,
      homepage:
        input.homepage !== undefined ? input.homepage || null : row.homepage,
      repository:
        input.repository !== undefined
          ? input.repository || null
          : row.repository,
      isFavorite:
        input.isFavorite !== undefined
          ? input.isFavorite
            ? 1
            : 0
          : row.isFavorite,
      updatedAt: now,
    })
    .where(eq(servers.id, row.id))
    .run();

  recordEvent({
    kind: "update",
    serverId: row.id,
    serverName: input.name ?? row.name,
    message: `Updated ${input.name ?? row.name}`,
  });

  return getServer(row.id);
}

export function deleteServer(id: string, removeFromHarnesses = true): boolean {
  const row = requireRow(id);
  const installs = db
    .select()
    .from(installations)
    .where(eq(installations.serverId, id))
    .all();

  if (removeFromHarnesses) {
    for (const install of installs) {
      try {
        const configPath = resolveConfigPath(install.harnessId);
        if (existsSync(configPath)) {
          writeHarnessEntry(
            install.harnessId,
            install.configKey || row.slug,
            null,
          );
        }
      } catch {
        // The library row still gets deleted; the harness can be fixed by hand.
      }
    }
  }

  db.delete(installations).where(eq(installations.serverId, id)).run();
  db.delete(servers).where(eq(servers.id, id)).run();

  recordEvent({
    kind: "delete",
    serverId: null,
    serverName: row.name,
    message: `Removed ${row.name} from the library${
      removeFromHarnesses ? " and its harness configs" : ""
    }`,
  });
  return true;
}

function upsertInstallation(input: {
  serverId: string;
  harnessId: string;
  configKey: string;
  configPath: string;
  enabled: boolean;
}) {
  const now = Date.now();
  db.insert(installations)
    .values({
      id: crypto.randomUUID(),
      serverId: input.serverId,
      harnessId: input.harnessId,
      enabled: input.enabled ? 1 : 0,
      configKey: input.configKey,
      configPath: input.configPath,
      installedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [installations.serverId, installations.harnessId],
      set: {
        enabled: input.enabled ? 1 : 0,
        configKey: input.configKey,
        configPath: input.configPath,
        updatedAt: now,
      },
    })
    .run();
}

export function installServer(serverId: string, harnessId: string) {
  const row = requireRow(serverId);
  if (!supportsHarness(harnessId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported harness: ${harnessId}`,
    });
  }

  const missing = missingRequired(row);
  if (missing.length) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Add the required values first: ${missing.join(", ")}`,
    });
  }

  const existing = db
    .select()
    .from(installations)
    .where(eq(installations.serverId, row.id))
    .all()
    .find((install) => install.harnessId === harnessId);

  const configKey = existing?.configKey || row.slug;
  const entry = entryForRow(row);
  const snapshot = readHarness(harnessId);
  const targetKey =
    snapshot.entries[configKey] || !snapshot.entries[row.slug]
      ? configKey
      : row.slug;

  const result = writeHarnessEntry(harnessId, targetKey, entry);
  upsertInstallation({
    serverId: row.id,
    harnessId,
    configKey: targetKey,
    configPath: result.path,
    enabled: true,
  });

  recordEvent({
    kind: "install",
    harnessId,
    serverId: row.id,
    serverName: row.name,
    message: `Installed ${row.name} into ${HARNESS_BY_ID[harnessId]?.name ?? harnessId}`,
  });

  return {
    ok: true as const,
    configPath: result.path,
    backupPath: result.backupPath,
    warning: null as string | null,
  };
}

export function uninstallServer(serverId: string, harnessId: string) {
  const row = requireRow(serverId);
  const existing = db
    .select()
    .from(installations)
    .where(eq(installations.serverId, row.id))
    .all()
    .find((install) => install.harnessId === harnessId);

  const configKey = existing?.configKey || row.slug;
  const configPath = resolveConfigPath(harnessId);
  let backupPath: string | null = null;

  if (existsSync(configPath)) {
    const snapshot = readHarness(harnessId);
    if (snapshot.entries[configKey]) {
      const result = writeHarnessEntry(harnessId, configKey, null);
      backupPath = result.backupPath;
    }
  }

  db.delete(installations)
    .where(
      and(
        eq(installations.serverId, row.id),
        eq(installations.harnessId, harnessId),
      ),
    )
    .run();

  recordEvent({
    kind: "uninstall",
    harnessId,
    serverId: row.id,
    serverName: row.name,
    message: `Removed ${row.name} from ${HARNESS_BY_ID[harnessId]?.name ?? harnessId}`,
  });

  return { ok: true as const, configPath, backupPath };
}

export function repairHarness(harnessId: string) {
  const scan = scanHarness(harnessId);
  try {
    const snapshot = readHarness(harnessId);
    const installs = db
      .select()
      .from(installations)
      .where(eq(installations.harnessId, harnessId))
      .all();
    const allServers = db.select().from(servers).all();
    const byId = new Map(allServers.map((row) => [row.id, row]));

    let repaired = 0;
    let skipped = 0;

    for (const install of installs) {
      const row = byId.get(install.serverId);
      if (!row) {
        skipped += 1;
        continue;
      }
      const key = install.configKey || row.slug;
      const configEntry = snapshot.entries[key];
      if (configEntry && entriesMatch(entryForRow(row), configEntry)) {
        continue;
      }
      if (missingRequired(row).length) {
        skipped += 1;
        continue;
      }
      try {
        installServer(row.id, harnessId);
        repaired += 1;
      } catch {
        skipped += 1;
      }
    }

    return {
      harnessId,
      repaired,
      skipped,
      imported: scan.imported,
    };
  } catch (error) {
    return {
      harnessId,
      repaired: 0,
      skipped: 0,
      imported: scan.imported,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function repairAll() {
  return HARNESSES.map((harness) => repairHarness(harness.id));
}

export function pushServer(serverId: string) {
  const row = requireRow(serverId);
  const installs = db
    .select()
    .from(installations)
    .where(eq(installations.serverId, row.id))
    .all();
  const entry = entryForRow(row);
  let pushed = 0;

  for (const install of installs) {
    if (!supportsHarness(install.harnessId)) continue;
    const result = writeHarnessEntry(
      install.harnessId,
      install.configKey || row.slug,
      entry,
    );
    upsertInstallation({
      serverId: row.id,
      harnessId: install.harnessId,
      configKey: install.configKey || row.slug,
      configPath: result.path,
      enabled: install.enabled === 1,
    });
    pushed += 1;
  }

  recordEvent({
    kind: "update",
    serverId: row.id,
    serverName: row.name,
    message: `Pushed ${row.name} to ${pushed} harness${pushed === 1 ? "" : "es"}`,
  });

  return { pushed };
}

export function scanHarness(harnessId: string): ScanResultDTO {
  const harnessName = HARNESS_BY_ID[harnessId]?.name ?? harnessId;
  try {
    const snapshot = readHarness(harnessId);
    const existingInstalls = db
      .select()
      .from(installations)
      .where(eq(installations.harnessId, harnessId))
      .all();
    const installsByServer = new Map(
      existingInstalls.map((install) => [install.serverId, install]),
    );
    // Only servers claimed by an entry *during this scan* should block a
    // fingerprint match. Existing installs stay eligible so a rescan under an
    // alias (for example `microsoft/playwright-mcp`) does not create a
    // duplicate library server.
    const matchedServerIds = new Set<string>();
    const knownSlugs = new Set(
      db
        .select({ slug: servers.slug })
        .from(servers)
        .all()
        .map((row) => row.slug),
    );
    const entries = Object.entries(snapshot.entries).sort((a, b) => {
      const aExact = knownSlugs.has(slugify(a[0])) ? 1 : 0;
      const bExact = knownSlugs.has(slugify(b[0])) ? 1 : 0;
      return bExact - aExact;
    });

    let imported = 0;
    let linked = 0;
    let updated = 0;
    let found = 0;
    let skipped = 0;

    for (const [name, entry] of entries) {
      findServer: {
        const slug = slugify(name);
        if (!slug) {
          skipped += 1;
          break findServer;
        }
        found += 1;

        let row: ServerRow | undefined = db
          .select()
          .from(servers)
          .where(eq(servers.slug, slug))
          .all()[0];

        let aliasOfMatched = false;
        if (!row) {
          row = findServerByFingerprint(entry, matchedServerIds);
        }
        if (!row) {
          const alias = findServerByFingerprint(entry);
          if (alias) {
            row = alias;
            aliasOfMatched = true;
          }
        }

        if (!row) {
          const now = Date.now();
          const id = crypto.randomUUID();
          const entryFingerprint = fingerprint(entry);
          const registryMatch =
            REGISTRY.find((item) => item.slug === slug) ??
            REGISTRY.find(
              (item) =>
                entryFingerprint !== null &&
                fingerprint({
                  transport: item.transport,
                  command: item.command,
                  args: item.args,
                  url: item.url,
                }) === entryFingerprint,
            );
          const canonicalSlug = registryMatch?.slug ?? slug;
          const canonicalTaken =
            canonicalSlug !== slug &&
            db
              .select()
              .from(servers)
              .where(eq(servers.slug, canonicalSlug))
              .all().length > 0;
          const insertSlug = canonicalTaken ? slug : canonicalSlug;
          db.insert(servers)
            .values({
              id,
              name,
              slug: insertSlug,
              description:
                registryMatch?.description ?? `Imported from ${harnessName}.`,
              transport: entry.transport,
              command: entry.command ?? null,
              args: JSON.stringify(entry.args ?? []),
              url: entry.url ?? null,
              envEnc: encryptJson(entry.env ?? {}),
              envKeys: JSON.stringify(Object.keys(entry.env ?? {})),
              headerEnc: encryptJson(entry.headers ?? {}),
              headerKeys: JSON.stringify(Object.keys(entry.headers ?? {})),
              requiredEnv: JSON.stringify(
                (registryMatch?.envKeys ?? [])
                  .filter((item) => item.required)
                  .map((item) => item.key),
              ),
              requiredHeaders: JSON.stringify(
                (registryMatch?.headerKeys ?? [])
                  .filter((item) => item.required)
                  .map((item) => item.key),
              ),
              category: registryMatch?.category ?? "General",
              tags: JSON.stringify(
                unique([...(registryMatch?.tags ?? []), "imported"]),
              ),
              homepage: registryMatch?.homepage ?? null,
              repository: registryMatch?.repository ?? null,
              source: "imported",
              sourceId: null,
              isFavorite: 0,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          row = db.select().from(servers).where(eq(servers.id, id)).all()[0];
          if (!row) break findServer;
          imported += 1;
        }

        if (aliasOfMatched) {
          matchedServerIds.add(row.id);
          break findServer;
        }

        const existing = installsByServer.get(row.id);
        if (!existing) {
          upsertInstallation({
            serverId: row.id,
            harnessId,
            configKey: name,
            configPath: snapshot.path,
            enabled: entry.enabled !== false,
          });
          matchedServerIds.add(row.id);
          linked += 1;
        } else {
          if (existing.configKey !== name) {
            db.update(installations)
              .set({ configKey: name, configPath: snapshot.path })
              .where(eq(installations.id, existing.id))
              .run();
            updated += 1;
          }
          if (existing.enabled !== (entry.enabled === false ? 0 : 1)) {
            db.update(installations)
              .set({ enabled: entry.enabled === false ? 0 : 1 })
              .where(eq(installations.id, existing.id))
              .run();
          }
          matchedServerIds.add(row.id);
        }
      }
    }

    const now = Date.now();
    setMeta(`last_sync:${harnessId}`, String(now));
    setMeta("last_sync_at", String(now));

    recordEvent({
      kind: "sync",
      harnessId,
      message: `${harnessName}: ${found} found · ${imported} new · ${linked} linked${
        snapshot.exists ? "" : " (no config file yet)"
      }`,
    });

    return {
      harnessId,
      imported,
      updated,
      linked,
      found,
      skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordEvent({
      kind: "sync",
      status: "error",
      harnessId,
      message: `${harnessName}: ${message}`,
    });
    return {
      harnessId,
      imported: 0,
      updated: 0,
      linked: 0,
      found: 0,
      skipped: 0,
      error: message,
    };
  }
}

export function scanAll(): SyncAllResult {
  const results = HARNESSES.map((harness) => scanHarness(harness.id));
  return { scannedAt: Date.now(), results };
}

export function driftFor(harnessId: string): DriftDTO {
  const harnessName = HARNESS_BY_ID[harnessId]?.name ?? harnessId;
  const base: DriftDTO = {
    harnessId,
    harnessName,
    missingInConfig: [],
    missingInLibrary: [],
    drifted: [],
    inSync: [],
  };

  try {
    const snapshot = readHarness(harnessId);
    const installs = db
      .select()
      .from(installations)
      .where(eq(installations.harnessId, harnessId))
      .all();
    const allServers = db.select().from(servers).all();
    const byId = new Map(allServers.map((row) => [row.id, row]));
    const knownSlugs = new Set(allServers.map((row) => row.slug));
    const configKeys = new Set<string>();

    for (const install of installs) {
      const row = byId.get(install.serverId);
      if (!row) continue;
      const key = install.configKey || row.slug;
      configKeys.add(key);
      const configEntry = snapshot.entries[key];
      if (!configEntry) {
        base.missingInConfig.push(row.name);
        continue;
      }
      if (entriesMatch(entryForRow(row), configEntry)) {
        base.inSync.push(row.name);
      } else {
        base.drifted.push(row.name);
      }
    }

    for (const name of Object.keys(snapshot.entries)) {
      if (configKeys.has(name)) continue;
      if (!knownSlugs.has(slugify(name))) {
        base.missingInLibrary.push(name);
      }
    }
  } catch {
    // A broken config should show up in the harness list, not crash the app.
  }

  return base;
}

export function driftAll(): DriftDTO[] {
  return HARNESSES.map((harness) => driftFor(harness.id));
}

export function listHarnesses(): HarnessDTO[] {
  const installRows = db.select().from(installations).all();

  return HARNESSES.map((harness) => {
    const configPath = resolveConfigPath(harness.id);
    const detected = detectRoots(harness.id).some((root) => existsSync(root));
    let serverCount = 0;
    let configExists = false;
    let error: string | null = null;

    try {
      const snapshot = readHarness(harness.id);
      serverCount = Object.keys(snapshot.entries).length;
      configExists = snapshot.exists;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }

    const managed = installRows.filter(
      (install) => install.harnessId === harness.id,
    );
    const lastSyncedRaw = getMeta(`last_sync:${harness.id}`);

    return {
      ...harness,
      detected: detected || configExists,
      configPath,
      configExists,
      serverCount,
      managedCount: managed.length,
      lastSyncedAt: lastSyncedRaw ? Number(lastSyncedRaw) : null,
      writable: true,
      error,
    };
  });
}

export function overview(): OverviewStats {
  const rows = db.select().from(servers).all();
  const installRows = db.select().from(installations).all();
  const harnesses = listHarnesses();
  const drift = driftAll();
  const lastSyncRaw = getMeta("last_sync_at");

  return {
    serverCount: rows.length,
    installCount: installRows.length,
    harnessCount: harnesses.length,
    detectedHarnessCount: harnesses.filter((harness) => harness.detected).length,
    driftCount: drift.reduce(
      (total, item) =>
        total +
        item.missingInConfig.length +
        item.missingInLibrary.length +
        item.drifted.length,
      0,
    ),
    stdioCount: rows.filter((row) => row.transport === "stdio").length,
    remoteCount: rows.filter((row) => row.transport === "http").length,
    favoriteCount: rows.filter((row) => row.isFavorite === 1).length,
    needsSetupCount: rows.filter((row) => missingRequired(row).length > 0).length,
    lastSyncAt: lastSyncRaw ? Number(lastSyncRaw) : null,
  };
}

export function importFromRegistry(registryId: string): ServerDTO {
  const registry = REGISTRY_BY_ID[registryId];
  if (!registry) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Unknown registry entry.",
    });
  }

  const existing = db
    .select()
    .from(servers)
    .where(eq(servers.slug, registry.slug))
    .all()[0];
  if (existing) return getServer(existing.id);

  const input = createServerInput.parse({
    name: registry.name,
    description: registry.description,
    transport: registry.transport,
    command: registry.command,
    args: registry.args ?? [],
    url: registry.url,
    envKeys: registry.envKeys?.map((item) => item.key) ?? [],
    headerKeys: registry.headerKeys?.map((item) => item.key) ?? [],
    requiredEnv: (registry.envKeys ?? [])
      .filter((item) => item.required)
      .map((item) => item.key),
    requiredHeaders: (registry.headerKeys ?? [])
      .filter((item) => item.required)
      .map((item) => item.key),
    category: registry.category,
    tags: registry.tags,
    homepage: registry.homepage,
    repository: registry.repository,
  });

  const created = createServer(input);
  db.update(servers)
    .set({ source: "registry", sourceId: registry.id })
    .where(eq(servers.id, created.id))
    .run();
  return getServer(created.id);
}

export function exportLibrary() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    secretsIncluded: false,
    servers: listServers(),
  };
}
