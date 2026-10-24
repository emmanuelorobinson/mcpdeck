#!/usr/bin/env bash
# End-to-end check of scan/install/uninstall against disposable harness configs.
# Never touches the real home directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/mcpdeck-smoke.XXXXXX")"
PORT=4187
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.cursor" "$TEST_HOME/.config/zed" "$TEST_HOME/.codex" "$TEST_HOME/.config/opencode" "$TEST_HOME/.codeium/windsurf" "$TEST_HOME/.pi/agent" "$TEST_HOME/.gemini"

# App Support paths differ by OS.
INSIDERS_USER_DIR="$TEST_HOME/.config/Code - Insiders/User"
CLAUDE_DIR="$TEST_HOME/.config/Claude"
CLINE_SETTINGS_DIR="$TEST_HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings"
if [[ "$(uname -s)" == "Darwin" ]]; then
  INSIDERS_USER_DIR="$TEST_HOME/Library/Application Support/Code - Insiders/User"
  CLAUDE_DIR="$TEST_HOME/Library/Application Support/Claude"
  CLINE_SETTINGS_DIR="$TEST_HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings"
fi
mkdir -p "$INSIDERS_USER_DIR" "$CLAUDE_DIR" "$CLINE_SETTINGS_DIR"

cat > "$TEST_HOME/.cursor/mcp.json" <<'EOF'
{
  "mcpServers": {
    "test-server": {
      "command": "npx",
      "args": ["-y", "test-pkg"],
      "env": { "TEST_TOKEN": "super-secret" }
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "remote-test": {
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer remote-secret" }
    }
  }
}
EOF

cat > "$TEST_HOME/.codeium/windsurf/mcp_config.json" <<'EOF'
{
  "mcpServers": {
    "playwright-custom": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "remote-test": {
      "serverUrl": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer remote-secret" }
    }
  }
}
EOF

cat > "$TEST_HOME/.config/zed/settings.json" <<'EOF'
{
  // keep this comment — Zed configs are JSONC
  "theme": "One Dark",
  "context_servers": {
    "existing-zed": {
      "enabled": false,
      "remote": true,
      "command": "echo",
      "args": ["hello"]
    },
    "extension-zed": {
      "enabled": true,
      "remote": false,
      "settings": { "keep": "yes" }
    }
  }
}
EOF

cat > "$TEST_HOME/.codex/config.toml" <<'EOF'
model = "gpt-5"
approval_policy = "on-request"
EOF

cat > "$TEST_HOME/.config/opencode/opencode.jsonc" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  // opencode also accepts comments
  "theme": "opencode",
  "mcp": {
    "existing-open": {
      "type": "local",
      "command": ["echo", "hi"],
      "enabled": true
    }
  }
}
EOF

cat > "$TEST_HOME/.config/opencode/opencode.json" <<'EOF'
{
  "mcp": {
    "json-fallback": {
      "type": "local",
      "command": ["echo", "json"]
    }
  }
}
EOF

cat > "$TEST_HOME/.pi/agent/mcp.json" <<'EOF'
{
  "mcpServers": {
    "pi-existing": {
      "command": "npx",
      "args": ["-y", "pi-pkg"]
    }
  }
}
EOF

cat > "$TEST_HOME/.gemini/settings.json" <<'EOF'
{
  "theme": "Default",
  "mcpServers": {
    "gemini-existing": {
      "command": "echo",
      "args": ["gemini"],
      "trust": true
    },
    "remote-test": {
      "httpUrl": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer remote-secret" }
    }
  }
}
EOF

cat > "$CLINE_SETTINGS_DIR/cline_mcp_settings.json" <<'EOF'
{
  "mcpServers": {
    "cline-existing": {
      "command": "echo",
      "args": ["cline"],
      "autoApprove": ["read_file"],
      "timeout": 30
    },
    "remote-test": {
      "type": "streamableHttp",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer remote-secret" }
    }
  }
}
EOF

cat > "$INSIDERS_USER_DIR/mcp.json" <<'EOF'
{
  "servers": {
    "insiders-existing": {
      "type": "stdio",
      "command": "echo",
      "args": ["insiders"]
    }
  }
}
EOF

