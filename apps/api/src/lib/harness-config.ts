import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { HarnessFormat, McpEntry } from "@mcpdeck/shared";
import { BACKUP_DIR, configCandidates } from "./paths";

type RawConfig = Record<string, unknown>;
type EntryMap = Record<string, McpEntry>;

type HarnessAdapter = {
  parse: (text: string) => RawConfig;
  serialize: (raw: RawConfig, original?: string) => string;
  read: (raw: RawConfig) => EntryMap;
  write: (raw: RawConfig, entries: EntryMap) => RawConfig;
};

function parseJsonConfig(text: string): RawConfig {
  if (!text.trim()) return {};
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length) {
    const first = errors[0];
    throw new Error(
      `JSON parse error: ${printParseErrorCode(first.error)} at offset ${first.offset}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new Error("Expected the config root to be a JSON object.");
  }
  return parsed;
}

function serializeJsonConfig(
  raw: RawConfig,
  original: string | undefined,
  key: string,
): string {
  if (!original?.trim()) return `${JSON.stringify(raw, null, 2)}\n`;
  const edits = modify(original, [key], raw[key], {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  const next = applyEdits(original, edits);
  return next.endsWith("\n") ? next : `${next}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === "string");
  return result.length ? result : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item;
  }
  return Object.keys(result).length ? result : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item === undefined || item === null) delete value[key];
    else if (Array.isArray(item) && item.length === 0) delete value[key];
    else if (isRecord(item) && Object.keys(item).length === 0) delete value[key];
  }
  return value;
}

function parseStandardEntry(raw: unknown): McpEntry | null {
  if (!isRecord(raw)) return null;
  const enabled = raw.disabled !== true && raw.enabled !== false;
  const headers = stringRecord(raw.headers);
  const url =
    typeof raw.url === "string"
      ? raw.url
      : typeof raw.httpUrl === "string"
        ? raw.httpUrl
        : undefined;

  if (url) {
    return { transport: "http", url, headers, enabled };
  }

  const command =
    typeof raw.command === "string"
      ? raw.command
      : Array.isArray(raw.command) && typeof raw.command[0] === "string"
        ? raw.command[0]
        : undefined;

  if (!command) return null;

  const inlineArgs =
    typeof raw.command === "string" ? undefined : stringArray(raw.command)?.slice(1);

  return {
    transport: "stdio",
    command,
    args: stringArray(raw.args) ?? inlineArgs,
    env: stringRecord(raw.env) ?? stringRecord(raw.environment),
    enabled,
  };
}

function writeStandardEntry(entry: McpEntry): Record<string, unknown> {
  if (entry.transport === "http") {
    return compact({
      type: "http",
      url: entry.url,
      headers: entry.headers,
    });
  }
  return compact({
    command: entry.command,
    args: entry.args,
    env: entry.env,
  });
}

function jsonAdapter(key: string, mode: "standard" | "vscode"): HarnessAdapter {
  return {
    parse: parseJsonConfig,
    serialize: (raw, original) => serializeJsonConfig(raw, original, key),
    read: (raw) => {
      const container = raw[key];
      if (!isRecord(container)) return {};
      const entries: EntryMap = {};
      for (const [name, value] of Object.entries(container)) {
        const entry = parseStandardEntry(value);
        if (entry) entries[name] = entry;
      }
      return entries;
    },
    write: (raw, entries) => {
      const container: Record<string, unknown> = {};
      for (const [name, entry] of Object.entries(entries)) {
        if (mode === "vscode") {
          container[name] = compact({
            type: entry.transport === "http" ? "http" : "stdio",
            command: entry.transport === "stdio" ? entry.command : undefined,
            args: entry.transport === "stdio" ? entry.args : undefined,
            env: entry.transport === "stdio" ? entry.env : undefined,
            url: entry.transport === "http" ? entry.url : undefined,
            headers: entry.transport === "http" ? entry.headers : undefined,
          });
        } else {
          container[name] = writeStandardEntry(entry);
        }
      }
      return { ...raw, [key]: container };
    },
  };
}

