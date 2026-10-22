// Build dist/ with esbuild and pack web-ext-artifacts/thunderbird-translate-<version>.xpi with fflate.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"
import { zipSync } from "fflate"
import { checkLocales, readLocaleSources, writeLocales } from "./locales.mjs"
import { BERGAMOT_WASM_FILE, ensureBergamotWasm } from "./fetch-bergamot.mjs"
import { e2eHooks } from "./e2e-hooks.mjs"
import { thirdPartyNotices } from "./notices.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
// --debug: content script starts translating on load and logs progress to the console.
const debug = process.argv.includes("--debug")
// --e2e <server>: test build for npm run e2e, with the hooks of src/e2e/hooks/ in place of src/hooks/, talking to the mock server;
// built into .cache/e2e/.
const e2eIndex = process.argv.indexOf("--e2e")
const e2eServer = e2eIndex === -1 ? "" : process.argv[e2eIndex + 1]
if (e2eIndex !== -1 && !/^http:\/\/127\.0\.0\.1:\d+$/.test(e2eServer ?? "")) {
  console.error("--e2e needs the mock server, e.g. --e2e http://127.0.0.1:8080")
  process.exit(1)
}
const e2e = e2eIndex !== -1
const dist = e2e ? join(root, ".cache", "e2e", "dist") : join(root, "dist")
const artifacts = e2e ? join(root, ".cache", "e2e") : join(root, "web-ext-artifacts")
const E2E_MARKER = "tt-e2e-hook"

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
const manifest = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"))
// The version lives in four places: the manifest, package.json and both fields of package-lock.json.
const versions = { "package.json": pkg.version, "package-lock.json version": lock.version, 'package-lock.json packages[""].version': lock.packages?.[""]?.version }
const mismatches = Object.entries(versions).filter(([, version]) => version !== manifest.version)
if (mismatches.length) {
  console.error(`Version mismatch: manifest ${manifest.version} vs ${mismatches.map(([where, version]) => `${where} ${version}`).join(", ")}`)
  process.exit(1)
}

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
cpSync(join(root, "static"), dist, { recursive: true })
cpSync(join(root, "LICENSE"), join(dist, "LICENSE"))
// The test build reaches the mock server on 127.0.0.1 as a host of its manifest; a regular build asks the user for such an address.
// The test build also carries the experiment e2eCapture (src/e2e/capture/), which takes the screenshots of the e2e runs.
if (e2e) {
  const built = {
    ...manifest,
    permissions: [...manifest.permissions, "http://127.0.0.1/*"],
    experiment_apis: { e2eCapture: { schema: "e2e/capture/schema.json", parent: { scopes: ["addon_parent"], paths: [["e2eCapture"]], script: "e2e/capture/implementation.js" } } },
  }
  writeFileSync(join(dist, "manifest.json"), `${JSON.stringify(built, null, 2)}\n`)
  cpSync(join(root, "src", "e2e", "capture"), join(dist, "e2e", "capture"), { recursive: true })
}
// Bergamot offline engine: glue script (vendor/) and the pinned, zstd-compressed wasm (downloaded to .cache/).
cpSync(join(root, "vendor", "bergamot", "bergamot-translator.js"), join(dist, "bergamot-translator.js"))
cpSync(await ensureBergamotWasm(), join(dist, BERGAMOT_WASM_FILE))

// _locales/<locale>/messages.json from locales/*.json; refuse to build with incomplete translations.
const localeSources = readLocaleSources()
const localeProblems = checkLocales(localeSources)
if (localeProblems.length) {
  for (const problem of localeProblems) console.error(problem)
  process.exit(1)
}
const locales = writeLocales(join(dist, "_locales"), localeSources)
if (!locales.includes(manifest.default_locale)) {
  console.error(`default_locale ${manifest.default_locale} has no locales/${manifest.default_locale}.json`)
  process.exit(1)
}
console.log(`_locales: ${locales.join(", ")}`)

const options = {
  absWorkingDir: root,
  outdir: dist,
  bundle: true,
  platform: "browser",
  target: ["firefox128"],
  // Prefer browser builds of dependencies; never pull Node built-ins.
  mainFields: ["browser", "module", "main"],
  conditions: ["browser", "import", "default"],
  minify: true,
  legalComments: "linked",
  charset: "utf8",
  logLevel: "info",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"', __DEBUG__: String(debug), __E2E_SERVER__: JSON.stringify(e2eServer) },
  plugins: e2e ? [e2eHooks(root)] : [],
}
/**
 * The English table (locales/en.json) as an empty object: only the background script bundles it. A page reads
 * _locales/en/messages.json when it loads its language, and the content script gets its tables, English included,
 * from the background script (src/shared/i18n.ts). This keeps one copy of the English texts out of every page.
 */
const englishOutside = {
  name: "english-outside",
  setup(build) {
    build.onResolve({ filter: /locales[\\/]en\.json$/ }, () => ({ path: "en.json", namespace: "english-outside" }))
    build.onLoad({ filter: /.*/, namespace: "english-outside" }, () => ({ contents: "export default {}", loader: "js" }))
  },
}

