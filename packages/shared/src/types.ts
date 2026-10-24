export type Transport = "stdio" | "http";

export type EnvKeySpec = {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  hint?: string;
};

export type McpEntry = {
  transport: Transport;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled?: boolean;
};

export type HarnessFormat =
  | "mcpServers"
  | "vscode"
  | "opencode"
  | "codex"
  | "zed";

export type HarnessMeta = {
  id: string;
  name: string;
  vendor: string;
  color: string;
  format: HarnessFormat;
  docsUrl: string;
  note?: string;
};

export type RegistryServer = {
  id: string;
  name: string;
  slug: string;
  description: string;
  transport: Transport;
  command?: string;
  args?: string[];
  url?: string;
  envKeys?: EnvKeySpec[];
  headerKeys?: EnvKeySpec[];
  category: string;
  tags: string[];
  homepage?: string;
  repository?: string;
  verified?: boolean;
};

export type InstallDTO = {
  harnessId: string;
  enabled: boolean;
  configKey: string;
  configPath: string;
  installedAt: number;
  updatedAt: number;
};

export type ServerDTO = {
  id: string;
  name: string;
  slug: string;
  description: string;
  transport: Transport;
  command: string | null;
  args: string[];
  url: string | null;
  envKeys: string[];
  headerKeys: string[];
  requiredEnv: string[];
  requiredHeaders: string[];
  missingRequired: string[];
  category: string;
  tags: string[];
  homepage: string | null;
  repository: string | null;
  source: "manual" | "registry" | "imported";
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  installs: InstallDTO[];
};

export type HarnessDTO = HarnessMeta & {
  detected: boolean;
  configPath: string;
  configExists: boolean;
  serverCount: number;
  managedCount: number;
  lastSyncedAt: number | null;
  writable: boolean;
  error: string | null;
};

export type EventDTO = {
  id: string;
  kind: "install" | "uninstall" | "sync" | "import" | "create" | "delete" | "update";
  status: "success" | "error" | "warning";
  harnessId: string | null;
  serverId: string | null;
  serverName: string | null;
  message: string;
  createdAt: number;
};

export type DriftDTO = {
  harnessId: string;
  harnessName: string;
  missingInConfig: string[];
  missingInLibrary: string[];
  drifted: string[];
  inSync: string[];
};

export type ScanResultDTO = {
  harnessId: string;
  imported: number;
  updated: number;
  linked: number;
  found: number;
  skipped: number;
  error?: string;
};

export type SyncAllResult = {
  scannedAt: number;
  results: ScanResultDTO[];
};

export type OverviewStats = {
  serverCount: number;
  installCount: number;
  harnessCount: number;
  detectedHarnessCount: number;
  driftCount: number;
  stdioCount: number;
  remoteCount: number;
  favoriteCount: number;
  needsSetupCount: number;
  lastSyncAt: number | null;
};

export const CATEGORIES = [
  "Developer",
  "Data",
  "Web",
  "AI",
  "Productivity",
  "Infra",
  "Design",
  "General",
] as const;

export function transportOf(entry: McpEntry): Transport {
  return entry.transport;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function configPreview(entry: McpEntry) {
  return entry.transport === "stdio"
    ? [entry.command, ...(entry.args ?? [])].filter(Boolean).join(" ")
    : entry.url;
}
