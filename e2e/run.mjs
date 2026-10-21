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
// 6. The "consent" run opens the HTML message with no online service allowed:
//    the consent panel appears, nothing reaches the mock server before
//    "Allow and translate", and the message is translated after it.
// 7. The "machine-deepl", "machine-baidu", "machine-youdao" and "machine-caiyun"
//    runs open the HTML message with the machine translator of the name as the
//    only tier: every paragraph and the subject get its translation, with the
//    key, the signature and the language codes the mock server expects.
//    The "summary" run asks for the summary of the HTML message: the consent
//    panel comes first and nothing reaches the AI service before "Allow"; the
//    panel then shows the four parts, the cache answers the second request and
//    "Regenerate" asks the service again.
//    The "image-ask", "image-auto", "image-off" and "image-switch" runs open image.eml (a chart and a receipt that
//    pass the filters, a tracking pixel, an animated GIF and a logo in the signature) with precise translation and
//    image translation in the mode of the run: only the chart and the receipt get a button; in "image-ask" nothing
//    reaches the AI service before "Allow and translate image", the result is a table with the column names of the
//    interface, the message comes back as it was, and translated again the cache answers; in "image-auto" the chart
//    goes by itself and the receipt keeps its button (one image per message); in "image-off" nothing appears and
//    nothing is sent; in "image-switch" the mode changes three times while the message stays translated.
// 8. The "subjects" run starts on a profile with the local folders "Foreign"
//    and "Second": the page of translated subjects lists the folder shown in
//    the mail tab, asks before the subjects go to Google and the AI service,
//    translates them, selects a clicked message in the mail tab and follows
//    the mail tab to the other folder.
// 9. Two Thunderbirds started without a message open the setup guide
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
import { createProfile, findThunderbird, launch, mbox, removeProfile, stop, thunderbirdVersion } from "./thunderbird.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const fixtures = join(root, "e2e", "fixtures")
const work = join(root, ".cache", "e2e")
const STEP_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS) || 180_000

/** The subjects of the fixture messages, which the line above the body translates. */
const SUBJECTS = { "html.eml": "Quarterly report and the client meeting", "plain.eml": "The meeting has been moved" }

