# opencode-ai-usagebar

Generic [ai-usagebar](https://github.com/akitaonrails/ai-usagebar) provider sidebar for the OpenCode TUI.
Shows the quota windows and balances of **every enabled ai-usagebar provider** (OpenCode Go,
Command Code, OpenRouter, DeepSeek, Claude, Codex, ...) inside the session sidebar.

Unlike single-provider sidebars, this reads the stable `ai-usagebar usage --json` report and renders
whatever each provider returns: rate windows, credits/balance rows, plan, errors and stale state.

## How it works

Every refresh the plugin runs:

```bash
ai-usagebar usage --json
```

It then renders `entries[]`:

- each `metrics[]` entry -> `label  [bar]  percent%  ↺reset`
- `sections[]` with `type = "text"` -> a one-line `label value` row (balances, credits, ...)
- `plan` / `stale` -> plan line
- `error` -> shown unless `showErrors: false`

No background writer, no cache file, no service: the plugin fetches in-process and refreshes on an
interval. If `ai-usagebar` is missing or fails, the sidebar shows the error.

## Install

```bash
./install.sh
```

It copies `plugin/ai-usagebar-sidebar.tsx` to `~/.config/opencode/plugin/` and adds
`./plugin/ai-usagebar-sidebar.tsx` to `~/.config/opencode/tui.json`, then restart OpenCode.

### Nix / home-manager

Keep the repo as the source of truth and point `tui.json` at the absolute path instead of copying:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/home/you/repositories/opencode-ai-usagebar/plugin/ai-usagebar-sidebar.tsx"]
}
```

## Options

Pass options as a tuple in `tui.json`:

```json
{
  "plugin": [
    ["./plugin/ai-usagebar-sidebar.tsx", {
      "command": "ai-usagebar",
      "interval": 60,
      "timeout": 25,
      "providers": ["opencode-go", "openrouter", "deepseek", "commandcode"],
      "showErrors": true
    }]
  ]
}
```

| option | default | meaning |
| --- | --- | --- |
| `command` | `ai-usagebar` | ai-usagebar binary or absolute path |
| `interval` | `60` | seconds between refreshes (min 60) |
| `timeout` | `25` | seconds before the spawned process is killed |
| `providers` | all enabled | allow-list of provider ids |
| `showErrors` | `true` | render per-provider error lines |

## Requirements

- OpenCode with TUI plugin support (tested on 1.18.29).
- The `ai-usagebar` CLI on `PATH`, configured via `~/.config/ai-usagebar/config.toml`.

Recent OpenCode provides `solid-js` and `@opentui/solid` to TUI plugins automatically. If the
sidebar does not load, install them into your OpenCode config dir:

```bash
bun add --cwd ~/.config/opencode solid-js @opentui/solid
```

## Uninstall

Remove the `plugin` entry from `~/.config/opencode/tui.json` and delete
`~/.config/opencode/plugin/ai-usagebar-sidebar.tsx`.