cat > "$CLAUDE_DIR/claude_desktop_config.json" <<'EOF'
{
  "mcpServers": {
    "claude-existing": {
      "command": "echo",
      "args": ["claude"]
    },
    "legacy-remote": {
      "type": "http",
      "url": "https://legacy.example.com/mcp",
      "headers": { "X-Legacy-Key": "legacy-secret" }
    }
  }
}
EOF

HOME="$TEST_HOME" MCPDECK_DATA_DIR="$TEST_HOME/.data" PORT=$PORT \
  bun apps/api/src/index.ts > "$TEST_HOME/api.log" 2>&1 &
API_PID=$!

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null && break
  sleep 0.25
done

HEALTH="$(curl -sf "http://127.0.0.1:$PORT/api/health")"
echo "$HEALTH" | jq -e '.ok == true' > /dev/null

ZED_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="zed") | .serverCount')"
[[ "$ZED_COUNT" == "1" ]] || { echo "FAIL: Zed JSONC was not parsed ($ZED_COUNT)"; exit 1; }
echo "✓ Zed JSONC parsed"

PI_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="pi") | .serverCount')"
[[ "$PI_COUNT" == "1" ]] || { echo "FAIL: Pi config was not parsed ($PI_COUNT)"; exit 1; }
echo "✓ Pi config parsed"

INSIDERS_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="vscode-insiders") | .serverCount')"
[[ "$INSIDERS_COUNT" == "1" ]] || { echo "FAIL: VS Code Insiders config was not parsed ($INSIDERS_COUNT)"; exit 1; }
echo "✓ VS Code Insiders config parsed"

CLAUDE_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="claude-desktop") | .serverCount')"
[[ "$CLAUDE_COUNT" == "2" ]] || { echo "FAIL: Claude Desktop config was not parsed ($CLAUDE_COUNT)"; exit 1; }
echo "✓ Claude Desktop config parsed"

WINDSURF_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="windsurf") | .serverCount')"
[[ "$WINDSURF_COUNT" == "2" ]] || { echo "FAIL: Windsurf serverUrl config was not parsed ($WINDSURF_COUNT)"; exit 1; }
echo "✓ Windsurf serverUrl config parsed"

CLINE_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="cline") | .serverCount')"
[[ "$CLINE_COUNT" == "2" ]] || { echo "FAIL: Cline config was not parsed ($CLINE_COUNT)"; exit 1; }
echo "✓ Cline config parsed"

GEMINI_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="gemini-cli") | .serverCount')"
[[ "$GEMINI_COUNT" == "2" ]] || { echo "FAIL: Gemini CLI httpUrl config was not parsed ($GEMINI_COUNT)"; exit 1; }
echo "✓ Gemini CLI httpUrl config parsed"

OPEN_COUNT="$(echo "$HEALTH" | jq -r '.harnesses[] | select(.id=="opencode") | .serverCount')"
[[ "$OPEN_COUNT" == "1" ]] || { echo "FAIL: OpenCode did not prefer opencode.jsonc ($OPEN_COUNT)"; exit 1; }
echo "✓ OpenCode prefers .jsonc when both forms exist"

SID="$(curl -sf "http://127.0.0.1:$PORT/api/servers" | jq -r '.[] | select(.slug=="test-server") | .id')"
[[ -n "$SID" ]] || { echo "FAIL: test-server was not imported"; exit 1; }
echo "✓ Cursor config imported"

REMOTE_SID="$(curl -sf "http://127.0.0.1:$PORT/api/servers" \
  | jq -r '.[] | select(.url=="https://mcp.example.com/mcp") | .id')"
[[ -n "$REMOTE_SID" ]] || { echo "FAIL: remote-test was not imported"; exit 1; }

PW_COUNT="$(curl -sf "http://127.0.0.1:$PORT/api/servers" \
  | jq '[.[] | select(.command=="npx" and ((.args // []) | index("@playwright/mcp@latest")))] | length')"
PW_INSTALLS="$(curl -sf "http://127.0.0.1:$PORT/api/servers" \
  | jq '[.[] | select(.command=="npx" and ((.args // []) | index("@playwright/mcp@latest")))][0].installs | length')"
