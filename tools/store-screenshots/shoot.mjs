// Screenshots for the listing on addons.thunderbird.net: node tools/store-screenshots/shoot.mjs
//
// Serves dist/ (run npm run build first) on 127.0.0.1 with the pages of this folder and a stand-in for Thunderbird's
// WebExtension API (stub.js), opens each page in headless Chrome at 1280×800 and writes store/screenshots/*.png.
// The message is a made-up German email with made-up names and example.com addresses; the pages are the real
// pages of the extension. No Thunderbird or Mozilla logo appears. CHROME_BIN selects the browser.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "..", "..")
const dist = join(root, "dist")
const out = join(root, "store", "screenshots")
const WIDTH = 1280
const HEIGHT = 800
const PORT = 9339

const CHROME =
  process.env.CHROME_BIN ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p))

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".zst": "application/octet-stream" }

/** dist/ with the stand-in API in front of the scripts of the pages, the pages of this folder, and the locale sources. */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname)
    let file
    if (path.startsWith("/__shots/")) file = join(here, path.slice("/__shots/".length))
    else if (path.startsWith("/__locales/")) file = join(root, "locales", path.slice("/__locales/".length))
    else file = join(dist, path === "/" ? "index.html" : path)
    file = normalize(file)
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    let body = readFileSync(file)
    if (file.startsWith(dist) && extname(file) === ".html") body = Buffer.from(body.toString("utf8").replace("<head>", '<head>\n<script src="/__shots/stub.js"></script>'))
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

const SHOTS = [
  { name: "1-bilingual", url: "/__shots/mail.html?shot=bilingual", ready: "frame('body').querySelectorAll('.tt-translation').length === 5 && !frame('body').querySelector('.tt-loading')" },
  { name: "2-translation-only", url: "/__shots/mail.html?shot=translation-only", ready: "frame('body').querySelectorAll('.tt-translation.tt-only').length === 5" },
  { name: "3-provisional-tiers", url: "/__shots/mail.html?shot=provisional", ready: "frame('body').querySelectorAll('.tt-translation.tt-provisional').length >= 4" },
  { name: "4-popup", url: "/__shots/mail.html?shot=popup", ready: "frame('body').querySelectorAll('.tt-translation').length === 5 && document.querySelector('iframe.popup').contentDocument.getElementById('status')?.textContent.trim().length > 0" },
  { name: "5-settings-tiers", url: "/options.html?shot=settings", ready: "document.querySelector('#providerPanel h3') !== null && document.getElementById('tier-ai').value === 'openai'", after: "window.scrollTo(0, document.getElementById('tiers').getBoundingClientRect().top + window.scrollY - 76)" },
  { name: "6-setup-guide", url: "/welcome.html?shot=welcome", ready: "/OpenAI/.test(document.getElementById('demoStatus')?.textContent ?? '')" },
  { name: "7-consent", url: "/__shots/mail.html?shot=consent", ready: "frame('body').querySelector('.tt-consent') !== null" },
]

const FRAME = "const frame = (id) => document.getElementById(id).contentDocument;"

async function main() {
  if (!existsSync(join(dist, "manifest.json"))) throw new Error("dist/ is missing: run npm run build first")
  if (!CHROME) throw new Error("no Chrome or Edge found; set CHROME_BIN")
  mkdirSync(out, { recursive: true })
  const server = await serve()
  const profile = join(root, ".cache", "store-screenshots-profile")
  rmSync(profile, { recursive: true, force: true })
  const chrome = spawn(CHROME, ["--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT + 1}`, "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" })
  try {
    for (const shot of SHOTS) {
      const page = await openPage()
      await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
      await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] })
      await page.send("Page.enable")
      await page.send("Page.navigate", { url: `http://127.0.0.1:${PORT}${shot.url}` })
      const deadline = Date.now() + 20_000
      for (;;) {
        const { result } = await page.send("Runtime.evaluate", { expression: `(() => { try { ${FRAME} return Boolean(${shot.ready}) } catch { return false } })()`, returnByValue: true })
        if (result.value === true) break
        if (Date.now() > deadline) {
          const probe = await page.send("Runtime.evaluate", { expression: `(() => { try { ${FRAME} const b = document.getElementById('body'); return (b ? frame('body').body.innerHTML : document.body.innerHTML).slice(0, 1500) } catch (e) { return String(e) } })()`, returnByValue: true })
          throw new Error(`${shot.name}: the page did not get ready
${probe.result.value}`)
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      if (shot.after) await page.send("Runtime.evaluate", { expression: shot.after })
      // Transitions of the renderer and the demo end.
      await new Promise((r) => setTimeout(r, 700))
      const { data } = await page.send("Page.captureScreenshot", { format: "png" })
      writeFileSync(join(out, `${shot.name}.png`), Buffer.from(data, "base64"))
      console.log(`store/screenshots/${shot.name}.png`)
      page.close()
    }
  } finally {
    chrome.kill()
    server.close()
  }
}

await main()
