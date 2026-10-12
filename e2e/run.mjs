// End-to-end test in a real Thunderbird: npm run e2e
//
// 1. Start the mock server (e2e/mock-server.mjs) and build the test xpi against it
//    (scripts/build.mjs --e2e: the hooks of src/e2e/hooks/ take the place of
//    src/hooks/, preset the three tiers dictionary / Google / AI on the mock
//    server and follow the content script).
// 2. For each fixture message, start a headless Thunderbird on a temporary profile
//    with the xpi preinstalled and the message opened from the command line.
// 3. The content script translates, switches to translation-only, restores the
//    original, translates again from what it remembers and retranslates past every
//    cache, then reports what it saw; this script checks the report together with
//    the requests the mock server received.
// 4. The "auto" run opens the HTML message with automatic translation on and the
//    cache off: automatic translation translates every paragraph without the
//    probe starting anything. The "auto-skip" run opens a Chinese message with
//    Simplified Chinese as target language: nothing may be requested.
// 5. The "missing" run opens a message with the dictionary and Bergamot tiers and
//    nothing installed: the notice about missing offline data appears, is muted,
//    stays away when translating again, and stays away with Google instead.
// 6. Two Thunderbirds started without a message open the setup guide
//    (src/welcome/), where the probe of src/e2e/welcome.ts skips the tour of the
//    tiers step and watches its demo (first run only), then clicks through to the
//    offline step and downloads dictionary packs and Bergamot models from the
//    mock server (Remote Settings stand-in): with English as source language
//    the ticked direction, with automatic detection the recommended directions
//    through "Download common languages" and "Download selected". Then it
//    deletes them again and reports.
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

/**
 * The scenarios after the messages: automatic translation of a message and of a message already in the target
 * language, the notice about missing offline data, the offline downloads of the setup guide.
 */
