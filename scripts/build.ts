import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import { mkdir } from "node:fs/promises"

await mkdir("dist", { recursive: true })
const result = await Bun.build({
  entrypoints: ["plugin/tui.tsx"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  external: ["@opencode/plugin/tui", "@opentui/solid", "@opentui/core", "solid-js"],
  plugins: [createSolidTransformPlugin()],
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
console.log("built", result.outputs.map((output) => output.path).join(", "))
