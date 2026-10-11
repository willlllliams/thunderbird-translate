// End-to-end test in a real Thunderbird: npm run e2e
//
// 1. Start the mock server (e2e/mock-server.mjs) and build the test xpi against it
//    (scripts/build.mjs --e2e: the hooks of src/e2e/ preset the three tiers
//    dictionary / Google / AI on the mock server and drive the content script).
// 2. For each fixture message, start a headless Thunderbird on a temporary profile
//    with the xpi preinstalled and the message opened from the command line.
// 3. The content script translates, switches to translation-only and restores the
//    original, then reports what it saw; this script checks the report together
//    with the requests the mock server received.
// 4. A last Thunderbird, started without a message, opens the setup guide
//    (src/welcome/), where the probe of src/e2e/welcome.ts clicks through to the
//    offline step, downloads the dictionary pack and the Bergamot model from the
//    mock server (Remote Settings stand-in), deletes them again and reports.
//
// THUNDERBIRD_BIN selects the Thunderbird binary. Exit code 1 on any failure.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { startMockServer } from "./mock-server.mjs"
import { createProfile, findThunderbird, launch, removeProfile, stop, thunderbirdVersion } from "./thunderbird.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const fixtures = join(root, "e2e", "fixtures")
const work = join(root, ".cache", "e2e")
const STEP_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS) || 180_000

/** The fixture messages and the paragraphs the extension must find in them. */
const CASES = [
  // 2 paragraphs, 2 list items, 2 table cells, 1 quote; the code block and the Chinese paragraph are skipped.
  { name: "html", eml: "html.eml", paragraphs: 7 },

  // 4 paragraphs and 1 quote; the Chinese paragraph is skipped.
  { name: "plain", eml: "plain.eml", paragraphs: 5 },
]

/** The scenario after the messages: the offline downloads of the setup guide. */
const WELCOME = { name: "welcome", scenario: "welcome" }

const TIER_ORDER = ["dictionary", "machine", "ai"]
const CJK = /[一-鿿]/
/** Letters and digits only, for comparing a translation with the text it came from. */
const words = (s) => s.replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** Check one report; returns the failures. */
function check(c, ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }

  expect(!ready.error, "setup of the test settings failed", ready.error)
  expect(ready.packs?.includes("en>zh-Hans"), "dictionary pack not installed", ready.packs)
  // The Bergamot worker started its wasm engine and then refused the request without model files.
  expect(ready.bergamotWorker === "no model file for en → zh-Hans", "Bergamot worker did not start its engine", ready.bergamotWorker)
  if (report.error) {
    failures.push(`content script: ${report.error}`)
    return failures
  }
  const original = words(report.originalText ?? "")

  // Paragraphs and the final AI translations in bilingual mode.
  const translated = report.translated
  expect(translated?.state?.total === c.paragraphs, `expected ${c.paragraphs} paragraphs`, translated?.state)
  expect(translated?.state?.done === c.paragraphs && translated.state.failed === 0, "not every paragraph has the AI translation", translated?.state)
  expect(translated?.shown?.length === c.paragraphs, `expected ${c.paragraphs} translations on screen`, translated?.shown?.length)
  for (const s of translated?.shown ?? []) {
    const ok = s.mode === "bilingual" && s.mark === null && s.text.startsWith("[AI bilingual] ") && original.includes(words(s.text.slice(15)).slice(0, 40))
    expect(ok, "final bilingual translation is not the AI translation of a paragraph", s)
  }

  // Tier order per paragraph request: dictionary, then Google, then AI.
  const first = report.events.filter((e) => e.phase === "translate")
  const byRequest = Map.groupBy(first, (e) => e.id)
  expect(byRequest.size === c.paragraphs, `expected ${c.paragraphs} paragraph requests`, byRequest.size)
  for (const [id, events] of byRequest) {
    const order = events.map((e) => e.tier)
    expect(JSON.stringify(order) === JSON.stringify(TIER_ORDER), `request ${id}: tiers arrived as ${order.join(", ")}`)
    expect(events.every((e) => e.ok), `request ${id}: a tier failed`, events.filter((e) => !e.ok))
  }

  // Provisional translations of the lower tiers were on screen before the AI result.
  const provisional = first.flatMap((e) => e.shown).filter((s) => s.mark === "provisional")
  expect(provisional.some((s) => CJK.test(s.text) && !s.text.startsWith("[")), "no provisional dictionary translation was shown", provisional.slice(0, 3))
  expect(provisional.some((s) => s.text.startsWith("[G] ")), "no provisional Google translation was shown", provisional.slice(0, 3))

  // Translation-only: only the AI tier is requested again, with the translation-only prompt.
  const second = report.events.filter((e) => e.phase === "mode")
  expect(second.length === c.paragraphs && second.every((e) => e.tier === "ai" && e.ok), "after the mode switch only the AI tier must answer, once per paragraph", second.map((e) => `${e.tier}:${e.ok}`))
  const only = report.translationOnly
  expect(only?.shown?.length === c.paragraphs, "translation-only: wrong number of translations", only?.shown?.length)
  for (const s of only?.shown ?? []) {
    expect(s.mode === "only" && s.mark === null && s.text.startsWith("[AI translation-only] "), "translation-only shows something other than the AI translation", s)
  }

  // Requests the mock server saw, split at the mode switch.
  const switchAt = calls.findIndex((x) => x.type === "mark" && x.command === "toggle-display-mode")
  expect(switchAt !== -1, "the mode switch command never reached the background script")
  const before = calls.slice(0, switchAt)
  const after = calls.slice(switchAt + 1)
  const ai = (list) => list.filter((x) => x.type === "ai")
  expect(before.some((x) => x.type === "google"), "Google was not requested")
  expect(ai(before).length > 0 && ai(before).every((x) => x.mode === "bilingual"), "AI requests before the switch must use the bilingual prompt", ai(before))
  expect(!after.some((x) => x.type === "google"), "Google was requested again after the mode switch", after)
  expect(ai(after).length > 0 && ai(after).every((x) => x.mode === "translation-only"), "AI requests after the switch must use the translation-only prompt", ai(after))
  expect(ai(calls).every((x) => x.model === "e2e-model" && x.auth === "Bearer e2e-test-key"), "AI requests carry the wrong model or key", ai(calls)[0])

  // Restoring gives back the original DOM.
  const restored = report.restored
  expect(restored?.identical === true, "the restored message differs from the original", restored && { original: restored.original, after: restored.after })
  expect(restored?.leftovers === 0 && restored?.styleLeft === false, "elements of the extension remain after restoring", restored)
  expect(restored?.state?.active === false, "the content script still reports itself active", restored?.state)
  return failures
}