const SCENARIOS = [
  { name: "auto", eml: "html.eml", scenario: "auto", paragraphs: 7 },
  // Simplified Chinese except for one English line, which a started translation would request.
  { name: "auto-skip", eml: "zh.eml", scenario: "auto-skip" },
  { name: "missing", eml: "html.eml", scenario: "missing", paragraphs: 7 },
  { name: "welcome", scenario: "welcome" },
  { name: "welcome-auto", scenario: "welcome-auto" },
]

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

  // Requests the mock server saw, split at the mode switch and at the retranslation.
  const switchAt = calls.findIndex((x) => x.type === "mark" && x.command === "toggle-display-mode")
  const retranslateAt = calls.findIndex((x) => x.type === "mark" && x.command === "retranslate")
  expect(switchAt !== -1, "the mode switch command never reached the background script")
  expect(retranslateAt > switchAt, "the retranslate command never reached the background script")
  const before = calls.slice(0, switchAt)
  const after = calls.slice(switchAt + 1, retranslateAt)
  const retranslated = calls.slice(retranslateAt + 1)
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

  // Translated again: every paragraph from what the page remembers, nothing requested.
  const cachedAt = calls.findLastIndex((x, i) => i < retranslateAt && x.type === "mark" && x.command === "toggle-translation")
  expect(cachedAt > switchAt && !calls.slice(cachedAt, retranslateAt).some((x) => x.type === "google" || x.type === "ai"), "translating again requested a service", calls.slice(cachedAt, retranslateAt))
  expect(report.events.every((e) => e.phase !== "cached"), "translating again asked the background", report.events.filter((e) => e.phase === "cached"))
  expect(report.cached?.state?.done === c.paragraphs && report.cached.shown?.every((s) => s.mode === "only" && s.text.startsWith("[AI translation-only] ")), "translating again does not show the remembered AI translations", report.cached)

  // Retranslation: every tier answers again for every paragraph, in tier order, with provisional results on the way.
  const third = report.events.filter((e) => e.phase === "retranslate")
  const thirdByRequest = Map.groupBy(third, (e) => e.id)
  expect(thirdByRequest.size === c.paragraphs, `retranslation: expected ${c.paragraphs} paragraph requests`, thirdByRequest.size)
  for (const [id, events] of thirdByRequest) {
    expect(JSON.stringify(events.map((e) => e.tier)) === JSON.stringify(TIER_ORDER) && events.every((e) => e.ok), `retranslation request ${id}: tiers arrived as ${events.map((e) => `${e.tier}:${e.ok}`).join(", ")}`)
  }
  expect(third.flatMap((e) => e.shown).some((s) => s.mark === "provisional"), "retranslation: no provisional translation was shown")
  expect(retranslated.some((x) => x.type === "google"), "retranslation: Google was not requested again", retranslated)
  expect(ai(retranslated).length > 0 && ai(retranslated).every((x) => x.mode === "translation-only"), "retranslation: AI requests must use the translation-only prompt of the current mode", ai(retranslated))
  const again = report.retranslated
  expect(again?.state?.done === c.paragraphs && again.state.failed === 0 && again.shown?.length === c.paragraphs, "retranslation: not every paragraph has the AI translation", again?.state)
  for (const s of again?.shown ?? []) {
    expect(s.mode === "only" && s.mark === null && /^\[AI translation-only #\d+\] /.test(s.text), "retranslation shows something other than the new AI translation", s)
  }
  return failures
}

/** Check the report of the "auto" run: automatic translation translated the message alone; returns the failures. */
function checkAuto(c, ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "auto", "setup of the auto scenario failed", ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const translated = report.translated
  expect(translated?.active === true, "the message is not translated", translated)
  expect(translated?.state?.total === c.paragraphs && translated.state.done === c.paragraphs && translated.state.failed === 0, `expected ${c.paragraphs} translated paragraphs`, translated?.state)
  expect(translated?.shown?.length === c.paragraphs, `expected ${c.paragraphs} translations on screen`, translated?.shown?.length)
  for (const s of translated?.shown ?? []) {
    expect(s.mode === "bilingual" && s.mark === null && s.text.startsWith("[AI bilingual] "), "final translation is not the AI translation", s)
  }
  // Every paragraph went through the three tiers in order: nothing came from the cache.
  const byRequest = Map.groupBy(report.events, (e) => e.id)
  expect(byRequest.size === c.paragraphs, `expected ${c.paragraphs} paragraph requests`, byRequest.size)
  for (const [id, events] of byRequest) {
    expect(JSON.stringify(events.map((e) => e.tier)) === JSON.stringify(TIER_ORDER) && events.every((e) => e.ok), `request ${id}: tiers arrived as ${events.map((e) => `${e.tier}:${e.ok}`).join(", ")}`)
  }
  expect(calls.some((x) => x.type === "google"), "Google was not requested")
  const ai = calls.filter((x) => x.type === "ai")
  expect(ai.length > 0 && ai.every((x) => x.mode === "bilingual"), "AI requests must use the bilingual prompt", ai)
  expect(!calls.some((x) => x.type === "mark"), "a keyboard command was run", calls.filter((x) => x.type === "mark"))
  return failures
}

/** Check the report of the "auto-skip" run: a message in the target language is left alone; returns the failures. */
function checkAutoSkip(ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "auto-skip", "setup of the auto-skip scenario failed", ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const skipped = report.skipped
  expect(skipped?.waitedMs >= 2000, "the probe did not wait for a translation that must not start", skipped)
  expect(skipped?.active === false && skipped.shown === 0 && (skipped.state === null || skipped.state.total === 0), "the message in the target language was translated", skipped)
  expect(report.events?.length === 0, "a paragraph was requested", report.events)
  const requested = calls.filter((x) => x.type === "google" || x.type === "ai")
  expect(requested.length === 0, "a service was requested", requested)
  return failures
}

/** Check the report of the "missing" run; returns the failures. */
function checkMissing(c, ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "missing", "setup of the missing scenario failed", ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const both = ["bergamot:en>zh-Hans", "dictionary:en>zh-Hans"]

  // Both offline tiers lack en -> zh-Hans: one notice above the message with a line for each; every paragraph is failed.
  const first = report.first
  expect(first?.state?.total === c.paragraphs && first.state.failed === c.paragraphs, `expected ${c.paragraphs} failed paragraphs`, first?.state)
  expect(first?.notice?.lines?.length === 2 && first.notice.first === true, "expected the notice above the message with two lines", first?.notice)
  expect(JSON.stringify(first?.entries) === JSON.stringify(both), "the notice lists the wrong entries", first?.entries)

  // "Don't remind me" stores both entries; the notice closes and stays away when translating again.
  expect(JSON.stringify(report.muted) === JSON.stringify(both), "the settings do not hold the muted entries", report.muted)
  expect(report.closed === true, "the close button left the notice on screen")
  expect(report.again?.notice === null && report.again.entries?.length === 0, "a notice or unmuted entries after translating again", report.again)

  // Google without the dictionary (mutes cleared): no offline tier, no notice, every paragraph translated by Google.
  const google = report.google
  expect(google?.notice === null && google.entries?.length === 0, "a notice or entries with Google and no dictionary", google)
  expect(google?.state?.done === c.paragraphs && google.state.failed === 0, "not every paragraph has the Google translation", google?.state)
  expect(google?.shown?.every((s) => s.text.startsWith("[G] ")), "a paragraph shows something other than the Google translation", google?.shown?.slice(0, 3))
  expect(calls.some((x) => x.type === "google"), "Google was not requested")
  return failures
}

/** Check the report of the setup guide; returns the failures. */
function checkWelcome(ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  const auto = report.scenario === "welcome-auto"
  expect(!ready.error && ready.scenario === report.scenario, "setup of the welcome scenario failed", ready)
  if (report.error) {
    failures.push(`setup guide: ${report.error}`)
    failures.push(`page at the time: ${JSON.stringify(report.screen)}`)
    return failures
  }
  if (!auto) {
    // Tiers step: the tour opens at the first selector with the focus on "Next", and Skip closes it. The demo ends with
    // the machine translation (dictionary and Bergamot in use) and, after DeepSeek is chosen for the AI tier, with the AI text.
    expect(report.tour?.target === "tier-dictionary" && report.tour.text && report.tour.focus === "tourNext", "the tour did not open at the first tier selector", report.tour)
    expect(report.tourAfterSkip?.open === false && report.tourAfterSkip.tipHidden === true, "Skip did not close the tour", report.tourAfterSkip)
    const demo = report.demo
    expect(demo?.first === demo?.texts.machine && demo.final === demo.texts.ai && demo.status?.includes("DeepSeek"), "the demo did not end with the highest tier, or did not play again after the choice", demo)
  }
  const row = (screen, kind, id) => screen?.[kind]?.rows.find((r) => r.id === id)
  const ids = auto ? ["en>zh-Hans", "zh-Hans>en"] : ["en>zh-Hans"]

  // The offline step lists both directions of the mock server in both lists. With English as source language
  // en -> zh-Hans is ticked and zh-Hans -> en is not; with automatic detection both are recommended, labelled and ticked.
  for (const kind of ["dictionary", "bergamot"]) {
    for (const id of ["en>zh-Hans", "zh-Hans>en"]) {
      const r = row(report.offered, kind, id)
      const ticked = ids.includes(id)
      expect(r && !r.installed && r.checkbox?.checked === ticked && r.checkbox.disabled === false, `${kind} ${id}: expected a row ${ticked ? "ticked" : "not ticked"}`, report.offered?.[kind])
      if (auto) expect(r?.labels > 0, `${kind} ${id}: a recommended direction without labels`, r)
    }
  }
  if (auto) expect(report.autoHint === true, "the hint about automatic detection is hidden")
  const empty = { bergamotInstalled: [], dictionaryInstalled: [], bergamotRecords: { pairs: 0, files: 0 }, dictionaryRecords: { packs: 0, data: 0 } }
  expect(JSON.stringify(report.initial) === JSON.stringify(empty), "something was installed before the download", report.initial)

  if (auto) {
    // "Download common languages": the confirmation lists the two packs; afterwards they are installed.
    expect(report.commonConfirm?.items === 2, "the confirmation of Download common languages does not list two packs", report.commonConfirm)
    expect(report.commonAfter?.allInstalled === true && report.commonAfter.disabled === true, "Download common languages does not say that all are installed", report.commonAfter)
    expect(report.untickedPicks === true && report.retickedPicks === true, "the check box of a model did not follow the clicks", { untickedPicks: report.untickedPicks, retickedPicks: report.retickedPicks })
  } else {
    // The page shows the progress the background script reports at most every 250 ms: some value between 0 and 100 %, never going back.
    for (const kind of ["dictionary", "bergamot"]) {
      const seen = report.progress?.[kind] ?? []
      expect(seen.some((p) => p > 0 && p < 100), `${kind}: no progress between 0 and 100 % on the page`, seen)
      expect(seen.every((p, i) => i === 0 || p >= seen[i - 1]), `${kind}: the progress on the page went back`, seen)
    }
  }
  // "Download selected" is disabled while it runs, says so, and reports the end.
  expect(report.disabledWhileDownloading === true && report.statusWhileDownloading, "Download selected stayed enabled or silent while downloading", report.statusWhileDownloading)
  expect(report.downloadStatus === "done", "Download selected did not report success", report.downloadStatus)
  for (const kind of ["dictionary", "bergamot"]) {
    for (const id of ids) {
      const r = row(report.finished, kind, id)
      expect(r?.installed === true && r.checkbox === null && r.error === null, `${kind} ${id}: the page does not show the download as finished`, report.finished?.[kind])
    }
  }

  // Stored for real: the answers of the background script and the object stores of the two databases.
  const done = { bergamotInstalled: ids, dictionaryInstalled: ids, bergamotRecords: { pairs: ids.length, files: 3 * ids.length }, dictionaryRecords: { packs: ids.length, data: ids.length } }
  expect(JSON.stringify(report.downloaded) === JSON.stringify(done), "stored data after the download", report.downloaded)
  expect(JSON.stringify(report.removed) === JSON.stringify(empty), "data left after the deletion", report.removed)

  // What the mock server saw: model list, three model files per direction, the packs.
  const seen = calls.filter((x) => x.type === "bergamot").map((x) => x.what)
  expect(seen.includes("server root") && seen.includes("records") && seen.filter((w) => w.endsWith(".zst")).length === 3 * ids.length, "Remote Settings requests of the mock server", seen)
  for (const id of ["en>zh-Hans", "zh-Hans>en"]) {
    const file = `dict-${id.replace(">", "-")}.tsv.gz`
    expect(calls.some((x) => x.type === "download" && x.file === file) === ids.includes(id), `the dictionary pack ${file} was ${ids.includes(id) ? "not " : ""}downloaded`)
  }
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

  // E2E_ONLY=name,name runs some of the runs only.
  const runs = [...CASES, ...SCENARIOS].filter((c) => !process.env.E2E_ONLY || process.env.E2E_ONLY.split(",").includes(c.name))
  let failed = 0
  try {
    for (const c of runs) {
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
        const systemLanguages = `getPreferredSystemLanguages: ${ready.systemLanguagesApi ? "present" : "missing"}`
        if (c.scenario?.startsWith("welcome")) {
          failures = checkWelcome(ready, report, server.calls)
          if (failures.length) failures.push(`report of the page:
${JSON.stringify(report, null, 2)}`)
          const { dictionary, bergamot } = report.progress ?? {}
          const progress = dictionary ? `progress of the pack ${dictionary.join(", ")} %, of the model ${bergamot?.join(", ")} %; ` : ""
          const demo = report.demo ? `demo replayed with the AI tier in ${report.demo.replayMs} ms; ` : ""
          console.log(`  ${c.name}: ${demo}${progress}stored ${JSON.stringify(report.downloaded?.bergamotRecords)}, then deleted; ${systemLanguages} ${JSON.stringify(report.systemLanguages)}`)
        } else if (c.scenario === "auto") {
          failures = checkAuto(c, ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          console.log(`  ${c.name}: ${report.translated?.state?.done ?? "?"} of ${report.translated?.state?.total ?? "?"} paragraphs translated automatically; ${server.calls.filter((x) => x.type === "google").length} Google and ${server.calls.filter((x) => x.type === "ai").length} AI requests; ${systemLanguages}`)
        } else if (c.scenario === "auto-skip") {
          failures = checkAutoSkip(ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          console.log(`  ${c.name}: after ${report.skipped?.waitedMs ?? "?"} ms ${report.events?.length ?? "?"} tier results, ${server.calls.filter((x) => x.type === "google" || x.type === "ai").length} requests; ${systemLanguages}`)
        } else if (c.scenario === "missing") {
          failures = checkMissing(c, ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          console.log(`  ${c.name}: notice ${JSON.stringify(report.first?.notice?.lines)}; muted ${JSON.stringify(report.muted)}; ${systemLanguages}`)
        } else {
          failures = check(c, ready, report, server.calls)
          if (failures.length) failures.push(`message body as displayed:\n${report.originalHtml}`)
          const firstRequest = report.events?.filter((e) => e.phase === "translate" && e.id === report.events[0].id).map((e) => `${e.tier} ${e.at} ms`)
          const retranslated = report.retranslated?.shown?.[0]?.text?.slice(0, 40)
          console.log(`  ${c.name}: ${report.translated?.state?.total ?? "?"} paragraphs; first paragraph: ${firstRequest?.join(" → ")}; retranslated: ${retranslated}; Bergamot worker: ${ready.bergamotWorker}; ${systemLanguages}`)
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
  console.log(failed === 0 ? `e2e: all ${runs.length} runs passed` : `e2e: ${failed} of ${runs.length} runs failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