// The background script is an ES module ("type": "module" in the manifest), so the packages of the AI SDK
// become chunks that load with the first AI request. Content script, pages and worker stay classic scripts.
const builds = await Promise.all([
  esbuild.build({
    ...options,
    entryPoints: { background: "src/background/index.ts" },
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
  }),
  esbuild.build({
    ...options,
    entryPoints: {
      content: "src/content/index.ts",
      popup: "src/popup/index.ts",
      options: "src/options/index.ts",
      welcome: "src/welcome/index.ts",
      "bergamot-worker": "src/offline/bergamot/worker.ts",
    },
    format: "iife",
    plugins: [...options.plugins, englishOutside],
  }),
])
const result = { metafile: { inputs: Object.assign({}, ...builds.map((b) => b.metafile.inputs)), outputs: Object.assign({}, ...builds.map((b) => b.metafile.outputs)) } }

// Guard: the English table is in the background script alone.
const english = Object.entries(builds[1].metafile.outputs).filter(([, output]) => Object.keys(output.inputs).some((input) => input.endsWith("locales/en.json")))
if (english.length) {
  console.error("The English table in a page or the content script:", english.map(([file]) => file))
  process.exit(1)
}

// Guard: a Node built-in in a bundle means it would fail inside Thunderbird.
const nodeImports = Object.keys(result.metafile.inputs).filter((p) => p.startsWith("node:") || /^(fs|path|crypto|stream|http|https|zlib|os)$/.test(p))
if (nodeImports.length) {
  console.error("Bundles reference Node built-ins:", nodeImports)
  process.exit(1)
}
// Guard: the e2e hooks exist only in the e2e build.
const withHooks = Object.keys(result.metafile.outputs).filter((file) => file.endsWith(".js") && readFileSync(join(root, file), "utf8").includes(E2E_MARKER))
if (!e2e && withHooks.length) {
  console.error("e2e hooks in a regular build:", withHooks)
  process.exit(1)
}
if (e2e && withHooks.length === 0) {
  console.error("e2e build without the e2e hooks")
  process.exit(1)
}
// Guard: an absent hook called as `hook?.()` becomes `(void 0)?.()`, which the validator of addons.thunderbird.net
// (eslint-plugin-no-unsanitized) cannot read; call hooks inside an if instead.
const voidCalls = Object.keys(result.metafile.outputs).filter((file) => file.endsWith(".js") && /\(void 0\)(\?\.)?\(/.test(readFileSync(join(root, file), "utf8")))
if (voidCalls.length) {
  console.error("a call of (void 0) in:", voidCalls)
  process.exit(1)
}
// Guard: a regular build parses no file of src/e2e/ (metafile.inputs lists every file esbuild read); the e2e build
// reads src/e2e/hooks/ in place of every module of src/hooks/, so a module of src/hooks/ among its inputs was not replaced.
const inputs = Object.keys(result.metafile.inputs)
const e2eSources = inputs.filter((input) => input.startsWith("src/e2e/"))
if (!e2e && e2eSources.length) {
  console.error("e2e sources in a regular build:", e2eSources)
  process.exit(1)
}
if (e2e && e2eSources.length === 0) {
  console.error("e2e build without the e2e sources")
  process.exit(1)
}
const unreplaced = inputs.filter((input) => input.startsWith("src/hooks/"))
if (e2e && unreplaced.length) {
  console.error("hooks of src/hooks/ not replaced in the e2e build:", unreplaced)
  process.exit(1)
}
// Guard: the test build carries only the experiment of its screenshots, a build for users none, in its manifest and as files.
const shipped = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String) : [])
const experimentProblems = [
  ...Object.keys(JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8")).experiment_apis ?? {})
    .filter((name) => !(e2e && name === "e2eCapture"))
    .map((name) => `the experiment ${name} in the manifest of the build`),
  ...(e2e ? [] : shipped(join(dist, "e2e")).map((file) => `e2e/${file} in a regular build`)),
]
if (experimentProblems.length) {
  console.error(experimentProblems.join("\n"))
  process.exit(1)
}
// The npm packages of the bundles with their licenses, the Bergamot engine and the dictionary data; stops on a bundled
// package that scripts/notices.mjs does not declare, and on a missing license text or copyright line.
try {
  writeFileSync(join(dist, "THIRD-PARTY-NOTICES.txt"), thirdPartyNotices({ root, inputs, version: manifest.version }))
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
const jsOutputs = Object.entries(result.metafile.outputs).filter(([file]) => file.endsWith(".js"))
for (const [file, info] of jsOutputs) if (!file.includes("/chunks/")) console.log(`${file}: ${(info.bytes / 1024).toFixed(0)} KiB`)
const chunks = jsOutputs.filter(([file]) => file.includes("/chunks/"))
console.log(`${chunks.length} chunks of the background script: ${(chunks.reduce((n, [, info]) => n + info.bytes, 0) / 1024).toFixed(0)} KiB`)

// Pack the xpi (a zip with manifest.json at the root).
const files = {}
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else files[relative(dist, full).split(sep).join("/")] = new Uint8Array(readFileSync(full))
  }
}
walk(dist)
if (!files["manifest.json"]) throw new Error("manifest.json missing from dist")
// A zip stores the local time of its entries (fflate reads the hours of a Date in the time zone of the machine): a date
// made from local fields gives every entry 2026-01-01 00:00 in every time zone, so the xpi is the same everywhere.
const zip = zipSync(files, { level: 9, mtime: new Date(2026, 0, 1) })
if (!existsSync(artifacts)) mkdirSync(artifacts, { recursive: true })
const out = join(artifacts, `thunderbird-translate-${manifest.version}${e2e ? "-e2e" : debug ? "-debug" : ""}.xpi`)
writeFileSync(out, zip)
console.log(`packed ${relative(root, out)} (${(zip.length / 1024).toFixed(0)} KiB, ${Object.keys(files).length} files)`)