/** Check the report of the setup guide; returns the failures. */
function checkWelcome(ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "welcome", "setup of the welcome scenario failed", ready)
  if (report.error) {
    failures.push(`setup guide: ${report.error}`)
    failures.push(`page at the time: ${JSON.stringify(report.screen)}`)
    return failures
  }

  // The offline step offers the recommended pack and model, ticked, and nothing is installed yet.
  const only = (list) => (list?.rows.length === 1 ? list.rows[0] : null)
  for (const kind of ["dictionary", "bergamot"]) {
    const row = only(report.offered?.[kind])
    expect(row && !row.installed && row.checkbox?.checked === true && row.checkbox.disabled === false, `${kind}: expected one ticked row to download`, report.offered?.[kind])
  }
  const empty = { bergamotInstalled: [], bergamotMissing: ["en>zh-Hans"], dictionaryInstalled: [], bergamotRecords: { pairs: 0, files: 0 }, dictionaryRecords: { packs: 0, data: 0 } }
  expect(JSON.stringify(report.initial) === JSON.stringify(empty), "something was installed before the download", report.initial)

  // The click starts the download; the lists show the progress and then the installed state.
  expect(report.disabledWhileDownloading === true, "the Download selected button stayed enabled while downloading")
  for (const kind of ["dictionary", "bergamot"]) {
    const seen = report.progress?.[kind] ?? []
    expect(seen.length > 0 && seen.includes(0) && seen.some((p) => p > 0 && p < 100), `${kind}: no progress between 0 and 100 % on the page`, seen)
    const row = only(report.finished?.[kind])
    expect(row?.installed === true && row.checkbox === null && row.error === null, `${kind}: the page does not show the download as finished`, report.finished?.[kind])
  }

  // Stored for real: the answers of the background script and the object stores of the two databases.
  const done = { bergamotInstalled: ["en>zh-Hans"], bergamotMissing: [], dictionaryInstalled: ["en>zh-Hans"], bergamotRecords: { pairs: 1, files: 3 }, dictionaryRecords: { packs: 1, data: 1 } }
  expect(JSON.stringify(report.downloaded) === JSON.stringify(done), "stored data after the download", report.downloaded)
  expect(JSON.stringify(report.removed) === JSON.stringify(empty), "data left after the deletion", report.removed)

  // What the mock server saw: model list, three model files, the pack.
  const seen = calls.filter((x) => x.type === "bergamot").map((x) => x.what)
  expect(seen.includes("server root") && seen.includes("records") && seen.filter((w) => w.endsWith(".zst")).length === 3, "Remote Settings requests of the mock server", seen)
  expect(calls.some((x) => x.type === "download" && x.file === "dict-en-zh-Hans.tsv.gz"), "the dictionary pack was not downloaded")
  return failures
}

