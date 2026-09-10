/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

const MAX_TEXT = 46
const BAR_CELLS = 12

// ai-usagebar ships a glyph for some vendors and falls back to the short_name
// for the rest. Fill the gaps with Nerd Font (MDI) glyphs, matching the font
// the TUI runs in.
const GLYPHS: Record<string, string> = {
  "opencode-go": "\u{f0174}", // nf-md-code-tags
  commandcode: "\u{f018d}", // nf-md-console
}

// ai-usagebar reports no accent colour, so brand-ish hexes give each provider a
// stable identity. Falls back to the theme text colour.
const ACCENTS: Record<string, string> = {
  openrouter: "#8b8bf5",
  deepseek: "#4d6bfe",
  "opencode-go": "#f5a97f",
  commandcode: "#a6e3a1",
}

type Options = {
  command?: string
  interval?: number
  timeout?: number
  providers?: string[]
  showErrors?: boolean
}

type Metric = {
  label: string
  percent: number
  severity?: string
  value?: string
  reset?: string
}

type TextRow = {
  label: string
  value: string
}

type Provider = {
  id: string
  name: string
  glyph?: string
  accent?: string
  plan?: string
  stale?: boolean
  error?: string
  metrics: Metric[]
  balances: TextRow[]
}

type Snapshot = {
  providers: Provider[]
  updatedAt?: number
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; snapshot: Snapshot }
  | { kind: "error"; message: string }

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readError(value: unknown): string | undefined {
  if (typeof value === "string") return readString(value)
  if (record(value)) return readString(value.detail) ?? readString(value.message)
  return undefined
}

