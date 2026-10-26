import { mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../../../..");

export const DATA_DIR =
  process.env.MCPDECK_DATA_DIR ?? join(REPO_ROOT, ".data");
export const BACKUP_DIR = join(DATA_DIR, "backups");
export const DB_PATH = join(DATA_DIR, "mcpdeck.db");
export const KEY_PATH = join(DATA_DIR, "key");
export const PORT = Number(process.env.PORT ?? 4000);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const WEB_ORIGIN =
  process.env.MCPDECK_WEB_ORIGIN ?? "http://localhost:3100";

export const OS = platform();
export const HOME = homedir();

export function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });
}

function appSupport(...parts: string[]) {
  if (OS === "darwin") {
    return join(HOME, "Library", "Application Support", ...parts);
  }
  if (OS === "win32") {
    return join(
      process.env.APPDATA ?? join(HOME, "AppData", "Roaming"),
      ...parts,
    );
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), ...parts);
}

/** Devin CLI and Desktop both read this XDG-style directory on every OS. */
function devinConfigDir() {
  if (OS === "win32") {
    return join(
      process.env.APPDATA ?? join(HOME, "AppData", "Roaming"),
      "devin",
    );
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), "devin");
}

export function configCandidates(harnessId: string): string[] {
  switch (harnessId) {
    case "claude-code":
      return [join(HOME, ".claude.json")];
    case "claude-desktop":
      return [join(appSupport("Claude"), "claude_desktop_config.json")];
    case "cursor":
      return [join(HOME, ".cursor", "mcp.json")];
    case "vscode":
      return [join(appSupport("Code", "User"), "mcp.json")];
    case "vscode-insiders":
      return [join(appSupport("Code - Insiders", "User"), "mcp.json")];
    case "windsurf":
      return [
        join(HOME, ".codeium", "windsurf", "mcp_config.json"),
        join(HOME, ".codeium", "windsurf-next", "mcp_config.json"),
      ];
    case "gemini-cli":
      return [join(HOME, ".gemini", "settings.json")];
    case "devin":
      return [join(devinConfigDir(), "mcp_config.json")];
    case "opencode":
      return [
        join(
          process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"),
          "opencode",
          "opencode.jsonc",
        ),
        join(
          process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"),
          "opencode",
          "opencode.json",
        ),
      ];
    case "pi":
      return [join(HOME, ".pi", "agent", "mcp.json")];
    case "codex":
      return [join(HOME, ".codex", "config.toml")];
    case "cline":
      return [
        join(
          appSupport("Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
          "settings",
          "cline_mcp_settings.json",
        ),
        join(
          appSupport(
            "Code - Insiders",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
          ),
          "settings",
          "cline_mcp_settings.json",
        ),
        join(HOME, ".cline", "data", "settings", "cline_mcp_settings.json"),
      ];
    case "zed":
      return [
        join(
          process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"),
          "zed",
          "settings.json",
        ),
      ];
    default:
      return [];
  }
}

/** Directories that indicate the harness is installed even without a config file yet. */
export function detectRoots(harnessId: string): string[] {
  switch (harnessId) {
    case "claude-code":
      return [join(HOME, ".claude"), join(HOME, ".claude.json")];
    case "claude-desktop":
      return [appSupport("Claude")];
    case "cursor":
      return [join(HOME, ".cursor")];
    case "vscode":
      return [appSupport("Code")];
    case "vscode-insiders":
      return [appSupport("Code - Insiders")];
    case "windsurf":
      return [
        join(HOME, ".codeium", "windsurf"),
        join(HOME, ".codeium", "windsurf-next"),
      ];
    case "gemini-cli":
      return [join(HOME, ".gemini")];
    case "devin":
      return [
        devinConfigDir(),
        join(HOME, ".local", "share", "devin"),
        appSupport("Devin"),
        join(HOME, ".devin"),
        ...(OS === "darwin"
          ? ["/Applications/Devin.app", join(HOME, "Applications", "Devin.app")]
          : []),
      ];
    case "opencode":
      return [
        join(
          process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"),
          "opencode",
        ),
      ];
    case "pi":
      return [join(HOME, ".pi")];
    case "codex":
      return [join(HOME, ".codex")];
    case "cline":
      return [
        join(
          appSupport("Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
        ),
        join(
          appSupport(
            "Code - Insiders",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
          ),
        ),
        join(HOME, ".cline"),
      ];
    case "zed":
      return [
        join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), "zed"),
      ];
    default:
      return [];
  }
}
