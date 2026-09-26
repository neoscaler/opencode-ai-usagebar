#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGIN_DIR="$CONFIG_DIR/plugins/ai-usagebar"

SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

mkdir -p "$PLUGIN_DIR"
cp "$SOURCE_ROOT/dist/tui.js" "$PLUGIN_DIR/tui.js"
printf 'installed plugin: %s\n' "$PLUGIN_DIR/tui.js"

if [ ! -d "$CONFIG_DIR/node_modules/solid-js" ] || [ ! -d "$CONFIG_DIR/node_modules/@opentui/solid" ]; then
  printf 'note: solid-js / @opentui/solid not found under %s/node_modules\n' "$CONFIG_DIR"
  printf 'recent OpenCode provides these to TUI plugins automatically; if the sidebar fails to load, install them.\n'
fi

if command -v git >/dev/null 2>&1 && [ -d "$SOURCE_ROOT/.git" ]; then
  COMMIT="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
  printf '\nPackage install (pin the full commit hash; a tag or branch is re-checked every startup):\n'
  printf '  opencode plugin add github:neoscaler/opencode-ai-usagebar#%s\n' "$COMMIT"
fi

printf '\nRestart OpenCode to load the AI Usage sidebar.\n'
printf 'Requires OpenCode V2 and the ai-usagebar CLI on PATH (test: ai-usagebar usage --json).\n'