[[ "$PW_COUNT" == "1" ]] || { echo "FAIL: same package imported as $PW_COUNT servers"; exit 1; }
[[ "$PW_INSTALLS" == "2" ]] || { echo "FAIL: expected 2 Playwright installs, got $PW_INSTALLS"; exit 1; }
echo "✓ Same package under different names collapsed into one server"

BEFORE_RESCAN="$(curl -sf "http://127.0.0.1:$PORT/api/servers" | jq 'length')"
RESCAN="$(curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/sync")"
echo "$RESCAN" | jq -e '[.results[].imported] | add == 0' > /dev/null \
  || { echo "FAIL: rescan imported duplicate servers"; exit 1; }
echo "$RESCAN" | jq -e '[.results[].linked] | add == 0' > /dev/null \
  || { echo "FAIL: rescan created duplicate installs"; exit 1; }
AFTER_RESCAN="$(curl -sf "http://127.0.0.1:$PORT/api/servers" | jq 'length')"
[[ "$BEFORE_RESCAN" == "$AFTER_RESCAN" ]] \
  || { echo "FAIL: rescan changed the server count ($BEFORE_RESCAN -> $AFTER_RESCAN)"; exit 1; }
echo "✓ Rescan is idempotent"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"zed\"}" | jq -e '.ok == true' > /dev/null

grep -q "keep this comment" "$TEST_HOME/.config/zed/settings.json" || { echo "FAIL: Zed comment was lost"; exit 1; }
(
  cd "$ROOT/apps/api" &&
    ZED_CONFIG="$TEST_HOME/.config/zed/settings.json" bun -e '
import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
const c = parse(readFileSync(process.env.ZED_CONFIG, "utf8")).context_servers;
if (c["test-server"]?.command !== "npx") throw new Error("missing flat Zed command");
if (!Array.isArray(c["test-server"]?.args)) throw new Error("Zed args must be an array");
if ("source" in c["test-server"]) throw new Error("stale Zed source field");
if (c["existing-zed"]?.enabled !== false || c["existing-zed"]?.remote !== true) throw new Error("Zed flags lost");
if (c["extension-zed"]?.settings?.keep !== "yes") throw new Error("extension server lost");
'
) || { echo "FAIL: Zed config is not in the current flat schema"; exit 1; }
echo "✓ Installed into Zed using flat schema, flags and extension entries preserved"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"opencode\"}" | jq -e '.ok == true' > /dev/null

grep -q "opencode also accepts comments" "$TEST_HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: OpenCode comment was lost"; exit 1; }
grep -q "existing-open" "$TEST_HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: existing OpenCode server was lost"; exit 1; }
grep -q '"test-server"' "$TEST_HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: server missing from OpenCode"; exit 1; }
grep -q '"test-server"' "$TEST_HOME/.config/opencode/opencode.json" && { echo "FAIL: wrote to opencode.json instead of .jsonc"; exit 1; }
echo "✓ Installed into OpenCode, comments and existing entries preserved"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"codex\"}" | jq -e '.ok == true' > /dev/null
grep -q "\[mcp_servers.test-server\]" "$TEST_HOME/.codex/config.toml" || { echo "FAIL: server missing from Codex TOML"; exit 1; }
grep -q 'model = "gpt-5"' "$TEST_HOME/.codex/config.toml" || { echo "FAIL: Codex settings were lost"; exit 1; }
echo "✓ Installed into Codex TOML"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"pi\"}" | jq -e '.ok == true' > /dev/null
grep -q '"test-server"' "$TEST_HOME/.pi/agent/mcp.json" || { echo "FAIL: server missing from Pi"; exit 1; }
grep -q '"pi-existing"' "$TEST_HOME/.pi/agent/mcp.json" || { echo "FAIL: existing Pi server was lost"; exit 1; }
jq empty "$TEST_HOME/.pi/agent/mcp.json" > /dev/null || { echo "FAIL: Pi config is not valid JSON"; exit 1; }
echo "✓ Installed into Pi, existing entries preserved"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"vscode-insiders\"}" | jq -e '.ok == true' > /dev/null
grep -q '"insiders-existing"' "$INSIDERS_USER_DIR/mcp.json" || { echo "FAIL: existing VS Code Insiders server was lost"; exit 1; }
jq -e '.servers["test-server"].type == "stdio" and .servers["test-server"].command == "npx"' "$INSIDERS_USER_DIR/mcp.json" > /dev/null \
  || { echo "FAIL: server missing or malformed in VS Code Insiders"; exit 1; }
