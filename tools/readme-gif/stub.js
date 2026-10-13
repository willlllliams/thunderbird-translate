// A stand-in for Thunderbird's WebExtension API for the README animations (record.mjs), loaded after samples.js and
// before the scripts of the extension's pages. It follows tools/store-screenshots/stub.js, with two differences: the
// variant (?variant=en|zh-CN|zh-TW) picks the interface language and the sample message, and nothing happens by
// itself. The stage starts the translation and releases each tier's answer for each paragraph through window.__gif,
// so that every frame shows a state chosen by the timeline of the stage, not by the timers of the browser.
;(() => {
  const params = new URLSearchParams(location.search)
  const sample = globalThis.README_GIF_SAMPLES[params.get("variant") || "en"]
  const origin = location.origin
  const tiers = ["dictionary", "machine", "ai"]

  const settings = {
    uiLanguage: sample.locale,
    sourceLang: "auto",
    targetLang: sample.targetLang,
    mode: "bilingual",
    autoTranslate: false,
    tiers: { dictionary: "dictionary", machine: "google-free", ai: "deepseek" },
    providers: {
      dictionary: { enabled: true, apiKey: "", baseURL: "", model: "" },
      "google-free": { enabled: true, apiKey: "", baseURL: "", model: "" },
      deepseek: { enabled: true, apiKey: "sk-example-key-for-the-readme", baseURL: "", model: "deepseek-flash" },
    },
    precise: { enabled: false },
    onlineConsent: ["google-free", "deepseek"],
  }
  const stored = { settings, welcome: { step: "tiers", toured: true } }

  const pack = (src, tgt) => ({ src, tgt, bytes: 1_000_000, entries: 50_000, license: "CC BY-SA 4.0", attribution: "Wiktionary", installed: true, version: "20261011" })
  const PACKS = [pack("de", "en"), pack("en", "zh-Hans"), pack("en", "zh-Hant")]

  const listeners = () => {
    const list = []
    return { addListener: (f) => list.push(f), removeListener: (f) => list.splice(list.indexOf(f), 1), hasListener: (f) => list.includes(f), fire: (...args) => list.map((f) => f(...args)) }
  }

  async function respond(req) {
    switch (req.type) {
      case "getLocaleMessages":
        return { locale: sample.locale, messages: await (await fetch(`${origin}/__locales/${sample.locale}.json`)).json() }
      case "getTabState":
        return { connected: true, active: false, total: 0, done: 0, provisional: 0, failed: 0 }
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

  /** The index of a paragraph of the sample, from the text the content script sends. */
  const indexOf = (text) => sample.paragraphs.findIndex((p) => p.text.trim() === text.trim())

  /** Answers the stage has released ("tier:index") and requests that wait for them. */
  const released = new Set()
  const waiting = []
  let port = null

  /** Send every released answer a request still waits for; a request whose tiers have all answered is done. */
  function flush() {
    for (const entry of waiting) {
      for (const tier of entry.tiers) {
        if (entry.answered.has(tier) || !released.has(`${tier}:${entry.index}`)) continue
        entry.answered.add(tier)
        port.onMessage.fire({ type: "tier", id: entry.id, tier, result: { ok: true, text: sample.paragraphs[entry.index][tier] } })
      }
      if (entry.answered.size === entry.tiers.length && !entry.done) {
        entry.done = true
        port.onMessage.fire({ type: "done", id: entry.id })
      }
    }
  }

  function connect() {
    port = {
      name: "tt-content",
      onMessage: listeners(),
      onDisconnect: listeners(),
      disconnect() {},
      postMessage(msg) {
        if (msg.type !== "translate") return
        const index = indexOf(msg.request.text)
        if (index < 0) throw new Error(`not a paragraph of the sample: ${msg.request.text}`)
        waiting.push({ id: msg.id, index, tiers: msg.request.tiers, answered: new Set(), done: false })
        flush()
      },
    }
    setTimeout(() => {
      port.onMessage.fire({
        type: "settings",
        settings: {
          uiLanguage: sample.locale,
          sourceLang: "auto",
          targetLang: sample.targetLang,
          mode: "bilingual",
          autoTranslate: false,
          tiers,
          signatures: Object.fromEntries(tiers.map((tier) => [tier, tier])),
          precise: false,
          style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
          offlineMutedPairs: [],
          consent: [],
        },
      })
      gif.connected = true
    }, 0)
    return port
  }

  /** What the stage drives: start() is the click on the toolbar button, release() one tier's answer for one paragraph. */
  const gif = {
    connected: false,
    started: false,
    start() {
      if (gif.started) return
      gif.started = true
      port.onMessage.fire({ type: "toggle" })
    },
    release(tier, index) {
      const key = `${tier}:${index}`
      if (released.has(key)) return
      released.add(key)
      flush()
    },
  }
  globalThis.__gif = gif

  const api = {
    runtime: {
      getURL: (path) => `${origin}/${String(path).replace(/^\//, "")}`,
      getManifest: () => ({ version: "2.0.0", name: "Multi Translate for Thunderbird" }),
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
        set: async (items) => Object.assign(stored, structuredClone(items)),
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