// Account labels and diagnostics are CLI text and can echo credential-shaped
// fragments (e.g. an OpenRouter plan named after the key). Scrub before render.
function scrub(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{9,}/g, "sk-<redacted>")
    .replace(/(Bearer\s+)\S+/gi, "$1<redacted>")
    .replace(/\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[^\s"',}]+/gi, "$1=<redacted>")
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? scrub(trimmed) : undefined
}

function isGlyph(value: string | undefined): boolean {
  if (!value) return false
  return [...value].some((char) => (char.codePointAt(0) ?? 0) > 0x2000)
}

function glyphFor(id: string, icon: string | undefined): string | undefined {
  if (GLYPHS[id]) return GLYPHS[id]
  if (isGlyph(icon)) return icon
  return undefined
}

// The report's `plan` is a free-text headline: for balance vendors it carries
// the balance ("DeepSeek — $5.50"), for others the account label. Only a real
// plan/tier name is worth a line.
function meaningfulPlan(value: string | undefined, name: string): string | undefined {
  if (!value || value === name) return undefined
  if (/[$€¥£]/.test(value) || value.includes("<redacted>")) return undefined
  return value
}

function parseProvider(input: unknown): Provider | undefined {
  if (!record(input)) return
  const id = readString(input.id)
  const name = clean(readString(input.display_name) ?? readString(input.name)) ?? id
  if (!id || !name) return

  const metrics: Metric[] = []
  if (Array.isArray(input.metrics)) {
    for (const item of input.metrics) {
      if (!record(item)) continue
      const percent = readNumber(item.percent)
      if (percent === undefined) continue
      metrics.push({
        label: clean(readString(item.label)) ?? "quota",
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        severity: readString(item.severity),
        value: clean(readString(item.value)),
        reset: readString(item.reset_at),
      })
    }
  }

  // Only balances and the tariff survive: `text` rows are balance values
  // (DeepSeek "Balance $12.50"), a "Tier"/"Plan" block is the tariff. Other
  // blocks ("Usage by period") are dropped as noise.
  const balances: TextRow[] = []
  let tier: string | undefined
  if (Array.isArray(input.sections)) {
    for (const item of input.sections) {
      if (!record(item)) continue
      const type = readString(item.type)
      const label = clean(readString(item.label)) ?? ""
      if (type === "text") {
        const value = clean(readString(item.value))
        if (value) balances.push({ label, value })
      } else if (type === "block" && /tier|plan/i.test(label)) {
        const body = Array.isArray(item.body)
          ? item.body.map((line) => clean(readString(line))).filter((line): line is string => !!line)
          : []
        if (body.length) tier = body.join(" · ")
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
    balances,
  }
}

function parseReport(text: string): Provider[] {
  const data = JSON.parse(text)
  if (!record(data) || !Array.isArray(data.entries)) throw new Error("unexpected ai-usagebar output")
  const providers: Provider[] = []
  for (const item of data.entries) {
    const provider = parseProvider(item)
    if (provider) providers.push(provider)
  }
  return providers
}

async function runAiUsagebar(command: string, timeout: number) {
  if (typeof Bun === "undefined") throw new Error("Bun runtime unavailable")
  const proc = Bun.spawn([command, "usage", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => proc.kill(), Math.max(5, timeout) * 1000)
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (!out.trim()) {
      const detail = err.trim().split("\n").filter(Boolean).at(-1)
      throw new Error(detail || `${command} exited with code ${code}`)
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

function truncate(value: string, max = MAX_TEXT) {
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`
}

function bar(used: number) {
  const filled = Math.round((used / 100) * BAR_CELLS)
  return `${"█".repeat(filled)}${"░".repeat(BAR_CELLS - filled)}`
}

// `percent` is usage, not remaining: high is bad.
function severityColor(
  severity: string | undefined,
  used: number,
  theme: { success: unknown; warning: unknown; error: unknown },
) {
  if (severity === "critical" || used >= 100) return theme.error
  if (severity === "high" || severity === "mid" || used >= 80) return theme.warning
  return theme.success
}

function resetLabel(iso: string | undefined) {
  if (!iso) return ""
  const target = Date.parse(iso)
  if (Number.isNaN(target)) return ""
  const diff = target - Date.now()
  if (diff <= 0) return "now"
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function AiUsagebarSidebar(props: { api: Parameters<TuiPlugin>[0]; options: Options }) {
  const [state, setState] = createSignal<State>({ kind: "loading" })
  const theme = () => props.api.theme.current
  const interval = () => Math.max(60, props.options.interval ?? 60) * 1000
  const timeout = () => Math.max(5, props.options.timeout ?? 25)
  const command = () => props.options.command ?? "ai-usagebar"
  const showErrors = () => props.options.showErrors ?? true
  const filter = () => props.options.providers

  onMount(() => {
    let disposed = false
    let busy = false

    const refresh = async () => {
      if (busy || disposed) return
      busy = true
      try {
        const text = await runAiUsagebar(command(), timeout())
        let providers = parseReport(text)
        const only = filter()
        if (only?.length) providers = providers.filter((p) => only.includes(p.id))
        if (!disposed) setState({ kind: "ok", snapshot: { providers, updatedAt: Date.now() } })
      } catch (error) {
        if (!disposed) setState({ kind: "error", message: error instanceof Error ? error.message : String(error) })
      } finally {
        busy = false
      }
    }

    refresh()
    const timer = setInterval(refresh, interval())
    onCleanup(() => {
      disposed = true
      clearInterval(timer)
    })
  })

  const providers = createMemo(() => (state().kind === "ok" ? (state() as { snapshot: Snapshot }).snapshot.providers : []))
  const updated = createMemo(() => (state().kind === "ok" ? (state() as { snapshot: Snapshot }).snapshot.updatedAt : undefined))

  return (
    <box flexDirection="column" gap={0}>
      <text fg={theme().text}>
        <b>AI USAGE</b>
        <span style={{ fg: theme().textMuted }}> {updated() ? new Date(updated() as number).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span>
      </text>
      <Show when={state().kind === "loading"}>
        <text fg={theme().textMuted}>reading ai-usagebar...</text>
      </Show>
      <Show when={state().kind === "error"}>
        <text fg={theme().error}>{truncate((state() as { message: string }).message)}</text>
      </Show>
      <Show when={state().kind === "ok" && providers().length === 0}>
        <text fg={theme().textMuted}>no enabled providers</text>
      </Show>
      <For each={providers()}>{(provider) => <ProviderBlock provider={provider} theme={theme()} showErrors={showErrors()} />}</For>
    </box>
  )
}

function ProviderBlock(props: { provider: Provider; theme: ReturnType<Parameters<TuiPlugin>[0]>["theme"]["current"]; showErrors: boolean }) {
  const accent = () => props.provider.accent ?? props.theme.text

  return (
    <box flexDirection="column" gap={0} paddingTop={0}>
      <text fg={accent()}>
        {props.provider.glyph ? <span>{props.provider.glyph} </span> : null}
        <b>{props.provider.name}</b>
        {props.provider.plan ? <span style={{ fg: props.theme.textMuted }}> {truncate(props.provider.plan, 24)}</span> : null}
        {props.provider.stale ? <span style={{ fg: props.theme.textMuted }}> ⏸</span> : null}
      </text>
      <For each={props.provider.metrics}>
        {(metric) => (
          <text fg={props.theme.textMuted}>
            {" "}
            {truncate(metric.label, 12).padEnd(12, " ")}{" "}
            <span style={{ fg: severityColor(metric.severity, metric.percent, props.theme) }}>{bar(metric.percent)}</span>{" "}
            <span style={{ fg: props.theme.text }}>{String(metric.percent).padStart(3, " ")}%</span>
            {metric.value ? <span style={{ fg: props.theme.textMuted }}> {metric.value}</span> : null}
            {resetLabel(metric.reset) ? <span style={{ fg: props.theme.textMuted }}> ↺{resetLabel(metric.reset)}</span> : null}
          </text>
        )}
      </For>
      <For each={props.provider.balances}>
        {(row) => (
          <text fg={props.theme.textMuted}>
            {" "}
            {truncate(row.label ? `${row.label}: ${row.value}` : row.value)}
          </text>
        )}
      </For>
      <Show when={props.showErrors && props.provider.error}>
        <text fg={props.theme.error}> ✗ {truncate(props.provider.error as string)}</text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api, options) => {
  const opts = (options ?? {}) as Options
  api.slots.register({
    order: 275,
    slots: {
      sidebar_content() {
        return <AiUsagebarSidebar api={api} options={opts} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-ai-usagebar.sidebar",
  tui,
}

export default plugin
