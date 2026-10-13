// A stand-in for Thunderbird's WebExtension API, loaded before the scripts of the extension's pages for the
// listing screenshots (tools/store-screenshots/shoot.mjs). It answers the requests the pages send with fixed data:
// the settings of the shot, a translated message tab, the offline lists, and, for the content script, translations
// of the sample message. Nothing is sent anywhere. The shot is chosen with ?shot=<name> in the address of the page.
;(() => {
  const params = new URLSearchParams(location.search)
  const shot = params.get("shot") || "bilingual"
  const origin = location.origin

  /** The sample message: German paragraphs, with the translation of each tier into English. */
  const TEXTS = {
    "Hallo zusammen,": { dictionary: "Hello together,", machine: "Hello everyone,", ai: "Hello everyone," },
    "vielen Dank für die schnelle Rückmeldung zum Entwurf. Wir haben die Anmerkungen zum Budget eingearbeitet und die überarbeitete Fassung gestern Abend hochgeladen.": {
      dictionary: "many thanks for the fast feedback to draft. We have the remarks to budget incorporated and the revised version yesterday evening uploaded.",
      machine: "thank you very much for the quick feedback on the draft. We have incorporated the comments on the budget and uploaded the revised version yesterday evening.",
      ai: "Thank you for the quick feedback on the draft. We have worked your comments on the budget into it and uploaded the revised version last night.",
    },
    "Könnten wir die Abnahme auf Donnerstag, 15 Uhr, verschieben? Am Mittwoch bin ich auf einer Messe in Hamburg und nur eingeschränkt erreichbar.": {
      dictionary: "Could we the acceptance on Thursday, 15 clock, move? On Wednesday am I on a fair in Hamburg and only limited reachable.",
      machine: "Could we postpone the acceptance to Thursday, 3 p.m.? On Wednesday I am at a trade fair in Hamburg and only available to a limited extent.",
      ai: "Could we move the sign-off meeting to Thursday at 3 pm? On Wednesday I am at a trade fair in Hamburg and hard to reach.",
    },
    "Bitte prüft bis Dienstag, ob die Liefertermine im Anhang noch stimmen. Falls sich etwas geändert hat, passe ich den Zeitplan an.": {
      dictionary: "Please check until Tuesday, whether the delivery dates in attachment still right. If itself something changed has, fit I the schedule on.",
      machine: "Please check by Tuesday whether the delivery dates in the attachment are still correct. If something has changed, I will adjust the schedule.",
      ai: "Please check by Tuesday that the delivery dates in the attachment are still right. If anything has changed, I will update the schedule.",
    },
    "Viele Grüße\nKatrin": { dictionary: "Many greetings\nKatrin", machine: "Best regards\nKatrin", ai: "Best regards,\nKatrin" },
  }
  const translate = (tier, text) => TEXTS[text.trim()]?.[tier] ?? text

  const mode = shot === "translation-only" ? "translation-only" : "bilingual"
  const tiers = shot === "provisional" ? ["dictionary", "machine", "ai"] : ["machine", "ai"]
  const consent = shot === "consent" ? [{ id: "google-free", host: "translate.googleapis.com" }, { id: "openai", host: "api.openai.com" }] : []

  /** Settings as storage.local holds them; reading them fills in every other field with its default. */
  const settings = {
    uiLanguage: "en",
    sourceLang: "auto",
    targetLang: "en",
    mode,
    autoTranslate: false,
    tiers: { dictionary: "dictionary", machine: "google-free", ai: "openai" },
    providers: {
      dictionary: { enabled: true, apiKey: "", baseURL: "", model: "" },
      "google-free": { enabled: true, apiKey: "", baseURL: "", model: "" },
      "microsoft-free": { enabled: true, apiKey: "", baseURL: "", model: "" },
      bergamot: { enabled: true, apiKey: "", baseURL: "", model: "" },
      openai: { enabled: true, apiKey: "sk-example-key-for-screenshots", baseURL: "", model: "gpt-4.1-mini" },
    },
    precise: { enabled: false },
    onlineConsent: ["google-free", "openai"],
  }
  const stored = { settings, welcome: { step: "tiers", toured: true } }

  const MB = 1024 * 1024
  const pack = (src, tgt, bytes, entries, installed) => ({ src, tgt, bytes, entries, license: "CC BY-SA 4.0", attribution: "Adapted from Wiktionary by Wiktionary contributors; CC BY-SA 4.0", installed, ...(installed ? { version: "20261011" } : {}) })
  const model = (src, tgt, mb, installed) => ({ src, tgt, version: "3.0", architecture: "base", bytes: Math.round(mb * MB), rawBytes: Math.round(mb * 2.2 * MB), installed })
  const LISTS = {
    // Sizes and entries of the packs of the release dicts-v1.
    dictionary: [pack("de", "en", 2092525, 83279, true), pack("en", "de", 1271743, 65497, false), pack("en", "zh-Hans", 718971, 57640, true), pack("fr", "en", 1818173, 85378, false), pack("ja", "en", 2948019, 75433, false)],
    bergamot: [model("de", "en", 18.1, true), model("en", "de", 17.9, false), model("en", "zh-Hans", 34.5, false), model("fr", "en", 16.2, false)],
  }

  const listeners = () => {
    const list = []
    return { addListener: (f) => list.push(f), removeListener: (f) => list.splice(list.indexOf(f), 1), hasListener: (f) => list.includes(f), fire: (...args) => list.map((f) => f(...args)) }
  }
  const storageChanged = listeners()
  const runtimeMessage = listeners()

  async function respond(req) {
    switch (req.type) {
      case "getLocaleMessages": {
        const messages = await (await fetch(`${origin}/__locales/en.json`)).json()
        return { locale: "en", messages }
      }
      case "getTabState":
        return { connected: true, active: true, total: 5, done: 5, provisional: 0, failed: 0 }
      case "offlineStatus":
        return {}
      case "offlineList":
        return { ok: true, items: LISTS[req.service] ?? [] }
      case "offlineProgress":
        return {}
      case "cacheStats":
        return { size: 1342 }
      case "grantConsent":
      case "openOptions":
      case "muteOfflinePairs":
        return undefined
      default:
        return undefined
    }
  }

  /** The Port of the content script: settings at once, then translations as the tiers would send them. */
  function connect() {
    const onMessage = listeners()
    const onDisconnect = listeners()
    const push = (msg) => setTimeout(() => onMessage.fire(structuredClone(msg)), 0)
    const port = {
      name: "tt-content",
      onMessage,
      onDisconnect,
      disconnect() {},
      postMessage(msg) {
        if (msg.type !== "translate") return
        const { id, request } = msg
        request.tiers.forEach((tier, i) => {
          // The provisional shot keeps the AI tier running, so the lower tiers stay on screen.
          if (shot === "provisional" && tier === "ai") return
          setTimeout(() => onMessage.fire({ type: "tier", id, tier, result: { ok: true, text: translate(tier, request.text) } }), 20 * (i + 1))
        })
        if (shot !== "provisional") setTimeout(() => onMessage.fire({ type: "done", id }), 100)
      },
    }
    push({
      type: "settings",
      settings: {
        uiLanguage: "en",
        sourceLang: "auto",
        targetLang: "en",
        mode,
        autoTranslate: false,
        tiers,
        signatures: Object.fromEntries(tiers.map((tier) => [tier, tier])),
        precise: false,
        style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
        offlineMutedPairs: [],
        consent,
      },
    })
    // The translation starts as with the toolbar button.
    setTimeout(() => onMessage.fire({ type: "toggle" }), 200)
    return port
  }

  const GERMAN = /[äöüß]|\b(hallo|zusammen|und|die|der|wir|ich|bitte|vielen)\b/i
  const api = {
    runtime: {
      getURL: (path) => `${origin}/${String(path).replace(/^\//, "")}`,
      getManifest: () => ({ version: "2.0.0", name: "Multi Translate for Thunderbird" }),
      sendMessage: (req) => respond(req),
      connect,
      onMessage: runtimeMessage,
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
      onChanged: storageChanged,
    },
    i18n: {
      getUILanguage: () => "en-US",
      getPreferredSystemLanguages: async () => ["en-US", "de-DE"],
      detectLanguage: async (text) => ({ isReliable: true, languages: [{ language: GERMAN.test(text) ? "de" : "en", percentage: 100 }] }),
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