function tail(file, lines = 60) {
  try {
    return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-lines).join("\n")
  } catch {
    return "(no output)"
  }
}

async function main() {
  const bin = findThunderbird()
  console.log(`Thunderbird: ${bin} (${thunderbirdVersion(bin)})`)
  mkdirSync(work, { recursive: true })
  const extensionLog = []
  const server = await startMockServer({ fixtures, log: (m) => extensionLog.push(m) })
  console.log(`mock server: ${server.url}`)

  execFileSync(process.execPath, [join(root, "scripts", "build.mjs"), "--e2e", server.url], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const manifest = JSON.parse(readFileSync(join(work, "dist", "manifest.json"), "utf8"))
  const xpi = readFileSync(join(work, `thunderbird-translate-${manifest.version}-e2e.xpi`))
  const profile = createProfile(xpi, manifest.browser_specific_settings.gecko.id)
  console.log(`profile: ${profile}`)

  let failed = 0
  try {
    for (const c of [...CASES, WELCOME]) {
      server.reset()
      server.setScenario(c.scenario ?? "message")
      extensionLog.length = 0
      const logFile = join(work, `thunderbird-${c.name}.log`)
      const started = Date.now()
      const tb = launch(bin, profile, c.eml && join(fixtures, c.eml), logFile)
      let failures
      try {
        // A Thunderbird that fails to start (missing libraries, crash) ends the wait early.
        const crashed = tb.exited.then((code) => (code ? Promise.reject(new Error(`Thunderbird exited with code ${code}`)) : new Promise(() => {})))
        const ready = await Promise.race([server.next("/ready", STEP_TIMEOUT_MS), crashed])
        const report = await Promise.race([server.next("/report", STEP_TIMEOUT_MS), crashed])
        if (c.scenario === "welcome") {
          failures = checkWelcome(ready, report, server.calls)
          if (failures.length) failures.push(`report of the page:
${JSON.stringify(report, null, 2)}`)
          const { dictionary, bergamot } = report.progress ?? {}
          console.log(`  ${c.name}: progress of the pack ${dictionary?.join(", ")} %, of the model ${bergamot?.join(", ")} %; stored ${JSON.stringify(report.downloaded?.bergamotRecords)}, then deleted`)
        } else {
          failures = check(c, ready, report, server.calls)
          if (failures.length) failures.push(`message body as displayed:\n${report.originalHtml}`)
          const firstRequest = report.events?.filter((e) => e.phase === "translate" && e.id === report.events[0].id).map((e) => `${e.tier} ${e.at} ms`)
          console.log(`  ${c.name}: ${report.translated?.state?.total ?? "?"} paragraphs; first paragraph: ${firstRequest?.join(" → ")}; Bergamot worker: ${ready.bergamotWorker}`)
        }
      } catch (error) {
        failures = [String(error.message ?? error)]
      } finally {
        await stop(tb, profile)
      }
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      if (failures.length === 0) {
        console.log(`PASS ${c.name} (${seconds} s)`)
      } else {
        failed++
        console.log(`FAIL ${c.name} (${seconds} s)`)
        for (const f of failures) console.log(`  - ${f}`)
        console.log(`  requests seen by the mock server: ${JSON.stringify(server.calls)}`)
        console.log(`  extension log:\n${extensionLog.join("\n").replace(/^/gm, "    ")}`)
        console.log(`  last lines of ${logFile}:\n${tail(logFile).replace(/^/gm, "    ")}`)
      }
    }
  } finally {
    removeProfile(profile)
    await server.close()
  }
  console.log(failed === 0 ? `e2e: all ${CASES.length + 1} runs passed` : `e2e: ${failed} of ${CASES.length + 1} runs failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
