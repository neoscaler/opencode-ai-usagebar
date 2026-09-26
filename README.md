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

It copies `dist/tui.js` to `~/.config/opencode/plugins/ai-usagebar/tui.js`, where OpenCode discovers
the plugin automatically. Restart OpenCode afterwards.

Alternatively install it as a package. **Pin a full commit hash** instead of a tag or branch:

```bash
opencode plugin add github:neoscaler/opencode-ai-usagebar#28c9fa307e974136c9e2f06aaf0b26754918f2ca
```

OpenCode treats a tag or branch as *unpinned*: on every startup it checks the remote for updates
before loading the cached copy, which can stall the plugin step for several seconds. A first install
additionally clones the repository and runs `npm install`. A full commit hash stays pinned and loads
straight from the cache. Resolve the commit of a release tag with:

```bash
git ls-remote https://github.com/neoscaler/opencode-ai-usagebar 'refs/tags/v2.0.3^{}'
```

### Nix / home-manager

OpenCode does not discover plugins behind symlinked directories, so do not point `home.file` at the
plugin directory. List the released package in `cli.json` instead:

```nix
xdg.configFile."opencode/cli.json".source = (pkgs.formats.json {}).generate "cli.json" {
  "$schema" = "https://opencode.ai/v2/cli.json";
  # Full commit hash: a tag or branch is unpinned, so OpenCode re-checks the
  # remote on every startup and the plugin step stalls for seconds.
  plugins = [ "github:neoscaler/opencode-ai-usagebar#28c9fa307e974136c9e2f06aaf0b26754918f2ca" ];
};
```

## Options

Pass options with the object form in `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "github:neoscaler/opencode-ai-usagebar#28c9fa307e974136c9e2f06aaf0b26754918f2ca",
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

## Development

OpenCode compiles plugin source with an eager JSX runtime, which gives no fine-grained reactivity for
`<Show>`/`<For>` and dynamic props. The plugin is therefore built ahead of time with the Solid
transform and loaded from `dist/tui.js`.

```bash
bun install
bun run scripts/build.ts
```

Edit `plugin/tui.tsx` and commit the rebuilt `dist/tui.js`.

## Requirements

- OpenCode V2 (tested on 2.0.18).
- The `ai-usagebar` CLI on `PATH`, configured via `~/.config/ai-usagebar/config.toml`.

Recent OpenCode provides `solid-js` and `@opentui/solid` to TUI plugins automatically.

## Uninstall

Delete `~/.config/opencode/plugins/ai-usagebar/` (or remove its entry from `~/.config/opencode/cli.json`).