/** The local folders of the "subjects" run: foreign subjects, one in the target language (Simplified Chinese), one with a forward prefix. */
const FOLDERS = {
  Foreign: [
    { from: "Anna Schmidt <anna@example.de>", subject: "Angebot für die neue Druckmaschine", date: "2026-10-01T08:00:00Z", body: "Guten Tag, anbei unser Angebot." },
    { from: "Claire Martin <claire@example.fr>", subject: "Réunion de lundi reportée à mardi", date: "2026-10-02T08:00:00Z", body: "Bonjour, la réunion est reportée." },
    { from: "Diego López <diego@example.es>", subject: "Factura del mes de septiembre", date: "2026-10-03T08:00:00Z", body: "Hola, adjunto la factura." },
    { from: "Li Wei <li.wei@example.com>", subject: "下周的会议安排", date: "2026-10-04T08:00:00Z", body: "你好，这是下周的安排。" },
    { from: "Alice Walker <alice@example.com>", subject: "Fwd: Quarterly report and the client meeting", date: "2026-10-05T08:00:00Z", body: "Please see below." },
    { from: "Sato Hanako <hanako@example.jp>", subject: "来週の打ち合わせについて", date: "2026-10-06T08:00:00Z", body: "お疲れさまです。" },
  ],
  Second: [
    { from: "Anna Schmidt <anna@example.de>", subject: "Neue Preise ab Januar", date: "2026-10-07T08:00:00Z", body: "Guten Tag." },
    { from: "Claire Martin <claire@example.fr>", subject: "Invitation au séminaire de novembre", date: "2026-10-08T08:00:00Z", body: "Bonjour." },
  ],
}

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
  // No online service allowed yet: the consent panel, no request before "Allow and translate", the translation after it.
  { name: "consent", eml: "html.eml", scenario: "consent", paragraphs: 7 },
  // The machine translators with a key of their own, each as the only tier.
  ...["deepl", "baidu", "youdao", "caiyun"].map((service) => ({ name: `machine-${service}`, eml: "html.eml", scenario: `machine-${service}`, paragraphs: 7, service })),
  // The summary and to-dos: consent, the panel, the cache and "Regenerate".
  { name: "summary", eml: "html.eml", scenario: "summary" },
  // The text in images: a button and the consent, one image by itself, nothing, and a change of the mode.
  ...["ask", "auto", "off", "switch"].map((mode) => ({ name: `image-${mode}`, eml: "image.eml", scenario: `image-${mode}` })),
  // The page of translated subjects on a profile with local folders.
  { name: "subjects", scenario: "subjects", profile: "folders" },
  // The experimental build on the same kind of profile: the column "Translated subject" of its experiment API.
  { name: "column", scenario: "column", profile: "folders", variant: "experimental" },
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
  // The paragraphs and the line with the subject.
  const units = c.paragraphs + 1
  const subject = SUBJECTS[c.eml]

  // Paragraphs and the final AI translations in bilingual mode.
  const translated = report.translated
  expect(translated?.state?.total === units, `expected ${c.paragraphs} paragraphs and the subject`, translated?.state)
  expect(translated?.state?.done === units && translated.state.failed === 0, "not every paragraph has the AI translation", translated?.state)
  expect(translated?.shown?.length === c.paragraphs, `expected ${c.paragraphs} translations on screen`, translated?.shown?.length)
  for (const s of translated?.shown ?? []) {
    const ok = s.mode === "bilingual" && s.mark === null && s.text.startsWith("[AI bilingual] ") && original.includes(words(s.text.slice(15)).slice(0, 40))
    expect(ok, "final bilingual translation is not the AI translation of a paragraph", s)
  }
  // The subject in a line above the body, with its AI translation under it, as plain text without the marks of its Markdown.
  const line = translated?.subject
  expect(line?.first === true && line.mode === "bilingual" && line.mark === null && line.translation === `[AI bilingual] ${subject}` && line.text.startsWith(subject), "the subject line above the body does not show the subject and its AI translation", line)
  expect(line?.tags?.length === 0, "the subject line shows elements of the Markdown of its translation", line)

  // The Markdown of the AI translations: the label in bold, the link where the paragraph has "report", a line break where a
  // paragraph of the plain-text message keeps one (the quote), no other element.
  const rendered = translated?.shown ?? []
  expect(rendered.length > 0 && rendered.every((s) => s.tags[0] === "strong" && s.tags.every((tag) => ["strong", "a", "br"].includes(tag))), "an AI translation does not show its Markdown as bold text, links and line breaks", rendered.map((s) => s.tags))
  const links = rendered.flatMap((s) => s.links)
  expect(links.length > 0 && links.every((l) => l.href === "https://example.com/report" && l.rel === "noopener noreferrer"), "no AI translation shows the link of its Markdown", links)
  // The style of the translations reaches the rendered elements.
  const style = translated?.style
  expect(style && style.strong.color === style.block.color && style.strong.fontSize === style.block.fontSize && Number(style.strong.fontWeight) >= 600, "the bold text of an AI translation does not take the colour and size of its translation", style)

  // Tier order per paragraph request: dictionary, then Google, then AI.
  const first = report.events.filter((e) => e.phase === "translate")
  const byRequest = Map.groupBy(first, (e) => e.id)
  expect(byRequest.size === units, `expected ${units} requests, one per paragraph and the subject`, byRequest.size)
  for (const [id, events] of byRequest) {
    const order = events.map((e) => e.tier)
    expect(JSON.stringify(order) === JSON.stringify(TIER_ORDER), `request ${id}: tiers arrived as ${order.join(", ")}`)
    expect(events.every((e) => e.ok), `request ${id}: a tier failed`, events.filter((e) => !e.ok))
  }

  // Provisional translations of the lower tiers were on screen before the AI result.
  const provisional = first.flatMap((e) => e.shown).filter((s) => s.mark === "provisional")
  expect(provisional.some((s) => CJK.test(s.text) && !s.text.startsWith("[")), "no provisional dictionary translation was shown", provisional.slice(0, 3))
  expect(provisional.some((s) => s.text.startsWith("[G] ")), "no provisional Google translation was shown", provisional.slice(0, 3))
  // Machine translation keeps the asterisks of its answer as text.
  const google = provisional.filter((s) => s.text.startsWith("[G] "))
  expect(google.every((s) => s.tags.length === 0 && /^\[G\] \*[\s\S]*\*$/.test(s.text)), "a provisional Google translation does not show its asterisks as text", google.slice(0, 3))

  // Translation-only: only the AI tier is requested again, with the translation-only prompt.
  const second = report.events.filter((e) => e.phase === "mode")
  expect(second.length === units && second.every((e) => e.tier === "ai" && e.ok), "after the mode switch only the AI tier must answer, once per paragraph and for the subject", second.map((e) => `${e.tier}:${e.ok}`))
  const only = report.translationOnly
  expect(only?.shown?.length === c.paragraphs, "translation-only: wrong number of translations", only?.shown?.length)
  for (const s of only?.shown ?? []) {
    expect(s.mode === "only" && s.mark === null && s.text.startsWith("[AI translation-only] ") && s.tags[0] === "strong", "translation-only shows something other than the rendered AI translation", s)
  }
  const onlyLine = only?.subject
  expect(onlyLine?.mode === "only" && onlyLine.translation === `[AI translation-only] ${subject}` && onlyLine.text === onlyLine.translation, "translation-only: the subject line shows something other than the translation alone", onlyLine)

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
  expect(report.cached?.state?.done === units && report.cached.shown?.every((s) => s.mode === "only" && s.text.startsWith("[AI translation-only] ")), "translating again does not show the remembered AI translations", report.cached)
  expect(report.cached?.subject?.translation === `[AI translation-only] ${subject}`, "translating again does not show the remembered translation of the subject", report.cached?.subject)

  // Retranslation: every tier answers again for every paragraph, in tier order, with provisional results on the way.
  const third = report.events.filter((e) => e.phase === "retranslate")
  const thirdByRequest = Map.groupBy(third, (e) => e.id)
  expect(thirdByRequest.size === units, `retranslation: expected ${units} requests`, thirdByRequest.size)
  for (const [id, events] of thirdByRequest) {
    expect(JSON.stringify(events.map((e) => e.tier)) === JSON.stringify(TIER_ORDER) && events.every((e) => e.ok), `retranslation request ${id}: tiers arrived as ${events.map((e) => `${e.tier}:${e.ok}`).join(", ")}`)
  }
  expect(third.flatMap((e) => e.shown).some((s) => s.mark === "provisional"), "retranslation: no provisional translation was shown")
  expect(retranslated.some((x) => x.type === "google"), "retranslation: Google was not requested again", retranslated)
  expect(ai(retranslated).length > 0 && ai(retranslated).every((x) => x.mode === "translation-only"), "retranslation: AI requests must use the translation-only prompt of the current mode", ai(retranslated))
  const again = report.retranslated
  expect(again?.state?.done === units && again.state.failed === 0 && again.shown?.length === c.paragraphs, "retranslation: not every paragraph has the AI translation", again?.state)
  for (const s of again?.shown ?? []) {
    expect(s.mode === "only" && s.mark === null && /^\[AI translation-only #\d+\] /.test(s.text) && s.tags[0] === "strong", "retranslation shows something other than the new AI translation", s)
  }
  expect(/^\[AI translation-only #\d+\] /.test(again?.subject?.translation ?? ""), "retranslation: the subject line shows something other than the new AI translation", again?.subject)
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
  const units = c.paragraphs + 1
  expect(translated?.state?.total === units && translated.state.done === units && translated.state.failed === 0, `expected ${c.paragraphs} translated paragraphs and the subject`, translated?.state)
  expect(translated?.subject?.translation === `[AI bilingual] ${SUBJECTS[c.eml]}`, "automatic translation did not translate the subject", translated?.subject)
  expect(translated?.shown?.length === c.paragraphs, `expected ${c.paragraphs} translations on screen`, translated?.shown?.length)
  for (const s of translated?.shown ?? []) {
    expect(s.mode === "bilingual" && s.mark === null && s.text.startsWith("[AI bilingual] "), "final translation is not the AI translation", s)
  }
  // Every paragraph went through the three tiers in order: nothing came from the cache.
  const byRequest = Map.groupBy(report.events, (e) => e.id)
  expect(byRequest.size === units, `expected ${units} requests`, byRequest.size)
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

/** Check the report of the "consent" run: nothing is sent before the user allows it; returns the failures. */
function checkConsent(c, ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "consent", "setup of the consent scenario failed", ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const panel = report.panel
  expect(panel?.first === true, "the consent panel is not above the message", panel)
  expect(panel?.services?.length === 2 && panel.services[0].startsWith("Google") && panel.services[1].includes("127.0.0.1"), "the panel does not name Google and the AI service with its host", panel?.services)
  expect(panel?.buttons?.length === 2, "the panel needs two buttons", panel?.buttons)
  expect(report.beforeAllow?.tierResults === 0 && report.beforeAllow.active === false && report.beforeAllow.shown === 0, "something was translated before the consent", report.beforeAllow)
  const online = calls.filter((x) => x.type === "google" || x.type === "ai")
  const early = online.filter((x) => x.at < report.allowedAt)
  expect(early.length === 0, "a service was requested before the consent", early)
  expect(online.some((x) => x.type === "google") && online.some((x) => x.type === "ai"), "Google and the AI service were not both requested after the consent", online)
  const translated = report.translated
  expect(translated?.active === true && translated.state?.done === c.paragraphs + 1 && translated.state.failed === 0, `expected ${c.paragraphs} translated paragraphs and the subject after the consent`, translated?.state)
  expect(translated?.panelLeft === false, "the consent panel stayed on screen")
  for (const s of translated?.shown ?? []) expect(s.mark === null && s.text.startsWith("[AI bilingual] "), "final translation is not the AI translation", s)
  return failures
}

/** The language codes each machine translator gets for automatic detection into Simplified Chinese. */
const MACHINE_CODES = { deepl: { to: "ZH-HANS", from: "" }, baidu: { to: "zh", from: "auto" }, youdao: { to: "zh-CHS", from: "auto" }, caiyun: { to: "auto2zh", from: "auto" } }

/** Check the report of a "machine-…" run: one machine translator with a key of its own translated the message; returns the failures. */
function checkMachine(c, ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === c.scenario, `setup of the ${c.scenario} scenario failed`, ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const units = c.paragraphs + 1
  const translated = report.translated
  expect(translated?.state?.total === units && translated.state.done === units && translated.state.failed === 0, `expected ${c.paragraphs} paragraphs and the subject translated by ${c.service}`, translated?.state)
  expect(translated?.shown?.length === c.paragraphs && translated.shown.every((s) => s.mark === null && s.tags.length === 0 && s.text.startsWith(`[${c.service}] `)), `a paragraph does not show the translation of ${c.service} as text`, translated?.shown)
  expect(translated?.subject?.translation === `[${c.service}] ${SUBJECTS[c.eml]}`, `the subject line does not show the translation of ${c.service}`, translated?.subject)
  const requests = calls.filter((x) => x.type === "mt" && x.service === c.service)
  expect(requests.length > 0 && requests.every((x) => x.auth), `${c.service}: no request, or one with a wrong key or signature`, requests)
  expect(requests.every((x) => x.to === MACHINE_CODES[c.service].to && x.from === MACHINE_CODES[c.service].from), `${c.service}: wrong language codes`, requests)
  // Batches: fewer requests than units, except for Baidu's standard edition, which sends at most 950 characters per request.
  if (c.service !== "baidu") expect(requests.length < units, `${c.service}: the paragraphs were not batched`, requests.length)
  expect(!calls.some((x) => x.type === "google" || x.type === "ai"), "another service was requested", calls.filter((x) => x.type === "google" || x.type === "ai"))
  return failures
}

/** Check the report of the "summary" run: consent first, the four parts, the cache, "Regenerate"; returns the failures. */
function checkSummary(ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "summary", "setup of the summary scenario failed", ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const summaries = calls.filter((x) => x.type === "ai" && x.mode === "summary")
  expect(report.beforeAllow?.panel === null && report.beforeAllow.services?.length === 1 && report.beforeAllow.services[0].includes("127.0.0.1"), "the consent panel does not name the AI service alone, or the summary came before it", report.beforeAllow)
  expect(!summaries.some((x) => x.at < report.allowedAt), "the AI service got the message before the consent", summaries)
  const first = report.first
  expect(first?.afterSubject === true && first.open === true && first.copyDisabled === false && first.markup === 0, "the panel is not open at the top of the message with its copy button", first)
  expect(first?.title?.startsWith("Summary and to-dos · ") === true, "the panel does not name the service", first?.title)
  const parts = (first?.parts ?? []).map((p) => [p.heading, p.lines.map((l) => l.text)])
  const expected = [
    ["Summary", ["Anna asks to move the client meeting."]],
    ["To-dos", ["Me: Confirm the new date (due 2026-10-23 · by Thursday)"]],
    ["Questions to answer", ["Anna: Does Thursday work for you?"]],
    ["Dates and meetings", ["Client meeting · 2026-10-23 15:00 · Room 4"]],
  ]
  expect(JSON.stringify(parts) === JSON.stringify(expected), "the panel does not show the four parts of the summary", parts)
  expect(first?.parts?.[1]?.lines?.[0]?.title === "Could we move the meeting?", "the to-do does not show its quote as hover text", first?.parts?.[1])
  // The message with its header went out once before "Regenerate"; the cache answered the second request.
  expect(summaries.filter((x) => x.at < report.cachedAt).length === 1, "the second request of the same summary was not answered by the cache", summaries)
  expect(summaries.length === 2, "Regenerate did not ask the AI service again", summaries)
  expect(summaries.every((x) => x.maxTokens === 800 && x.model === "e2e-model" && x.user?.startsWith("<email from=")), "a summary request carries the wrong limit, model or message", summaries)
  expect(JSON.stringify((report.regenerated?.parts ?? []).map((p) => p.heading)) === JSON.stringify(expected.map(([h]) => h)), "the regenerated summary does not show the four parts", report.regenerated)
  expect(!calls.some((x) => x.type === "google" || (x.type === "ai" && x.mode !== "summary")), "the summary translated the message", calls.filter((x) => x.type !== "mark"))
  return failures
}

/** The parts of image.eml that get a button: the chart (cid:) and the receipt (attachment); what each part is otherwise. */
const IMAGE_PARTS = { chart: "1.2", pixel: "1.3", gif: "1.4", logo: "1.5", receipt: "2" }

/** Check the report of an image run; returns the failures. */
function checkImage(c, ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === c.scenario, `setup of the ${c.scenario} scenario failed`, ready)
  if (report.error) return [...failures, `content script: ${report.error}`]
  const images = calls.filter((x) => x.type === "ai" && x.image)
  const parts = (slots) => (slots ?? []).filter((slot) => slot.button || slot.result || slot.consent).map((slot) => slot.part).sort()
  const both = [IMAGE_PARTS.chart, IMAGE_PARTS.receipt].sort()
  expect(images.every((x) => x.mode === "image" && x.image.jpeg && x.image.withinLimit && x.model === "e2e-model" && x.maxTokens === 1024 && /^Image \d of the email\. Target language: Simplified Chinese\./.test(x.image.text)), "an image request is no JPEG within the limit, or carries the wrong model, limit or text", images)
  const result = (slot) => slot?.result && slot.result.header.join("|") === "Original|Translation" && slot.result.cells.join("|") === "Umsatz|[AI image] Revenue|Kosten|[AI image] Costs" && slot.result.open
  if (c.scenario === "image-off") {
    expect((report.off?.slots ?? []).length === 0, "something appeared under an image while image translation is off", report.off)
    expect(images.length === 0, "an image was sent while image translation is off", images)
    return failures
  }
  if (c.scenario === "image-auto") {
    const chart = report.auto?.find((slot) => slot.part === IMAGE_PARTS.chart)
    const receipt = report.auto?.find((slot) => slot.part === IMAGE_PARTS.receipt)
    expect(result(chart) && chart.result.title.startsWith("Image text · ") && !chart.result.title.includes("cached"), "the chart has no result of its own request", chart)
    expect(receipt?.button === "Translate image text" && !receipt.result, "the receipt beyond the limit does not keep its button", receipt)
    expect(images.length === 1 && images[0].image.text.startsWith("Image 1 "), "mode auto did not send the chart alone", images)
    expect(parts(report.auto).join() === both.join(), "an image other than the chart and the receipt shows something", report.auto)
    return failures
  }
  expect(parts(report.ask).join() === both.join() && report.ask.every((slot) => !slot.button || slot.button === "Translate image text"), "the buttons are not under the chart and the receipt only", report.ask)
  if (c.scenario === "image-switch") {
    expect(report.auto?.filter(result).length === 2, "mode auto did not show both results", report.auto)
    expect(images.length === 2 && images.every((x) => x.at > report.switchAt), "mode auto did not send each image once", images)
    expect(report.back?.filter(result).length === 2 && report.back.every((slot) => !slot.button), "back in mode ask the results are not shown at once", report.back)
    expect(!images.some((x) => x.at > report.offAt), "back in mode ask an image was sent again", images)
    expect(report.tierResults === 0, "a change of the image mode translated the paragraphs again", report.tierResults)
    return failures
  }
  // "image-ask"
  expect(!images.some((x) => x.at < report.allowedAt), "the AI service got an image before the consent", images)
  expect(report.panel?.title === "Send this image to Custom OpenAI-compatible?" && report.panel.lines.some((line) => line.includes("127.0.0.1")) && report.panel.lines.some((line) => /1,?568 pixels/.test(line) && line.includes("JPEG")), "the consent panel does not say what is sent where", report.panel)
  expect(report.panel?.slots.find((slot) => slot.consent)?.part === IMAGE_PARTS.chart, "the consent panel is not under the clicked image", report.panel?.slots)
  expect(result(report.first?.find((slot) => slot.part === IMAGE_PARTS.chart)), "the chart does not show the table with the column names of the interface", report.first)
  expect(report.second?.filter(result).length === 2, "the receipt does not show its result after a click without a second question", report.second)
  expect(images.length === 2 && images.filter((x) => x.at < report.cachedAt).length === 2, "the two clicks did not send one request each", images)
  expect(report.restored?.identical === true && report.restored.leftovers === 0, "the message did not come back as it was", report.restored)
  expect(report.cached?.filter((slot) => result(slot) && slot.result.title.endsWith("cached")).length === 2 && report.cached.every((slot) => !slot.button), "translated again, the results do not come from the cache at once", report.cached)
  return failures
}

/** Check the report of the "subjects" run: the page of translated subjects on the local folders; returns the failures. */
function checkSubjects(ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "subjects" && Number.isInteger(ready.tabId), "setup of the subjects scenario failed", ready)
  if (report.error) return [...failures, `page of translated subjects: ${report.error}`]
  // Nothing goes out before "Allow and translate"; the panel speaks of subjects and names both services.
  const panel = report.panel
  expect(panel?.titleOfSubjects === true && panel.services?.length === 2 && panel.services[0].startsWith("Google") && panel.services[1].includes("127.0.0.1"), "the consent panel of the page does not name the subjects, Google and the AI service", panel)
  expect(report.beforeAllow?.translations === 0, "a subject was translated before the consent", report.beforeAllow)
  const online = calls.filter((x) => x.type === "google" || x.type === "ai")
  expect(!online.some((x) => x.at < report.allowedAt), "a service was requested before the consent", online.filter((x) => x.at < report.allowedAt))
  // Every subject of "Foreign": the AI translation, without the prefix; the Chinese one left alone.
  const rows = report.first?.rows ?? []
  const subjects = FOLDERS.Foreign.map((m) => m.subject)
  expect(rows.length === subjects.length && subjects.every((s) => rows.some((r) => r.subject === s)), "the page does not list the subjects of the folder Foreign", rows.map((r) => r.subject))
  for (const row of rows) {
    const text = row.subject.replace(/^Fwd: /, "")
    if (row.subject === "下周的会议安排") expect(row.translation === null, "a subject in the target language was translated", row)
    else expect(row.translation === `[AI bilingual] ${text}` && row.mark === null && row.elements === 0, "a subject does not show its AI translation as plain text", row)
  }
  // Few requests: the subjects are batched.
  const ai = online.filter((x) => x.type === "ai")
  expect(ai.length > 0 && ai.length < rows.length - 1, "the subjects were not batched into fewer AI requests than subjects", ai)
  expect(report.selected?.selected?.length === 1 && report.selected.selected[0] === report.selected.clicked && report.selected.marked === true, "a click did not select the message of the row in the mail tab", report.selected)
  const second = report.second?.rows ?? []
  expect(JSON.stringify(second.map((r) => r.subject).sort()) === JSON.stringify(FOLDERS.Second.map((m) => m.subject).sort()), "the page did not follow the mail tab to the folder Second", second)
  for (const row of second) expect(row.translation === `[AI bilingual] ${row.subject}`, "a subject of the folder Second does not show its AI translation", row)
  return failures
}

/** Check the report of the "column" run: the column of the experimental build fills with the translations; returns the failures. */
function checkColumn(ready, report, calls) {
  const failures = []
  const expect = (ok, message, detail) => {
    if (!ok) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`)
  }
  expect(!ready.error && ready.scenario === "column" && ready.id === "thunderbird-translate-experimental@willlllliams.github.io", "setup of the column scenario failed, or the build is not the experimental one", ready)
  if (report.error) return [...failures, `column: ${report.error}`]
  const { first, final } = report
  expect(first?.registered === true && first.visible === true && first.tableView === true, "the column is not registered and visible in the table view", first)
  expect(first?.rows?.length === 6, "the message list of the folder Foreign does not hold six messages", first?.rows)
  expect(final?.registered === true && final.visible === true, "the column went away", final)
  for (const row of final?.rows ?? []) {
    if (row.subject === "下周的会议安排") expect(row.text === "" && row.cell === "", "the column translated a subject in the target language", row)
    else {
      // The prefix stays in front of the translation.
      const prefix = row.subject.startsWith("Fwd: ") ? "Fwd: " : ""
      expect(row.text === `${prefix}[AI bilingual] ${row.subject.slice(prefix.length)}` && row.cell === row.text, "a row of the column does not show the AI translation of its subject", row)
    }
  }
  // Before the translations arrived the column was empty; the rows on screen were filled again afterwards.
  expect(first?.rows?.every((row) => row.cell === null || row.cell === "" || row.cell === row.text), "the column showed text before any translation", first?.rows)
  expect(calls.some((x) => x.type === "ai"), "the AI service was not requested")
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
  const units = c.paragraphs + 1
  expect(first?.state?.total === units && first.state.failed === units, `expected ${c.paragraphs} failed paragraphs and a failed subject`, first?.state)
  expect(first?.notice?.lines?.length === 2 && first.notice.first === true, "expected the notice above the message with two lines", first?.notice)
  expect(JSON.stringify(first?.entries) === JSON.stringify(both), "the notice lists the wrong entries", first?.entries)

  // "Don't remind me" stores both entries; the notice closes and stays away when translating again.
  expect(JSON.stringify(report.muted) === JSON.stringify(both), "the settings do not hold the muted entries", report.muted)
  expect(report.closed === true, "the close button left the notice on screen")
  expect(report.again?.notice === null && report.again.entries?.length === 0, "a notice or unmuted entries after translating again", report.again)

  // Google without the dictionary (mutes cleared): no offline tier, no notice, every paragraph translated by Google.
  const google = report.google
  expect(google?.notice === null && google.entries?.length === 0, "a notice or entries with Google and no dictionary", google)
  expect(google?.state?.done === units && google.state.failed === 0, "not every paragraph has the Google translation", google?.state)
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
  // Screenshots of the subject line, the page of translated subjects and the column, taken by the test build.
  const screenshots = join(work, "screenshots")
  const server = await startMockServer({ fixtures, screenshots, log: (m) => extensionLog.push(m) })
  console.log(`mock server: ${server.url}`)

  /** The test build of a variant ("regular" or "experimental"), built on first use: its xpi and add-on id. */
  const builds = {}
  const buildOf = (variant) => {
    if (builds[variant]) return builds[variant]
    const experimental = variant === "experimental"
    execFileSync(process.execPath, [join(root, "scripts", "build.mjs"), "--e2e", server.url, ...(experimental ? ["--experimental"] : [])], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
    const dir = join(root, ".cache", experimental ? "e2e-experimental" : "e2e")
    const manifest = JSON.parse(readFileSync(join(dir, "dist", "manifest.json"), "utf8"))
    const xpi = readFileSync(join(dir, `${experimental ? "multi-translate-experimental" : "thunderbird-translate"}-${manifest.version}-e2e.xpi`))
    return (builds[variant] = { xpi, id: manifest.browser_specific_settings.gecko.id })
  }
  // The runs of a variant share a profile; the runs with local folders have one of their own.
  const profiles = {}
  const folders = Object.fromEntries(Object.entries(FOLDERS).map(([folder, messages]) => [folder, mbox(messages)]))
  const profileFor = (variant, kind) => {
    const { xpi, id } = buildOf(variant)
    return (profiles[`${variant}:${kind}`] ??= createProfile(xpi, id, kind === "folders" ? { folders } : {}))
  }
  console.log(`profile: ${profileFor("regular", "plain")}`)

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
      const profile = profileFor(c.variant ?? "regular", c.profile ?? "plain")
      const tb = launch(bin, profile, c.eml && join(fixtures, c.eml), logFile)
      let failures
      try {
        // A Thunderbird that fails to start (missing libraries, crash) ends the wait early.
        const crashed = tb.exited.then((code) => (code ? Promise.reject(new Error(`Thunderbird exited with code ${code}`)) : new Promise(() => {})))
        const ready = await Promise.race([server.next("/ready", STEP_TIMEOUT_MS), crashed])
        // A failed set-up sends no report: say why at once.
        if (ready.error) throw new Error(`setup of the run failed: ${ready.error}`)
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
        } else if (c.scenario === "consent") {
          failures = checkConsent(c, ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          const online = server.calls.filter((x) => x.type === "google" || x.type === "ai")
          console.log(`  ${c.name}: panel ${JSON.stringify(report.panel?.services)}; ${online.filter((x) => x.at < report.allowedAt).length} requests before "Allow and translate", ${online.length} after; ${report.translated?.state?.done ?? "?"} paragraphs translated; ${systemLanguages}`)
        } else if (c.scenario?.startsWith("machine-")) {
          failures = checkMachine(c, ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          const requests = server.calls.filter((x) => x.type === "mt")
          console.log(`  ${c.name}: ${report.translated?.state?.done ?? "?"} of ${report.translated?.state?.total ?? "?"} units; ${requests.length} requests to ${c.service}, signed ${requests.every((x) => x.auth)}`)
        } else if (c.scenario === "summary") {
          failures = checkSummary(ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          console.log(`  ${c.name}: ${report.first?.parts?.length ?? "?"} parts; ${server.calls.filter((x) => x.type === "ai" && x.mode === "summary").length} summary requests for 3 summaries`)
        } else if (c.scenario?.startsWith("image-")) {
          failures = checkImage(c, ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          const sent = server.calls.filter((x) => x.type === "ai" && x.image)
          console.log(`  ${c.name}: images ${JSON.stringify(report.images?.map((i) => `${i.src?.match(/part=([\d.]+)/)?.[1] ?? i.src?.slice(0, 20)} ${i.width}×${i.height}`))}; ${sent.length} image requests, ${sent.map((x) => `${x.image.bytes} B`).join(", ")}`)
        } else if (c.scenario === "column") {
          failures = checkColumn(ready, report, server.calls)
          if (failures.length) failures.push(`report of the background script:\n${JSON.stringify(report, null, 2)}`)
          const shown = report.final?.rows?.filter((r) => r.cell) ?? []
          console.log(`  ${c.name}: ${ready.name}; column registered ${report.final?.registered}, visible ${report.final?.visible}; before: ${JSON.stringify(report.first?.rows?.map((r) => r.text))}; after ${report.waitedMs} ms: ${JSON.stringify(shown.map((r) => r.cell))}`)
        } else if (c.scenario === "subjects") {
          failures = checkSubjects(ready, report, server.calls)
          if (failures.length) failures.push(`report of the page:\n${JSON.stringify(report, null, 2)}`)
          const online = server.calls.filter((x) => x.type === "google" || x.type === "ai")
          console.log(`  ${c.name}: ${report.first?.rows?.length ?? "?"} subjects of Foreign, then ${report.second?.rows?.length ?? "?"} of Second; ${online.filter((x) => x.type === "google").length} Google and ${online.filter((x) => x.type === "ai").length} AI requests; selected ${JSON.stringify(report.selected?.selected)}`)
        } else if (c.scenario === "missing") {
          failures = checkMissing(c, ready, report, server.calls)
          if (failures.length) failures.push(`report of the content script:\n${JSON.stringify(report, null, 2)}`)
          console.log(`  ${c.name}: notice ${JSON.stringify(report.first?.notice?.lines)}; muted ${JSON.stringify(report.muted)}; ${systemLanguages}`)
        } else {
          failures = check(c, ready, report, server.calls)
          if (failures.length) failures.push(`message body as displayed:\n${report.originalHtml}`)
          const firstRequest = report.events?.filter((e) => e.phase === "translate" && e.id === report.events[0].id).map((e) => `${e.tier} ${e.at} ms`)
          const retranslated = report.retranslated?.shown?.[0]?.text?.slice(0, 40)
          console.log(`  ${c.name}: ${report.translated?.state?.total ?? "?"} units; first paragraph: ${firstRequest?.join(" → ")}; subject: ${JSON.stringify(report.translated?.subject?.translation)}; document title: ${JSON.stringify(report.documentTitle)}; retranslated: ${retranslated}; Bergamot worker: ${ready.bergamotWorker}; ${systemLanguages}`)
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
    for (const profile of Object.values(profiles)) removeProfile(profile)
    console.log(`builds: ${Object.keys(builds).join(", ")}; screenshots in ${screenshots}`)
    await server.close()
  }
  console.log(failed === 0 ? `e2e: all ${runs.length} runs passed` : `e2e: ${failed} of ${runs.length} runs failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