const openCodeAdapter: HarnessAdapter = {
  parse: parseJsonConfig,
  serialize: (raw, original) => serializeJsonConfig(raw, original, "mcp"),
  read: (raw) => {
    if (!isRecord(raw.mcp)) return {};
    const entries: EntryMap = {};
    for (const [name, value] of Object.entries(raw.mcp)) {
      if (!isRecord(value)) continue;
      const enabled = value.enabled !== false;
      if (typeof value.url === "string") {
        entries[name] = {
          transport: "http",
          url: value.url,
          headers: stringRecord(value.headers),
          enabled,
        };
        continue;
      }
      const command = Array.isArray(value.command)
        ? stringArray(value.command)
        : typeof value.command === "string"
          ? [value.command]
          : undefined;
      if (!command?.length) continue;
      entries[name] = {
        transport: "stdio",
        command: command[0],
        args: command.slice(1).length ? command.slice(1) : undefined,
        env: stringRecord(value.environment) ?? stringRecord(value.env),
        enabled,
      };
    }
    return entries;
  },
  write: (raw, entries) => {
    const container: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(entries)) {
      container[name] =
        entry.transport === "http"
          ? compact({
              type: "remote",
              url: entry.url,
              headers: entry.headers,
              enabled: entry.enabled !== false,
            })
          : compact({
              type: "local",
              command: [entry.command, ...(entry.args ?? [])].filter(Boolean),
              environment: entry.env,
              enabled: entry.enabled !== false,
            });
    }
    return { ...raw, mcp: container };
  },
};

const codexAdapter: HarnessAdapter = {
  parse: (text) => {
    if (!text.trim()) return {};
    return parseToml(text) as RawConfig;
  },
  serialize: (raw) => stringifyToml(raw),  read: (raw) => {
    if (!isRecord(raw.mcp_servers)) return {};
    const entries: EntryMap = {};
    for (const [name, value] of Object.entries(raw.mcp_servers)) {
      if (!isRecord(value)) continue;
      const enabled = value.enabled !== false;
      if (typeof value.url === "string") {
        entries[name] = {
          transport: "http",
          url: value.url,
          headers: stringRecord(value.http_headers),
          enabled,
        };
        continue;
      }
      if (typeof value.command !== "string") continue;
      entries[name] = {
        transport: "stdio",
        command: value.command,
        args: stringArray(value.args),
        env: stringRecord(value.env),
        enabled,
      };
    }
    return entries;
  },
  write: (raw, entries) => {
    const container: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(entries)) {
      container[name] =
        entry.transport === "http"
          ? compact({
              url: entry.url,
              http_headers: entry.headers,
            })
          : compact({
              command: entry.command,
              args: entry.args,
              env: entry.env,
            });
    }
    return { ...raw, mcp_servers: container };
  },
};

const zedAdapter: HarnessAdapter = {
  parse: parseJsonConfig,
  serialize: (raw, original) =>
    serializeJsonConfig(raw, original, "context_servers"),
  read: (raw) => {
    if (!isRecord(raw.context_servers)) return {};
    const entries: EntryMap = {};
    for (const [name, value] of Object.entries(raw.context_servers)) {
      if (!isRecord(value)) continue;
      if (typeof value.url === "string") {
        entries[name] = {
          transport: "http",
          url: value.url,
          headers: stringRecord(value.headers),
        };
        continue;
      }
      if (isRecord(value.command)) {
        if (typeof value.command.path !== "string") continue;
        entries[name] = {
          transport: "stdio",
          command: value.command.path,
          args: stringArray(value.command.args),
          env: stringRecord(value.command.env),
        };
        continue;
      }
      if (typeof value.command === "string") {
        entries[name] = {
          transport: "stdio",
          command: value.command,
          args: stringArray(value.args),
          env: stringRecord(value.env),
        };
      }
    }
    return entries;
  },
  write: (raw, entries) => {
    const container: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(entries)) {
      container[name] =
        entry.transport === "http"
          ? compact({
              source: "custom",
              url: entry.url,
              headers: entry.headers,
            })
          : compact({
              source: "custom",
              command: compact({
                path: entry.command,
                args: entry.args,
                env: entry.env,
              }),
            });
    }
    return { ...raw, context_servers: container };
  },
};

const standard = (key: string) => jsonAdapter(key, "standard");

