// A stand-in for Thunderbird's WebExtension API, loaded before the scripts of the extension's pages for the
// listing screenshots (tools/store-screenshots/shoot.mjs). It answers the requests the pages send with fixed data:
// the settings of the shot, a translated message tab, the offline lists, the summary, the text of the chart image and
// the translations of the sample texts. Nothing is sent anywhere. The shot is chosen with ?shot=<name> in the address
// of the page. The images shot uses the message with the chart of the README animations (tools/readme-gif/samples.js).
;(() => {
  const params = new URLSearchParams(location.search)
  const shot = params.get("shot") || "bilingual"
  const origin = location.origin

  /**
   * The sample message: its German paragraphs, with the translation of each tier into English. The text of the
   * greeting, the feedback, the list and the closing are those of the README animation
   * (tools/readme-gif/samples.js). The AI lines are Markdown, as AI services write it: the content script shows the
   * list and the bold date formatted. The dictionary and Google Translate lines keep the "- " as characters.
   */
  const TEXTS = {
    "Hallo zusammen,": { dictionary: "hello together,", machine: "Hello everyone,", ai: "Hi all," },
    "vielen Dank für die schnelle Rückmeldung zum Entwurf. Wir haben die Anmerkungen zum Budget eingearbeitet und die überarbeitete Fassung gestern Abend hochgeladen.": {
      dictionary: "thank you very much for the quick feedback to draft. we have the remark to budget eingearbeitet and the revise version yesterday evening upload.",
      machine: "thank you very much for the quick feedback on the draft. We have incorporated the comments on the budget and uploaded the revised version yesterday evening.",
      ai: "Thank you for the quick feedback on the draft. We have worked your comments on the budget into it and uploaded the revised version last night.",
    },
    "Bitte schickt mir bis Freitag, 23. Oktober:\n- die finale Kostenaufstellung\n- die Folien zum Zeitplan": {
      dictionary: "please send I until Friday, 23. October:\n- the final Kostenaufstellung\n- the slide to timetable",
      machine: "Please send me by Friday, October 23rd:\n- the final cost breakdown\n- the slides on the schedule",
      ai: "Please send me the following by **Friday, 23 October**:\n- the final cost breakdown\n- the slides on the timeline",
    },
    "Die Abnahme selbst würde ich gern auf Dienstag, 27. Oktober, 15 Uhr, legen. Am Montag bin ich auf einer Messe in Hamburg und nur eingeschränkt erreichbar.": {
      dictionary: "the acceptance self would I gladly on Tuesday, 27. October, 15 clock, lay. on Monday am I on a fair in Hamburg and only limited reachable.",
      machine: "I would like to schedule the acceptance itself for Tuesday, October 27th, at 3 p.m. On Monday I am at a trade fair in Hamburg and only available to a limited extent.",
      ai: "I would like to hold the sign-off itself on Tuesday, 27 October, at 3 pm. On Monday I am at a trade fair in Hamburg and hard to reach.",
    },
    "Viele Grüße\nKatrin": { dictionary: "much greeting\nKatrin", machine: "Best regards\nKatrin", ai: "Best regards,\nKatrin" },
  }

  /**
   * The summary and to-dos of the sample message, as the AI service answers the summary prompt (the JSON of
   * e2e/mock-server.mjs SUMMARY_ANSWER, here for the sample message): the reader is "me", which the panel shows as "Me".
   */
  const SUMMARY = {
    summary: [
      "Katrin has uploaded the revised draft with the comments on the budget worked in. She asks for the final cost breakdown and the slides on the timeline by Friday, and proposes Tuesday afternoon for the sign-off.",
    ],
    actions: [
      { who: "me", task: "Send Katrin the final cost breakdown and the slides on the timeline", due: "2026-10-23", dueText: "Friday", quote: "Bitte schickt mir bis Freitag, 23. Oktober" },
      { who: "me", task: "Tell Katrin whether Tuesday at 3 pm suits for the sign-off", due: "", dueText: "", quote: "Die Abnahme selbst würde ich gern auf Dienstag, 27. Oktober, 15 Uhr, legen." },
    ],
    questions: [{ from: "Katrin Vogel", question: "Does Tuesday, 27 October, at 3 pm suit you for the sign-off?" }],
    dates: [
      { what: "Deadline for the cost breakdown and the slides", when: "2026-10-23", where: "" },
      { what: "Sign-off of Project Nordlicht", when: "2026-10-27 15:00", where: "" },
      { what: "Katrin at a trade fair, hard to reach", when: "2026-10-26", where: "Hamburg" },
    ],
  }
  const summaryShot = shot === "summary"
  const imagesShot = shot === "images"
  /** The message with the chart and the answer of the AI service for the chart, from the samples of the README animations. */
  const report = globalThis.README_GIF_SAMPLES?.en.report
  if (report) for (const p of report.paragraphs) TEXTS[p.text] = { dictionary: p.ai, machine: p.ai, ai: p.ai }

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
    renderMarkdown: true,
    tiers: { dictionary: "dictionary", machine: "google-free", ai: "openai" },
    providers: {
      dictionary: { enabled: true, apiKey: "", baseURL: "", model: "" },
      "google-free": { enabled: true, apiKey: "", baseURL: "", model: "" },
      "microsoft-free": { enabled: true, apiKey: "", baseURL: "", model: "" },
      bergamot: { enabled: true, apiKey: "", baseURL: "", model: "" },
      openai: { enabled: true, apiKey: "sk-example-key-for-screenshots", baseURL: "", model: "gpt-4.1-mini" },
    },
    precise: { enabled: imagesShot },
    image: { mode: imagesShot ? "auto" : "ask" },
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
        // The five paragraphs.
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

  /** The Port of the content script (tt-content): settings at once, then translations as the tiers would send them. */
  function connect({ name } = {}) {
    const onMessage = listeners()
    const onDisconnect = listeners()
    const push = (msg) => setTimeout(() => onMessage.fire(structuredClone(msg)), 0)
    const port = {
      name,
      onMessage,
      onDisconnect,
      disconnect() {},
      postMessage(msg) {
        if (msg.type === "summary") {
          const result = { ok: true, service: "OpenAI", summary: SUMMARY, raw: JSON.stringify(SUMMARY) }
          setTimeout(() => onMessage.fire({ type: "summary", id: msg.id, result }), 150)
          return
        }
        if (msg.type === "image") {
          // The chart passes the filters; sent by itself ("On"), it gets the table of its labels.
          const result = msg.image.action === "peek" ? { status: "ready" } : { status: "done", text: report.table, service: "OpenAI", cached: false, usage: { input: 1214, output: 187 } }
          setTimeout(() => onMessage.fire({ type: "imageResult", id: msg.id, result }), 50)
          return
        }
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
        renderMarkdown: true,
        tiers,
        signatures: Object.fromEntries(tiers.map((tier) => [tier, tier])),
        precise: imagesShot,
        credentials: 0,
        style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
        offlineMutedPairs: [],
        consent,
        summary: { available: summaryShot, inlineButton: false, auto: "off", collapsed: false, consent: null },
        image: { mode: imagesShot ? "auto" : "off", sources: { inline: true, attachments: true }, maxPerMessage: 5, minSide: 100, minArea: 40000, maxAspect: 8, skipSignature: true, collapsed: false, showUsage: true, consent: null, confirmEachMessage: false, maxLongEdge: 1568, format: "image/jpeg", glossary: false, signature: "" },
      },
    })
    // The translation of the message starts as with the button in the message header.
    setTimeout(() => onMessage.fire({ type: "toggle" }), 200)
    // The summary shot asks for the summary once the message is translated, as "Summary and to-dos" in the popup does.
    if (summaryShot) setTimeout(() => onMessage.fire({ type: "summarize" }), 600)
    return port
  }

  const GERMAN = /[äöüß]|\b(hallo|zusammen|und|die|der|wir|ich|bitte|vielen)\b/i
  const language = (text) => (GERMAN.test(text) ? "de" : "en")
  const api = {
    runtime: {
      getURL: (path) => `${origin}/${String(path).replace(/^\//, "")}`,
      getManifest: () => ({ version: "3.0.0", name: "Multi Translate for Thunderbird" }),
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
      detectLanguage: async (text) => ({ isReliable: true, languages: [{ language: language(text), percentage: 100 }] }),
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
