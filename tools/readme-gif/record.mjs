// The animations of the README: node tools/readme-gif/record.mjs [en] [zh-CN] [zh-TW]
//
// Serves dist/ (run npm run build first) on 127.0.0.1 with the pages of this folder and a stand-in for Thunderbird's
// WebExtension API (stub.js), as tools/store-screenshots/shoot.mjs does. stage.html shows the real popup and the
// real content script on a made-up message (samples.js) and holds a timeline; this script steps through it frame by
// frame, waits until the page shows the state of each frame, and takes a screenshot with headless Chrome. ffmpeg then
// encodes docs/media/tiers-<variant>.gif in two passes: a palette of the frames, then the frames with that palette.
// CHROME_BIN selects the browser and FFMPEG_BIN the encoder; without FFMPEG_BIN, ffmpeg is looked up on the PATH.
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "..", "..")
const dist = join(root, "dist")
const out = join(root, "docs", "media")
const work = join(root, ".cache", "readme-gif")
const WIDTH = 900
const HEIGHT = 620
const FPS = 12
const PORT = 9349
const VARIANTS = ["en", "zh-CN", "zh-TW"]
/** Largest file the README should carry. */
const MAX_BYTES = 2.5 * 1024 * 1024

const CHROME =
  process.env.CHROME_BIN ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p))
const FFMPEG = process.env.FFMPEG_BIN ?? "ffmpeg"

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" }

/** dist/ with the stand-in API in front of the scripts of the pages, the pages of this folder, and the locale sources. */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname)
    let file
    if (path.startsWith("/__gif/")) file = join(here, path.slice("/__gif/".length))
    else if (path.startsWith("/__locales/")) file = join(root, "locales", path.slice("/__locales/".length))
    else file = join(dist, path === "/" ? "index.html" : path)
    file = normalize(file)
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    let body = readFileSync(file)
    if (file.startsWith(dist) && extname(file) === ".html") body = Buffer.from(body.toString("utf8").replace("<head>", '<head>\n<script src="/__gif/samples.js"></script>\n<script src="/__gif/stub.js"></script>'))
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body)
  })
  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)))
}

/** A minimal Chrome DevTools Protocol client over the WebSocket of one page. */
async function openPage() {
  for (let i = 0; i < 50; i++) {
    try {
      const target = await (await fetch(`http://127.0.0.1:${PORT + 1}/json/new?about:blank`, { method: "PUT" })).json()
      const ws = new WebSocket(target.webSocketDebuggerUrl)
      await new Promise((ok, fail) => {
        ws.onopen = ok
        ws.onerror = fail
      })
      let id = 0
      const pending = new Map()
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id && pending.has(msg.id)) {
          const { ok, fail } = pending.get(msg.id)
          pending.delete(msg.id)
          if (msg.error) fail(new Error(JSON.stringify(msg.error)))
          else ok(msg.result)
        }
      }
      const send = (method, params = {}) =>
        new Promise((ok, fail) => {
          pending.set(++id, { ok, fail })
          ws.send(JSON.stringify({ id, method, params }))
        })
      return { send, close: () => ws.close() }
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error("Chrome did not open its debugging port")
}

/** Evaluate an expression in the page and return its value; an exception in the page is thrown here. */
async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (exceptionDetails) throw new Error(`${expression}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
  return result.value
}

/** Poll until the expression is true. */
async function until(page, expression, what) {
  const deadline = Date.now() + 20_000
  while (!(await evaluate(page, `(() => { try { return Boolean(${expression}) } catch { return false } })()`))) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

/** Two animation frames of the stage and of its frames, so that what changed is drawn. */
const PAINTED = "new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true))))"

async function record(variant) {
  const frames = join(work, `frames-${variant}`)
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames, { recursive: true })
  const page = await openPage()
  await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] })
  await page.send("Page.enable")
  await page.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/__gif/stage.html?variant=${variant}` })
  await until(page, "window.stage && stage.ready()", `${variant}: the pages to load`)
  await evaluate(page, "document.fonts.ready.then(() => true)")
  const duration = await evaluate(page, "stage.duration")
  const count = Math.round(duration * FPS)
  for (let i = 0; i < count; i++) {
    const s = i / FPS
    await evaluate(page, `stage.at(${s})`)
    await until(page, `stage.settled(${s})`, `${variant}: the state at ${s.toFixed(2)} s`)
    await evaluate(page, PAINTED)
    const { data } = await page.send("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(frames, `${String(i).padStart(4, "0")}.png`), Buffer.from(data, "base64"))
  }
  page.close()
  return { frames, count }
}

function ffmpeg(args) {
  const run = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" })
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`)
}

/** Two passes: one palette for all frames, weighted towards what changes between them, then the frames with it. */
function encode(variant, { frames, count }) {
  const input = ["-framerate", String(FPS), "-i", join(frames, "%04d.png")]
  const palette = join(work, `palette-${variant}.png`)
  ffmpeg([...input, "-vf", "palettegen=max_colors=256:stats_mode=full", palette])
  const gif = join(out, `tiers-${variant}.gif`)
  ffmpeg([...input, "-i", palette, "-lavfi", "paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", "-loop", "0", gif])
  const bytes = statSync(gif).size
  console.log(`docs/media/tiers-${variant}.gif: ${WIDTH}×${HEIGHT}, ${count} frames at ${FPS} fps (${(count / FPS).toFixed(1)} s), ${(bytes / 1024).toFixed(0)} KiB`)
  if (bytes > MAX_BYTES) throw new Error(`tiers-${variant}.gif is larger than ${MAX_BYTES} bytes`)
}

async function main() {
  if (!existsSync(join(dist, "manifest.json"))) throw new Error("dist/ is missing: run npm run build first")
  if (!CHROME) throw new Error("no Chrome or Edge found; set CHROME_BIN")
  const variants = process.argv.slice(2).length ? process.argv.slice(2) : VARIANTS
  for (const v of variants) if (!VARIANTS.includes(v)) throw new Error(`unknown variant ${v}; one of ${VARIANTS.join(", ")}`)
  mkdirSync(out, { recursive: true })
  const server = await serve()
  const profile = join(work, "profile")
  rmSync(profile, { recursive: true, force: true })
  const chrome = spawn(CHROME, ["--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT + 1}`, "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" })
  try {
    for (const variant of variants) encode(variant, await record(variant))
  } finally {
    chrome.kill()
    server.close()
  }
}

await main()
