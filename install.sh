#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGIN_DIR="$CONFIG_DIR/plugin"
PLUGIN_SPEC="./plugin/ai-usagebar-sidebar.tsx"
TUI_CONFIG="$CONFIG_DIR/tui.json"

SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

mkdir -p "$PLUGIN_DIR"
cp "$SOURCE_ROOT/plugin/ai-usagebar-sidebar.tsx" "$PLUGIN_DIR/ai-usagebar-sidebar.tsx"
printf 'installed plugin: %s\n' "$PLUGIN_DIR/ai-usagebar-sidebar.tsx"

if [ ! -f "$TUI_CONFIG" ]; then
  printf '{\n  "$schema": "https://opencode.ai/tui.json",\n  "plugin": ["%s"]\n}\n' "$PLUGIN_SPEC" > "$TUI_CONFIG"
  printf 'created %s\n' "$TUI_CONFIG"
elif grep -q -- "$PLUGIN_SPEC" "$TUI_CONFIG"; then
  printf '%s already lists the plugin\n' "$TUI_CONFIG"
else
  printf 'add this entry to %s manually:\n  "plugin": [..., "%s"]\n' "$TUI_CONFIG" "$PLUGIN_SPEC" >&2
fi

if [ ! -d "$CONFIG_DIR/node_modules/solid-js" ] || [ ! -d "$CONFIG_DIR/node_modules/@opentui/solid" ]; then
  printf 'note: solid-js / @opentui/solid not found under %s/node_modules\n' "$CONFIG_DIR"
  printf 'recent OpenCode provides these to TUI plugins automatically; if the sidebar fails to load, install them.\n'
fi

printf '\nRestart OpenCode to load the AI Usage sidebar.\n'
printf 'Requires the ai-usagebar CLI on PATH (test: ai-usagebar usage --json).\n'
