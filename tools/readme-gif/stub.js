// A stand-in for Thunderbird's WebExtension API for the README animations (record.mjs), loaded after samples.js and
// before the scripts of the extension's pages. It follows tools/store-screenshots/stub.js, with two differences: the
// address picks the interface language and the sample message (?variant=en|zh-CN|zh-TW) and the scene
// (?scene=tiers|images|summary|modes), and nothing happens by itself. The stage starts the translation and releases
// each tier's answer for each paragraph, the answer for the image and the summary through window.__gif, so that every
// frame shows a state chosen by the timeline of the stage, not by the timers of the browser.
// The popup and the message body are two frames of the stage, each with its own copy of this stub. What the popup
// asks of the background script for the message (its state, "Show original", "Summary and to-dos") and the settings
// it stores (display mode, image mode) go to the copy of the message body, which pushes them to the content script as
// the background script would.
;(() => {
  const params = new URLSearchParams(location.search)
  const sample = globalThis.README_GIF_SAMPLES[params.get("variant") || "en"]
  const scene = params.get("scene") || "tiers"
  const origin = location.origin
  const TIERS = ["dictionary", "machine", "ai"]

  /** What the content script translates in each scene: the paragraphs of its message. */
  const UNITS = {
    tiers: sample.paragraphs,
    modes: sample.paragraphs,
    summary: [...sample.paragraphs.slice(0, 3), sample.meeting, sample.paragraphs[3]],
    images: sample.report.paragraphs,
  }
  const units = UNITS[scene]

  /** The settings of each scene: precise translation and the image mode; the summary has the button above the message. */
  const SCENES = {
    tiers: { precise: false, image: "ask" },
    images: { precise: true, image: "ask" },
    summary: { precise: false, image: "off" },
    modes: { precise: true, image: "off" },
  }
  const config = SCENES[scene]

  const settings = {
    uiLanguage: sample.locale,
    sourceLang: "auto",
    targetLang: sample.targetLang,
    mode: "bilingual",
    autoTranslate: false,
    renderMarkdown: true,
    tiers: { dictionary: "dictionary", machine: "google-free", ai: "deepseek" },
    providers: {
      dictionary: { enabled: true, apiKey: "", baseURL: "", model: "" },
      "google-free": { enabled: true, apiKey: "", baseURL: "", model: "" },
      deepseek: { enabled: true, apiKey: "sk-example-key-for-the-readme", baseURL: "", model: "deepseek-flash" },
    },
    precise: { enabled: config.precise },
    image: { mode: config.image },
    onlineConsent: ["google-free", "deepseek"],
  }
  const stored = { settings, welcome: { step: "tiers", toured: true } }

  const pack = (src, tgt) => ({ src, tgt, bytes: 1_000_000, entries: 50_000, license: "CC BY-SA 4.0", attribution: "Wiktionary", installed: true, version: "20261011" })
  const PACKS = [pack("de", "en"), pack("en", "zh-Hans"), pack("en", "zh-Hant")]

  const listeners = () => {
    const list = []
    return { addListener: (f) => list.push(f), removeListener: (f) => list.splice(list.indexOf(f), 1), hasListener: (f) => list.includes(f), fire: (...args) => list.map((f) => f(...args)) }
  }

  /** The stub of the message body, seen from the popup; null in the message body itself. */
  const body = () => (window.parent !== window ? window.parent.document.getElementById("body")?.contentWindow?.__gif : null) ?? null

  async function respond(req) {
    switch (req.type) {
      case "getLocaleMessages":
        return { locale: sample.locale, messages: await (await fetch(`${origin}/__locales/${sample.locale}.json`)).json() }
      case "getTabState":
        return body()?.tabState ?? { connected: true, active: false, total: 0, done: 0, provisional: 0, failed: 0 }
      case "toggleTab":
        return body()?.toggle()
      case "summarizeTab":
        return body()?.summarize()
      case "offlineList":
        return { ok: true, items: req.service === "dictionary" ? PACKS : [] }
      case "offlineStatus":
      case "offlineProgress":
        return {}
      case "cacheStats":
        return { size: 0 }
      default:
        return undefined
    }
  }

  /** The index of a paragraph of the message, from the text the content script sends. */
  const indexOf = (text) => units.findIndex((p) => p.text.trim() === text.trim())

  /** Answers the stage has released ("tier:index") and requests that wait for them. */
  const released = new Set()
  const waiting = []
  /** Image and summary requests that wait for the stage. */
  const images = []
  const summaries = []
  let port = null

  /** Send every released answer a request still waits for; a request whose tiers have all answered is done. */
  function flush() {
    for (const entry of waiting) {
      for (const tier of entry.tiers) {
        if (entry.answered.has(tier) || !released.has(`${tier}:${entry.index}`)) continue
        entry.answered.add(tier)
        port.onMessage.fire({ type: "tier", id: entry.id, tier, result: { ok: true, text: units[entry.index][tier] ?? units[entry.index].ai } })
      }
      if (entry.answered.size === entry.tiers.length && !entry.done) {
        entry.done = true
        port.onMessage.fire({ type: "done", id: entry.id })
      }
    }
    if (released.has("image")) for (const id of images.splice(0)) port.onMessage.fire({ type: "imageResult", id, result: { status: "done", text: sample.report.table, service: "DeepSeek", cached: false, usage: { input: 1214, output: 187 } } })
    if (released.has("summary")) for (const id of summaries.splice(0)) port.onMessage.fire({ type: "summary", id, result: { ok: true, service: "DeepSeek", summary: sample.summary, raw: JSON.stringify(sample.summary) } })
  }

  /** The settings as the background script pushes them to the content script, from the stored ones. */
  function publicSettings() {
    const s = stored.settings
    return {
      uiLanguage: sample.locale,
      sourceLang: "auto",
      targetLang: sample.targetLang,
      mode: s.mode,
      autoTranslate: false,
      renderMarkdown: true,
      tiers: TIERS,
      signatures: Object.fromEntries(TIERS.map((tier) => [tier, tier])),
      credentials: 0,
      precise: s.precise.enabled,
      style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
      offlineMutedPairs: [],
      consent: [],
      summary: { available: true, inlineButton: scene === "summary", auto: "off", collapsed: false, consent: null },
      image: {
        mode: s.precise.enabled ? s.image.mode : "off",
        sources: { inline: true, attachments: true },
        maxPerMessage: 5,
        minSide: 100,
        minArea: 40000,
        maxAspect: 8,
        skipSignature: true,
        collapsed: false,
        showUsage: true,
        consent: { id: "deepseek", host: "api.deepseek.com" },
        confirmEachMessage: false,
        maxLongEdge: 1568,
        format: "image/jpeg",
        glossary: false,
        signature: "deepseek-flash",
      },
    }
  }

  /** The client records a request after posting it: answers already released come after that. */
  const later = () => setTimeout(flush, 0)

  function connect() {
    port = {
      name: "tt-content",
      onMessage: listeners(),
      onDisconnect: listeners(),
      disconnect() {},
      postMessage(msg) {
        if (msg.type === "state") gif.tabState = { connected: true, ...msg.state }
        else if (msg.type === "summary") {
          gif.requests.summary++
          summaries.push(msg.id)
          later()
        } else if (msg.type === "image") {
          gif.requests.image++
          if (msg.image.action === "peek") setTimeout(() => port.onMessage.fire({ type: "imageResult", id: msg.id, result: { status: "ready" } }), 0)
          else {
            images.push(msg.id)
            later()
          }
        } else if (msg.type === "translate") {
          gif.requests.translate++
          const index = indexOf(msg.request.text)
          if (index < 0) throw new Error(`not a unit of the sample: ${msg.request.text}`)
          waiting.push({ id: msg.id, index, tiers: msg.request.tiers, answered: new Set(), done: false })
          later()
        }
      },
    }
    setTimeout(() => {
      port.onMessage.fire({ type: "settings", settings: publicSettings() })
      gif.connected = true
    }, 0)
    return port
  }

  /**
   * What the stage drives: start() is the click on the toolbar button, release() one tier's answer for one paragraph,
   * or the answer for the image ("image") or the summary ("summary"). The popup calls toggle(), summarize() and
   * stored(); requests counts what the content script sent.
   */
  const gif = {
    connected: false,
    started: 0,
    tabState: { connected: true, active: false, total: 0, done: 0, provisional: 0, failed: 0 },
    requests: { translate: 0, image: 0, summary: 0 },
    /** The text "Copy as Markdown" put on the clipboard. */
    copied: null,
    /** Until the content script reports the translation as started: a toggle that came before its settings were applied did nothing. */
    start() {
      if (gif.tabState.active || Date.now() - gif.started < 500) return
      gif.started = Date.now()
      port.onMessage.fire({ type: "toggle" })
    },
    toggle() {
      port.onMessage.fire({ type: "toggle" })
    },
    summarize() {
      port.onMessage.fire({ type: "summarize" })
    },
    release(tier, index) {
      const key = index === undefined ? tier : `${tier}:${index}`
      if (released.has(key)) return
      released.add(key)
      flush()
    },
    /** The popup stored new settings: the content script gets them, as from the background script. */
    stored(next) {
      stored.settings = structuredClone(next)
      port.onMessage.fire({ type: "settings", settings: publicSettings() })
    },
  }
  globalThis.__gif = gif

  // "Copy as Markdown": the clipboard of the stand-in, which the stage reads.
  if (window.parent !== window && location.pathname.endsWith("/body.html")) {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => void (gif.copied = text) } })
  }

  const api = {
    runtime: {
      getURL: (path) => `${origin}/${String(path).replace(/^\//, "")}`,
      getManifest: () => ({ version: "3.0.0", name: "Multi Translate for Thunderbird" }),
      sendMessage: (req) => respond(req),
      connect,
      onMessage: listeners(),
      onConnect: listeners(),
      onInstalled: listeners(),
      openOptionsPage: async () => {},
    },
    storage: {
      local: {
        get: async (key) => (key == null ? structuredClone(stored) : Object.fromEntries([].concat(key).filter((k) => k in stored).map((k) => [k, structuredClone(stored[k])]))),
        set: async (items) => {
          Object.assign(stored, structuredClone(items))
          if (items.settings) body()?.stored(items.settings)
        },
        remove: async () => {},
      },
      onChanged: listeners(),
    },
    i18n: {
      getUILanguage: () => sample.uiTag,
      getPreferredSystemLanguages: async () => [sample.uiTag],
      detectLanguage: async () => ({ isReliable: true, languages: [{ language: sample.messageLang, percentage: 100 }] }),
    },
    tabs: {
      query: async () => [{ id: 1, type: "messageDisplay" }],
      getCurrent: async () => ({ id: 2 }),
      create: async () => ({}),
      remove: async () => {},
    },
    permissions: { contains: async () => true, request: async () => true, onAdded: listeners(), onRemoved: listeners() },
    messageDisplayAction: { setTitle: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    commands: { onCommand: listeners() },
  }
  globalThis.browser = api
  globalThis.messenger = api
})()
