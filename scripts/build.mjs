// Build dist/ with esbuild and pack web-ext-artifacts/thunderbird-translate-<version>.xpi with fflate.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"
import { zipSync } from "fflate"
import { checkLocales, readLocaleSources, writeLocales } from "./locales.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")
const artifacts = join(root, "web-ext-artifacts")
// --debug: content script starts translating on load and logs progress to the console.
const debug = process.argv.includes("--debug")

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const manifest = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"))
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest ${manifest.version} vs package.json ${pkg.version}`)
  process.exit(1)
}

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
cpSync(join(root, "static"), dist, { recursive: true })
cpSync(join(root, "LICENSE"), join(dist, "LICENSE"))

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

const result = await esbuild.build({
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    popup: "src/popup/index.ts",
    options: "src/options/index.ts",
  },
  absWorkingDir: root,
  outdir: dist,
  bundle: true,
  format: "iife",
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
  define: { "process.env.NODE_ENV": '"production"', __DEBUG__: String(debug) },
})

// Guard: a Node built-in in a bundle means it would fail inside Thunderbird.
const nodeImports = Object.keys(result.metafile.inputs).filter((p) => p.startsWith("node:") || /^(fs|path|crypto|stream|http|https|zlib|os)$/.test(p))
if (nodeImports.length) {
  console.error("Bundles reference Node built-ins:", nodeImports)
  process.exit(1)
}
for (const [file, info] of Object.entries(result.metafile.outputs)) {
  if (file.endsWith(".js")) console.log(`${file}: ${(info.bytes / 1024).toFixed(0)} KiB`)
}

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
const zip = zipSync(files, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") })
if (!existsSync(artifacts)) mkdirSync(artifacts, { recursive: true })
const out = join(artifacts, `thunderbird-translate-${manifest.version}${debug ? "-debug" : ""}.xpi`)
writeFileSync(out, zip)
console.log(`packed ${relative(root, out)} (${(zip.length / 1024).toFixed(0)} KiB, ${Object.keys(files).length} files)`)
