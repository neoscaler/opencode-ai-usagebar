// @bun
// plugin/tui.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
var MAX_TEXT = 46;
var BAR_CELLS = 12;
var GLYPHS = {
  "opencode-go": "\uDB80\uDD74",
  commandcode: "\uDB80\uDD8D"
};
var ACCENTS = {
  openrouter: "#8b8bf5",
  deepseek: "#4d6bfe",
  "opencode-go": "#f5a97f",
  commandcode: "#a6e3a1"
};
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function readError(value) {
  if (typeof value === "string")
    return readString(value);
  if (record(value))
    return readString(value.detail) ?? readString(value.message);
  return;
}
function scrub(value) {
  return value.replace(/sk-[A-Za-z0-9_-]{9,}/g, "sk-<redacted>").replace(/(Bearer\s+)\S+/gi, "$1<redacted>").replace(/\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[^\s"',}]+/gi, "$1=<redacted>");
}
function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? scrub(trimmed) : undefined;
}
function isGlyph(value) {
  if (!value)
    return false;
  return [...value].some((char) => (char.codePointAt(0) ?? 0) > 8192);
}
function glyphFor(id, icon) {
  if (GLYPHS[id])
    return GLYPHS[id];
  if (isGlyph(icon))
    return icon;
  return;
}
function meaningfulPlan(value, name) {
  if (!value || value === name)
    return;
  if (/[$\u20AC\u00A5\u00A3]/.test(value) || value.includes("<redacted>"))
    return;
  return value;
}
function parseProvider(input) {
  if (!record(input))
    return;
  const id = readString(input.id);
  const name = clean(readString(input.display_name) ?? readString(input.name)) ?? id;
  if (!id || !name)
    return;
  const metrics = [];
  const balances = [];
  if (Array.isArray(input.metrics)) {
    for (const item of input.metrics) {
      if (!record(item))
        continue;
      const percent = readNumber(item.percent);
      if (percent === undefined)
        continue;
      const label = clean(readString(item.label)) ?? "quota";
      const value = clean(readString(item.value));
      if (/balance/i.test(label)) {
        balances.push({
          label,
          value: value ?? `${Math.round(percent)}%`
        });
        continue;
      }
      metrics.push({
        label,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        severity: readString(item.severity),
        value,
        reset: readString(item.reset_at)
      });
    }
  }
  let tier;
  if (Array.isArray(input.sections)) {
    for (const item of input.sections) {
      if (!record(item))
        continue;
      const type = readString(item.type);
      const label = clean(readString(item.label)) ?? "";
      if (type === "text") {
        const value = clean(readString(item.value));
        if (value)
          balances.push({
            label,
            value
          });
      } else if (type === "block" && /tier|plan/i.test(label)) {
        const body = Array.isArray(item.body) ? item.body.map((line) => clean(readString(line))).filter((line) => !!line) : [];
        if (body.length)
          tier = body.join(" \xB7 ");
      }
    }
  }
  return {
    id,
    name,
    glyph: glyphFor(id, readString(input.icon)),
    accent: ACCENTS[id],
    plan: meaningfulPlan(tier ?? clean(readString(input.plan)), name),
    stale: input.stale === true,
    error: clean(readError(input.error)),
    metrics,
    balances
  };
}
function parseReport(text) {
  const data = JSON.parse(text);
  if (!record(data) || !Array.isArray(data.entries))
    throw new Error("unexpected ai-usagebar output");
  const providers = [];
  for (const item of data.entries) {
    const provider = parseProvider(item);
    if (provider)
      providers.push(provider);
  }
  return providers;
}
async function runAiUsagebar(command, timeout) {
  if (typeof Bun === "undefined")
    throw new Error("Bun runtime unavailable");
  const proc = Bun.spawn([command, "usage", "--json"], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const timer = setTimeout(() => proc.kill(), Math.max(5, timeout) * 1000);
  try {
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (!out.trim()) {
      const detail = err.trim().split(`
`).filter(Boolean).at(-1);
      throw new Error(detail || `${command} exited with code ${code}`);
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
function truncate(value, max = MAX_TEXT) {
  if (typeof value !== "string")
    return "";
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}
function bar(used) {
  const filled = Math.round(used / 100 * BAR_CELLS);
  return `${"\u2588".repeat(filled)}${"\u2591".repeat(BAR_CELLS - filled)}`;
}
function severityColor(severity, used, colors) {
  if (severity === "critical" || used >= 100)
    return colors.error;
  if (severity === "high" || severity === "mid" || used >= 80)
    return colors.warning;
  return colors.success;
}
function resetLabel(iso) {
  if (!iso)
    return "";
  const target = Date.parse(iso);
  if (Number.isNaN(target))
    return "";
  const diff = target - Date.now();
  if (diff <= 0)
    return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60)
    return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48)
    return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
function AiUsagebarSidebar(props) {
  const context = usePlugin();
  const theme = () => context.theme;
  const [state, setState] = createSignal({
    kind: "loading"
  });
  const interval = () => Math.max(60, props.options.interval ?? 60) * 1000;
  const timeout = () => Math.max(5, props.options.timeout ?? 25);
  const command = () => props.options.command ?? "ai-usagebar";
  const showErrors = () => props.options.showErrors ?? true;
  const filter = () => props.options.providers;
  onMount(() => {
    let disposed = false;
    let busy = false;
    const refresh = async () => {
      if (busy || disposed)
        return;
      busy = true;
      try {
        const text = await runAiUsagebar(command(), timeout());
        let providers = parseReport(text);
        const only = filter();
        if (only?.length)
          providers = providers.filter((p) => only.includes(p.id));
        if (!disposed)
          setState({
            kind: "ok",
            snapshot: {
              providers,
              updatedAt: Date.now()
            }
          });
      } catch (error) {
        if (!disposed)
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
      } finally {
        busy = false;
      }
    };
    refresh();
    const timer = setInterval(refresh, interval());
    onCleanup(() => {
      disposed = true;
      clearInterval(timer);
    });
  });
  const providers = createMemo(() => state().kind === "ok" ? state().snapshot.providers : []);
  const updated = createMemo(() => state().kind === "ok" ? state().snapshot.updatedAt : undefined);
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("text"), _el$3 = _$createElement("b"), _el$5 = _$createElement("span"), _el$6 = _$createTextNode(` `);
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "gap", 0);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$5);
    _$insertNode(_el$3, _$createTextNode(`AI USAGE`));
    _$insertNode(_el$5, _el$6);
    _$insert(_el$5, (() => {
      var _c$ = _$memo(() => !!updated());
      return () => _c$() ? new Date(updated()).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      }) : "";
    })(), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return state().kind === "loading";
      },
      get children() {
        var _el$7 = _$createElement("text");
        _$insertNode(_el$7, _$createTextNode(`reading ai-usagebar...`));
        _$effect((_$p) => _$setProp(_el$7, "fg", theme().text.muted, _$p));
        return _el$7;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return state().kind === "error";
      },
      get children() {
        var _el$9 = _$createElement("text");
        _$insert(_el$9, () => truncate(state().message));
        _$effect((_$p) => _$setProp(_el$9, "fg", theme().text.feedback.error.base, _$p));
        return _el$9;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return _$memo(() => state().kind === "ok")() && providers().length === 0;
      },
      get children() {
        var _el$0 = _$createElement("text");
        _$insertNode(_el$0, _$createTextNode(`no enabled providers`));
        _$effect((_$p) => _$setProp(_el$0, "fg", theme().text.muted, _$p));
        return _el$0;
      }
    }), null);
    _$insert(_el$, _$createComponent(For, {
      get each() {
        return providers();
      },
      children: (provider) => _$createComponent(ProviderBlock, {
        provider,
        get theme() {
          return theme();
        },
        get showErrors() {
          return showErrors();
        }
      })
    }), null);
    _$effect((_p$) => {
      var _v$ = theme().text.base, _v$2 = {
        fg: theme().text.muted
      };
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "style", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function ProviderBlock(props) {
  const accent = () => props.provider.accent ?? props.theme.text.base;
  return (() => {
    var _el$10 = _$createElement("box"), _el$11 = _$createElement("text"), _el$12 = _$createElement("b");
    _$insertNode(_el$10, _el$11);
    _$setProp(_el$10, "flexDirection", "column");
    _$setProp(_el$10, "gap", 0);
    _$setProp(_el$10, "paddingTop", 0);
    _$insertNode(_el$11, _el$12);
    _$insert(_el$11, (() => {
      var _c$2 = _$memo(() => !!props.provider.glyph);
      return () => _c$2() ? (() => {
        var _el$15 = _$createElement("span"), _el$16 = _$createTextNode(` `);
        _$insertNode(_el$15, _el$16);
        _$insert(_el$15, () => props.provider.glyph, _el$16);
        return _el$15;
      })() : null;
    })(), _el$12);
    _$insert(_el$12, () => props.provider.name);
    _$insert(_el$11, (() => {
      var _c$3 = _$memo(() => !!props.provider.plan);
      return () => _c$3() ? (() => {
        var _el$17 = _$createElement("span"), _el$18 = _$createTextNode(` `);
        _$insertNode(_el$17, _el$18);
        _$insert(_el$17, () => truncate(props.provider.plan, 24), null);
        _$effect((_$p) => _$setProp(_el$17, "style", {
          fg: props.theme.text.muted
        }, _$p));
        return _el$17;
      })() : null;
    })(), null);
    _$insert(_el$11, (() => {
      var _c$4 = _$memo(() => !!props.provider.stale);
      return () => _c$4() ? (() => {
        var _el$19 = _$createElement("span");
        _$insertNode(_el$19, _$createTextNode(` \u23F8`));
        _$effect((_$p) => _$setProp(_el$19, "style", {
          fg: props.theme.text.muted
        }, _$p));
        return _el$19;
      })() : null;
    })(), null);
    _$insert(_el$10, _$createComponent(For, {
      get each() {
        return props.provider.metrics;
      },
      children: (metric) => (() => {
        var _el$21 = _$createElement("text"), _el$22 = _$createTextNode(` `), _el$23 = _$createTextNode(` `), _el$24 = _$createElement("span"), _el$25 = _$createTextNode(` `), _el$26 = _$createElement("span"), _el$27 = _$createTextNode(`%`);
        _$insertNode(_el$21, _el$22);
        _$insertNode(_el$21, _el$23);
        _$insertNode(_el$21, _el$24);
        _$insertNode(_el$21, _el$25);
        _$insertNode(_el$21, _el$26);
        _$insert(_el$21, () => truncate(metric.label, 12).padEnd(12, " "), _el$23);
        _$insert(_el$24, () => bar(metric.percent));
        _$insertNode(_el$26, _el$27);
        _$insert(_el$26, () => String(metric.percent).padStart(3, " "), _el$27);
        _$insert(_el$21, (() => {
          var _c$5 = _$memo(() => !!metric.value);
          return () => _c$5() ? (() => {
            var _el$28 = _$createElement("span"), _el$29 = _$createTextNode(` `);
            _$insertNode(_el$28, _el$29);
            _$insert(_el$28, () => metric.value, null);
            _$effect((_$p) => _$setProp(_el$28, "style", {
              fg: props.theme.text.muted
            }, _$p));
            return _el$28;
          })() : null;
        })(), null);
        _$insert(_el$21, (() => {
          var _c$6 = _$memo(() => !!resetLabel(metric.reset));
          return () => _c$6() ? (() => {
            var _el$30 = _$createElement("span"), _el$31 = _$createTextNode(` \u21BA`);
            _$insertNode(_el$30, _el$31);
            _$insert(_el$30, () => resetLabel(metric.reset), null);
            _$effect((_$p) => _$setProp(_el$30, "style", {
              fg: props.theme.text.muted
            }, _$p));
            return _el$30;
          })() : null;
        })(), null);
        _$effect((_p$) => {
          var _v$3 = props.theme.text.muted, _v$4 = {
            fg: severityColor(metric.severity, metric.percent, {
              success: props.theme.text.feedback.success.base,
              warning: props.theme.text.feedback.warning.base,
              error: props.theme.text.feedback.error.base
            })
          }, _v$5 = {
            fg: props.theme.text.base
          };
          _v$3 !== _p$.e && (_p$.e = _$setProp(_el$21, "fg", _v$3, _p$.e));
          _v$4 !== _p$.t && (_p$.t = _$setProp(_el$24, "style", _v$4, _p$.t));
          _v$5 !== _p$.a && (_p$.a = _$setProp(_el$26, "style", _v$5, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$21;
      })()
    }), null);
    _$insert(_el$10, _$createComponent(For, {
      get each() {
        return props.provider.balances;
      },
      children: (row) => (() => {
        var _el$32 = _$createElement("text"), _el$33 = _$createTextNode(` `);
        _$insertNode(_el$32, _el$33);
        _$insert(_el$32, () => truncate(row.label ? `${row.label}: ${row.value}` : row.value), null);
        _$effect((_$p) => _$setProp(_el$32, "fg", props.theme.text.muted, _$p));
        return _el$32;
      })()
    }), null);
    _$insert(_el$10, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!props.showErrors)() && props.provider.error;
      },
      get children() {
        var _el$13 = _$createElement("text"), _el$14 = _$createTextNode(` \u2717 `);
        _$insertNode(_el$13, _el$14);
        _$insert(_el$13, () => truncate(props.provider.error), null);
        _$effect((_$p) => _$setProp(_el$13, "fg", props.theme.text.feedback.error.base, _$p));
        return _el$13;
      }
    }), null);
    _$effect((_$p) => _$setProp(_el$11, "fg", accent(), _$p));
    return _el$10;
  })();
}
var tui_default = Plugin.define({
  id: "opencode-ai-usagebar.sidebar",
  setup(context) {
    const options = context.options ?? {};
    if (typeof Bun === "undefined" || !Bun.which(options.command ?? "ai-usagebar"))
      return;
    return context.ui.slot({
      append: "sidebar.content",
      render: () => _$createComponent(AiUsagebarSidebar, {
        options
      })
    });
  }
});
export {
  tui_default as default
};
