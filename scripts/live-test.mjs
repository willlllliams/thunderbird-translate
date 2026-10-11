// Calls the real Google and Microsoft endpoints through the extension's own
// translator modules (bundled with esbuild exactly as in the extension).
// Usage: npm run live-test
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "node_modules", ".cache", "live-test")
mkdirSync(outDir, { recursive: true })
const outfile = join(outDir, "translators.mjs")

await esbuild.build({
  stdin: {
    contents: `
      export { googleTranslateBatch } from "./src/background/translators/google.ts"
      export { microsoftTranslateBatch } from "./src/background/translators/microsoft.ts"
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile,
  logLevel: "warning",
})

const t = await import(pathToFileURL(outfile).href)

const samples = ["Hello, how are you today?", "The meeting has been moved to Thursday at 10 a.m.", "Please find the quarterly report attached."]
let failures = 0

async function check(label, fn) {
  const started = Date.now()
  try {
    const out = await fn()
    console.log(`\n[OK] ${label} (${Date.now() - started} ms)`)
    out.forEach((line, i) => console.log(`  ${samples[i]}\n  -> ${line}`))
    if (!out.every((s) => /[一-鿿]/.test(s))) {
      failures++
      console.log("  !! output does not look like Chinese")
    }
  } catch (error) {
    console.log(`\n[FAIL] ${label}: ${error?.message ?? error}`)
    return error
  }
}

await check("Google translate_a/t, 3 paragraphs in 1 request", () => t.googleTranslateBatch(samples, "zh-CN"))
await check("Google translate_a/t with source language en", () => t.googleTranslateBatch(samples, "zh-CN", { source: "en" }))
await check("Microsoft direct route (edge.microsoft.com/translate/translatetext)", () => t.microsoftTranslateBatch(samples, "zh-Hans"))
await check("Microsoft direct route with source language en", () => t.microsoftTranslateBatch(samples, "zh-Hans", { from: "en" }))

process.exit(failures > 0 ? 1 : 0)