const MCP_REMOTE_PACKAGE = /^mcp-remote(?:@[\w.*-]+)?$/;
const BRIDGE_COMMANDS = new Set(["npx", "bunx", "pnpm", "yarn"]);

function bridgeHeaders(
  args: string[],
  env?: Record<string, string>,
): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--header" && args[index] !== "-H") continue;
    const raw = args[index + 1];
    if (!raw) continue;
    const colon = raw.indexOf(":");
    if (colon <= 0) continue;
    const name = raw.slice(0, colon).trim();
    const value = raw
      .slice(colon + 1)
      .trim()
      .replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
        (_, key: string) => env?.[key] ?? "",
      );
    if (name && value) headers[name] = value;
    index += 1;
  }
  return Object.keys(headers).length ? headers : undefined;
}

/** Recognize an mcp-remote stdio bridge and expose it as a remote entry. */
function remoteFromBridge(entry: McpEntry): McpEntry | null {
  if (entry.transport !== "stdio" || !entry.command) return null;
  const command = basename(entry.command)
    .toLowerCase()
    .replace(/\.(cmd|exe)$/, "");
  if (!BRIDGE_COMMANDS.has(command)) return null;

  const args = entry.args ?? [];
  const packageIndex = args.findIndex((arg) => MCP_REMOTE_PACKAGE.test(arg));
  if (packageIndex < 0) return null;

  const remoteArgs = args.slice(packageIndex + 1);
  const url = remoteArgs.find((arg) => /^https?:\/\//i.test(arg));
  if (!url) return null;

  return {
    transport: "http",
    url,
    headers: bridgeHeaders(remoteArgs, entry.env),
    enabled: entry.enabled,
  };
}

function bridgeEnvKey(name: string, index: number, used: Set<string>): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = `MCPDECK_HEADER_${slug || index + 1}`;
  let key = base;
  let suffix = 2;
  while (used.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

/**
 * Claude Desktop only launches stdio servers from claude_desktop_config.json.
 * Remote entries are written as an `npx mcp-remote` bridge. Header values use
 * env indirection so they never appear in the process arguments.
 */
function bridgeFromRemote(entry: McpEntry): McpEntry {
  if (entry.transport !== "http" || !entry.url) return entry;

  const args = ["-y", "mcp-remote@latest", entry.url];
  if (/^http:\/\//i.test(entry.url)) args.push("--allow-http");

  const env: Record<string, string> = {};
  const used = new Set<string>();
  for (const [name, value] of Object.entries(entry.headers ?? {}).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const key = bridgeEnvKey(name, Object.keys(env).length, used);
    env[key] = value;
    args.push("--header", `${name}:\${${key}}`);
  }

  return {
    transport: "stdio",
    command: "npx",
    args,
    env: Object.keys(env).length ? env : undefined,
    enabled: entry.enabled,
  };
}

const claudeDesktopBase = jsonAdapter("mcpServers", "standard");
const claudeDesktopAdapter: HarnessAdapter = {
  parse: claudeDesktopBase.parse,
  serialize: claudeDesktopBase.serialize,
  read: (raw) => {
    const entries = claudeDesktopBase.read(raw);
    for (const [name, entry] of Object.entries(entries)) {
      entries[name] = remoteFromBridge(entry) ?? entry;
    }
    return entries;
  },
  write: (raw, entries) => {
    const mapped: EntryMap = {};
    for (const [name, entry] of Object.entries(entries)) {
      mapped[name] = bridgeFromRemote(entry);
    }
    return claudeDesktopBase.write(raw, mapped);
  },
};

const ADAPTERS: Record<string, HarnessAdapter> = {
  "claude-code": standard("mcpServers"),
  "claude-desktop": claudeDesktopAdapter,
  cursor: standard("mcpServers"),
  windsurf: standard("mcpServers"),
  "gemini-cli": standard("mcpServers"),
  cline: standard("mcpServers"),
  pi: standard("mcpServers"),
  vscode: jsonAdapter("servers", "vscode"),
  "vscode-insiders": jsonAdapter("servers", "vscode"),
  opencode: openCodeAdapter,
  codex: codexAdapter,
  zed: zedAdapter,
};

const FORMAT_BY_HARNESS: Record<string, HarnessFormat> = {
  "claude-code": "mcpServers",
  "claude-desktop": "mcpServers",
  cursor: "mcpServers",
  windsurf: "mcpServers",
  "gemini-cli": "mcpServers",
  cline: "mcpServers",
  pi: "mcpServers",
  vscode: "vscode",
  "vscode-insiders": "vscode",
  opencode: "opencode",
  codex: "codex",
  zed: "zed",
};

export function supportsHarness(harnessId: string): boolean {
  return Boolean(ADAPTERS[harnessId]);
}

export function resolveConfigPath(harnessId: string): string {
  const candidates = configCandidates(harnessId);
  if (!candidates.length) {
    throw new Error(`Unknown harness: ${harnessId}`);
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function adapterFor(harnessId: string): HarnessAdapter {
  const adapter = ADAPTERS[harnessId];
  if (!adapter) throw new Error(`Unsupported harness: ${harnessId}`);
  return adapter;
}

export type HarnessSnapshot = {
  harnessId: string;
  path: string;
  exists: boolean;
  entries: EntryMap;
  raw: RawConfig;
  text: string;
};

export function readHarness(harnessId: string): HarnessSnapshot {
  const path = resolveConfigPath(harnessId);
  const adapter = adapterFor(harnessId);

  if (!existsSync(path)) {
    return {
      harnessId,
      path,
      exists: false,
      entries: {},
      raw: {},
      text: "",
    };
  }

  const text = readFileSync(path, "utf8");
  let raw: RawConfig;
  try {
    raw = adapter.parse(text);
  } catch (error) {
    throw new Error(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    harnessId,
    path,
    exists: true,
    entries: adapter.read(raw),
    raw,
    text,
  };
}

function pruneBackups(dir: string, keep = 25) {
  try {
    const files = readdirSync(dir)
      .filter((file) => !file.startsWith("."))
      .map((file) => ({ file, time: statSync(join(dir, file)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const stale of files.slice(keep)) {
      unlinkSync(join(dir, stale.file));
    }
  } catch {
    // backups are best-effort
  }
}

function backupConfig(harnessId: string, path: string): string | null {
  if (!existsSync(path)) return null;
  const dir = join(BACKUP_DIR, harnessId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(dir, `${stamp}--${basename(path)}`);
  copyFileSync(path, destination);
  pruneBackups(dir);
  return destination;
}

export type WriteResult = {
  path: string;
  backupPath: string | null;
  created: boolean;
};

export function writeHarnessEntries(
  harnessId: string,
  entries: EntryMap,
): WriteResult {
  const snapshot = readHarness(harnessId);
  const adapter = adapterFor(harnessId);
  const path = snapshot.path;
  const created = !snapshot.exists;

  const next = adapter.write(snapshot.raw, entries);
  const serialized = adapter.serialize(next, snapshot.text);

  mkdirSync(dirname(path), { recursive: true });
  const backupPath = backupConfig(harnessId, path);
  const temp = `${path}.mcpdeck-${process.pid}.tmp`;
  writeFileSync(temp, serialized, { mode: 0o600 });
  renameSync(temp, path);

  return { path, backupPath, created };
}

export function writeHarnessEntry(
  harnessId: string,
  name: string,
  entry: McpEntry | null,
): WriteResult {
  const snapshot = readHarness(harnessId);
  const entries: EntryMap = { ...snapshot.entries };
  if (entry) entries[name] = entry;
  else delete entries[name];
  return writeHarnessEntries(harnessId, entries);
}

export function normalizedEntry(entry: McpEntry): string {
  const sort = (value?: Record<string, string>) =>
    value
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : undefined;

  return JSON.stringify({
    transport: entry.transport,
    command: entry.command ?? null,
    args: entry.args ?? [],
    url: entry.url ?? null,
    headers: sort(entry.headers) ?? {},
    env: sort(entry.env) ?? {},
  });
}

export function entriesMatch(a: McpEntry, b: McpEntry): boolean {
  return normalizedEntry(a) === normalizedEntry(b);
}

export function formatOf(harnessId: string): HarnessFormat {
  return FORMAT_BY_HARNESS[harnessId] ?? "mcpServers";
}

export { FORMAT_BY_HARNESS };