echo "✓ Installed into VS Code Insiders, existing entries preserved"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"cursor\"}" | jq -e '.ok == true' > /dev/null
curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$REMOTE_SID\",\"harnessId\":\"cursor\"}" | jq -e '.ok == true' > /dev/null
jq -e '.mcpServers["test-server"].type == "stdio" and .mcpServers["remote-test"].type == "http"' \
  "$TEST_HOME/.cursor/mcp.json" > /dev/null \
  || { echo "FAIL: Cursor entries are missing required type fields"; exit 1; }
echo "✓ Cursor stdio and HTTP entries carry the documented type field"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$REMOTE_SID\",\"harnessId\":\"cline\"}" | jq -e '.ok == true' > /dev/null
jq -e '
  .mcpServers["remote-test"].type == "streamableHttp" and
  .mcpServers["remote-test"].url == "https://mcp.example.com/mcp" and
  .mcpServers["cline-existing"].autoApprove == ["read_file"] and
  .mcpServers["cline-existing"].timeout == 30
' "$CLINE_SETTINGS_DIR/cline_mcp_settings.json" > /dev/null \
  || { echo "FAIL: Cline remote server or preserved settings are malformed"; exit 1; }
echo "✓ Cline uses streamableHttp and preserves autoApprove/timeout"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$REMOTE_SID\",\"harnessId\":\"windsurf\"}" | jq -e '.ok == true' > /dev/null
jq -e '
  .mcpServers["remote-test"].serverUrl == "https://mcp.example.com/mcp" and
  (.mcpServers["remote-test"] | has("url") | not) and
  (.mcpServers["remote-test"] | has("type") | not) and
  .mcpServers["playwright-custom"].command == "npx"
' "$TEST_HOME/.codeium/windsurf/mcp_config.json" > /dev/null \
  || { echo "FAIL: Windsurf remote server is not using serverUrl"; exit 1; }
echo "✓ Windsurf uses serverUrl and preserves existing servers"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"gemini-cli\"}" | jq -e '.ok == true' > /dev/null
curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$REMOTE_SID\",\"harnessId\":\"gemini-cli\"}" | jq -e '.ok == true' > /dev/null
jq -e '
  .mcpServers["remote-test"].httpUrl == "https://mcp.example.com/mcp" and
  (.mcpServers["remote-test"] | has("url") | not) and
  (.mcpServers["remote-test"] | has("type") | not) and
  .mcpServers["gemini-existing"].trust == true and
  .mcpServers["test-server"].command == "npx"
' "$TEST_HOME/.gemini/settings.json" > /dev/null \
  || { echo "FAIL: Gemini CLI remote server is not using httpUrl or trust was lost"; exit 1; }
echo "✓ Gemini CLI uses httpUrl and preserves trust settings"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/install" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$REMOTE_SID\",\"harnessId\":\"claude-desktop\"}" | jq -e '.ok == true' > /dev/null

jq -e '
  .mcpServers["claude-existing"].command == "echo" and
  .mcpServers["remote-test"].command == "npx" and
  (.mcpServers["remote-test"] | has("url") | not) and
  (.mcpServers["remote-test"] | has("type") | not) and
  ([.mcpServers["remote-test"].args[] | select(startswith("mcp-remote"))] | length == 1) and
  ([.mcpServers["remote-test"].args[] | select(. == "https://mcp.example.com/mcp")] | length == 1) and
  ([.mcpServers["remote-test"].args[] | select(contains("remote-secret"))] | length == 0) and
  ([.mcpServers["remote-test"].args[] | select(contains("${MCPDECK_HEADER_AUTHORIZATION}"))] | length == 1) and
  ([.mcpServers["remote-test"].env[] | select(. == "Bearer remote-secret")] | length == 1)
