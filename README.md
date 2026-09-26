# opencode-ai-usagebar

Generic [ai-usagebar](https://github.com/akitaonrails/ai-usagebar) provider sidebar for the OpenCode TUI.
Shows the quota windows and balances of **every enabled ai-usagebar provider** (OpenCode Go,
Command Code, OpenRouter, DeepSeek, Claude, Codex, ...) inside the session sidebar.

Unlike single-provider sidebars, this reads the stable `ai-usagebar usage --json` report and renders
whatever each provider returns: rate windows, credits/balance rows, plan, errors and stale state.

> Requires **OpenCode V2**. V1 used a different plugin API; the last V1 release is
> [v1.0.1](https://github.com/neoscaler/opencode-ai-usagebar/releases/tag/v1.0.1).

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
interval. It registers a slot in `sidebar.content`, and stays hidden when the `ai-usagebar` command
is not on `PATH`.

## Install

```bash
./install.sh
```

It copies `plugin/tui.tsx` and `package.json` to `~/.config/opencode/plugins/ai-usagebar/`, where
OpenCode discovers the plugin automatically. Restart OpenCode afterwards.

Alternatively install it as a package:

```bash
opencode plugin add github:neoscaler/opencode-ai-usagebar
```

### Nix / home-manager

Keep the repo as the source of truth and drop the plugin directory into your config:

```nix
xdg.configFile."opencode/plugins/ai-usagebar".source = ./path/to/opencode-ai-usagebar/plugin;
```

OpenCode discovers `<config>/plugins/ai-usagebar/` automatically, or you can list it explicitly in
`~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["./plugins/ai-usagebar"]
}
```

## Options

Pass options in the object form in `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "./plugins/ai-usagebar",
      "options": {
        "command": "ai-usagebar",
        "interval": 60,
        "timeout": 25,
        "providers": ["opencode-go", "openrouter", "deepseek", "commandcode"],
        "showErrors": true
      }
    }
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

- OpenCode V2 (tested on 2.0.18).
- The `ai-usagebar` CLI on `PATH`, configured via `~/.config/ai-usagebar/config.toml`.

Recent OpenCode provides `solid-js` and `@opentui/solid` to TUI plugins automatically. If the
sidebar does not load, install them into your OpenCode config dir:

```bash
bun add --cwd ~/.config/opencode solid-js @opentui/solid
```

## Uninstall

Delete `~/.config/opencode/plugins/ai-usagebar/` (or remove its entry from `~/.config/opencode/cli.json`).
