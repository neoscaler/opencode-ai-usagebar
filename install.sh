#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGIN_DIR="$CONFIG_DIR/plugins/ai-usagebar"

SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

mkdir -p "$PLUGIN_DIR"
cp "$SOURCE_ROOT/plugin/tui.tsx" "$PLUGIN_DIR/tui.tsx"
printf '{\n  "name": "opencode-ai-usagebar",\n  "version": "2.0.0",\n  "type": "module",\n  "private": true,\n  "exports": {\n    "./tui": "./tui.tsx"\n  }\n}\n' > "$PLUGIN_DIR/package.json"
printf 'installed plugin: %s\n' "$PLUGIN_DIR/tui.tsx"

if [ ! -d "$CONFIG_DIR/node_modules/solid-js" ] || [ ! -d "$CONFIG_DIR/node_modules/@opentui/solid" ]; then
  printf 'note: solid-js / @opentui/solid not found under %s/node_modules\n' "$CONFIG_DIR"
  printf 'recent OpenCode provides these to TUI plugins automatically; if the sidebar fails to load, install them.\n'
fi

printf '\nRestart OpenCode to load the AI Usage sidebar.\n'
printf 'Requires OpenCode V2 and the ai-usagebar CLI on PATH (test: ai-usagebar usage --json).\n'
