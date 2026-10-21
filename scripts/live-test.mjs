// Calls the real Google and Microsoft endpoints through the extension's own
// translator modules (bundled with esbuild exactly as in the extension), and
// the services with an account of their own when their keys are in the
// environment; a service without its key is skipped:
//   DEEPL_KEY                 DeepL API (a key ending in ":fx" goes to api-free.deepl.com)
//   BAIDU_APPID, BAIDU_KEY    Baidu Translate; BAIDU_EDITION standard (default), advanced or premium
//   YOUDAO_APPKEY, YOUDAO_SECRET
//   CAIYUN_TOKEN
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
      export { deeplTranslateBatch, deeplUsage } from "./src/background/translators/deepl.ts"
      export { baiduTranslateBatch } from "./src/background/translators/baidu.ts"
      export { youdaoTranslateBatch } from "./src/background/translators/youdao.ts"
      export { caiyunTranslateBatch } from "./src/background/translators/caiyun.ts"
      export { DEEPL_FREE_URL, DEFAULT_DEEPL } from "./src/shared/settings.ts"
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

const env = process.env
/** A check of a service with an account, or a line saying why it is skipped. */
async function account(label, keys, fn) {
  if (keys.every((key) => env[key])) await check(label, fn)
  else console.log(`\n[SKIP] ${label}: set ${keys.join(" and ")}`)
}

await account("DeepL API, 3 paragraphs in 1 request", ["DEEPL_KEY"], async () => {
  const provider = { apiKey: env.DEEPL_KEY, baseURL: env.DEEPL_KEY.endsWith(":fx") ? t.DEEPL_FREE_URL : "https://api.deepl.com", deepl: t.DEFAULT_DEEPL }
  const { used, limit } = await t.deeplUsage(provider)
  console.log(`  usage: ${used} of ${limit} characters`)
  return t.deeplTranslateBatch(samples, "zh-CN", "en", provider)
})
const baidu = { appId: env.BAIDU_APPID, apiKey: env.BAIDU_KEY, baseURL: "https://fanyi-api.baidu.com/api/trans/vip/translate", edition: env.BAIDU_EDITION || "standard" }
await account("Baidu Translate, 3 paragraphs as the lines of 1 request", ["BAIDU_APPID", "BAIDU_KEY"], () => t.baiduTranslateBatch(samples, "zh-CN", "auto", baidu))
const youdao = { appId: env.YOUDAO_APPKEY, apiKey: env.YOUDAO_SECRET, baseURL: "https://openapi.youdao.com/v2/api" }
await account("Youdao batch translation, 3 paragraphs in 1 request", ["YOUDAO_APPKEY", "YOUDAO_SECRET"], async () =>
  (await t.youdaoTranslateBatch(samples, "zh-CN", "en", youdao)).map((r) => (r.status === "fulfilled" ? r.value : `(failed: ${r.reason?.message})`)),
)
await account("Caiyun, 3 paragraphs in 1 request", ["CAIYUN_TOKEN"], () =>
  t.caiyunTranslateBatch(samples, "zh-CN", "en", { apiKey: env.CAIYUN_TOKEN, baseURL: "https://api.interpreter.caiyunai.com/v1/translator" }),
)

process.exit(failures > 0 ? 1 : 0)