' "$CLAUDE_DIR/claude_desktop_config.json" > /dev/null \
  || { echo "FAIL: remote server was not bridged through mcp-remote in Claude Desktop"; exit 1; }

jq -e '
  .mcpServers["legacy-remote"].command == "npx" and
  (.mcpServers["legacy-remote"] | has("url") | not) and
  ([.mcpServers["legacy-remote"].env[] | select(. == "legacy-secret")] | length == 1)
' "$CLAUDE_DIR/claude_desktop_config.json" > /dev/null \
  || { echo "FAIL: existing Claude Desktop url entry was not migrated"; exit 1; }
echo "✓ Claude Desktop remote entries bridged through mcp-remote"

CD_RESCAN="$(curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/sync" \
  -H 'content-type: application/json' \
  -d '{"harnessId":"claude-desktop"}')"
echo "$CD_RESCAN" | jq -e '.imported == 0 and .linked == 0' > /dev/null \
  || { echo "FAIL: Claude Desktop bridge was not recognized as the same server"; exit 1; }
echo "✓ Claude Desktop bridge round-trips without duplicates"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/uninstall" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"zed\"}" | jq -e '.ok == true' > /dev/null

(
  cd "$ROOT/apps/api" &&
    ZED_CONFIG="$TEST_HOME/.config/zed/settings.json" bun -e '
import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
const c = parse(readFileSync(process.env.ZED_CONFIG, "utf8")).context_servers;
if (c["test-server"]) throw new Error("server still in Zed");
if (c["existing-zed"]?.enabled !== false || c["existing-zed"]?.remote !== true) throw new Error("Zed flags lost");
if (c["extension-zed"]?.settings?.keep !== "yes") throw new Error("extension server disappeared");
'
) || { echo "FAIL: Zed uninstall removed unrelated entries"; exit 1; }
grep -q "keep this comment" "$TEST_HOME/.config/zed/settings.json" || { echo "FAIL: comment disappeared"; exit 1; }
echo "✓ Uninstall from Zed preserved everything else"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/uninstall" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"pi\"}" | jq -e '.ok == true' > /dev/null
grep -q '"test-server"' "$TEST_HOME/.pi/agent/mcp.json" && { echo "FAIL: server still in Pi"; exit 1; }
grep -q '"pi-existing"' "$TEST_HOME/.pi/agent/mcp.json" || { echo "FAIL: existing Pi server disappeared"; exit 1; }
echo "✓ Uninstall from Pi preserved everything else"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/uninstall" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$SID\",\"harnessId\":\"vscode-insiders\"}" | jq -e '.ok == true' > /dev/null
jq -e '.servers["test-server"] == null' "$INSIDERS_USER_DIR/mcp.json" > /dev/null \
  || { echo "FAIL: server still in VS Code Insiders"; exit 1; }
grep -q '"insiders-existing"' "$INSIDERS_USER_DIR/mcp.json" || { echo "FAIL: existing VS Code Insiders server disappeared"; exit 1; }
echo "✓ Uninstall from VS Code Insiders preserved everything else"

curl -sf -X POST "http://127.0.0.1:$PORT/api/hooks/uninstall" \
  -H 'content-type: application/json' \
  -d "{\"serverId\":\"$REMOTE_SID\",\"harnessId\":\"claude-desktop\"}" | jq -e '.ok == true' > /dev/null
jq -e '.mcpServers["remote-test"] == null and .mcpServers["legacy-remote"].command == "npx"' \
  "$CLAUDE_DIR/claude_desktop_config.json" > /dev/null \
  || { echo "FAIL: uninstall from Claude Desktop removed the wrong entries"; exit 1; }
echo "✓ Uninstall from Claude Desktop preserved the other bridge"

[[ "$(find "$TEST_HOME/.data/backups" -type f | wc -l | tr -d ' ')" -gt 0 ]] || { echo "FAIL: no backups written"; exit 1; }
echo "✓ Timestamped backups written"

echo ""
echo "All harness sync checks passed. Test home: $TEST_HOME"
