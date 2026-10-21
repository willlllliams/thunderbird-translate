// A stand-in for Thunderbird's WebExtension API, loaded before the scripts of the extension's pages for the
// listing screenshots (tools/store-screenshots/shoot.mjs). It answers the requests the pages send with fixed data:
// the settings of the shot, a translated message tab, the offline lists, the subject of the message, the message
// list of a folder for the page of translated subjects, and the translations of the sample texts. Nothing is sent
// anywhere. The shot is chosen with ?shot=<name> in the address of the page.
;(() => {
  const params = new URLSearchParams(location.search)
  const shot = params.get("shot") || "bilingual"
  const origin = location.origin

  /** The subject of the sample message, as the header of the message pane shows it (mail.html). */
  const SUBJECT = "Projekt Nordlicht – Unterlagen für die Abnahme"

  /**
   * The sample message: its subject and German paragraphs, with the translation of each tier into English. The text of
   * the subject, the greeting, the feedback, the list and the closing are those of the README animation
   * (tools/readme-gif/samples.js). The AI lines are Markdown, as AI services write it: the content script shows the
   * list and the bold date formatted. The dictionary and Google Translate lines keep the "- " as characters.
   */
  const TEXTS = {
    [SUBJECT]: {
      dictionary: "project northern lights – at the base for the Abnahme",
      machine: "Project Northern Lights – documents for the acceptance",
      ai: "Project Nordlicht – documents for the sign-off",
    },
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
   * The message list of the inbox for the page of translated subjects: invented senders with example addresses, the
   * language of each subject and its translation. The page shows the final (AI) translation; Google Translate gives
   * the same line here, as it is replaced before the screenshot.
   */
  const at = (day, time) => new Date(`2026-10-${String(day).padStart(2, "0")}T${time}:00`).toISOString()
  const MESSAGES = [
    { author: "Katrin Vogel <katrin.vogel@example.com>", date: at(13, "09:12"), subject: SUBJECT, lang: "de", en: TEXTS[SUBJECT].ai },
    { author: "Julien Mercier <julien.mercier@example.net>", date: at(13, "08:47"), subject: "Re: Devis pour la traduction du catalogue 2027", lang: "fr", en: "Quote for the translation of the 2027 catalogue" },
    { author: "佐藤 美咲 <misaki.sato@example.com>", date: at(13, "07:30"), subject: "【ご確認】10月分の請求書送付について", lang: "ja", en: "[Please confirm] Sending the invoice for October" },
    { author: "王磊 <wang.lei@example.net>", date: at(12, "17:05"), subject: "关于下周三技术评审会议的安排", lang: "zh", en: "Arrangements for next Wednesday's technical review meeting" },
    { author: "Jonas Brandt <jonas.brandt@example.com>", date: at(12, "11:40"), subject: "WG: Lieferverzögerung bei Bestellung 4471", lang: "de", en: "Delivery delay on order 4471" },
    { author: "Circolo Vela Garda <segreteria@example.org>", date: at(11, "19:03"), subject: "Convocazione assemblea dei soci – 5 novembre", lang: "it", en: "Notice of the members' meeting – 5 November" },
    { author: "Sanne de Vries <sanne.devries@example.net>", date: at(11, "10:15"), subject: "Uitnodiging: kwartaaloverleg Q4", lang: "nl", en: "Invitation: Q4 quarterly meeting" },
    { author: "Beatriz Costa <beatriz.costa@example.org>", date: at(9, "16:31"), subject: "Re: Pedido de amostras – coleção de inverno", lang: "pt", en: "Sample order – winter collection" },
    { author: "Lina Holm <lina.holm@example.org>", date: at(8, "13:47"), subject: "Påminnelse: workshop om hållbar design på torsdag", lang: "sv", en: "Reminder: workshop on sustainable design on Thursday" },
  ].map((m, i) => ({ id: 101 + i, folder: { accountId: "account1", path: "/INBOX", name: "Inbox" }, read: i > 2, flagged: false, ...m }))
  /** The subjects without their reply and forward prefixes, as the page sends them, with their language and translation. */
  const SUBJECTS = Object.fromEntries(MESSAGES.map((m) => [m.subject.replace(/^(?:(?:re|wg)\s*:\s*)+/i, ""), m]))

  const translate = (tier, text) => TEXTS[text.trim()]?.[tier] ?? SUBJECTS[text.trim()]?.en ?? text

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
    translateSubject: true,
    renderMarkdown: true,
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
        // The subject line and the five paragraphs.
        return { connected: true, active: true, total: 6, done: 6, provisional: 0, failed: 0 }
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

  /**
   * The Port of the content script (tt-content) or of the page of translated subjects (tt-subjects): settings at once,
   * then translations as the tiers would send them. The content script asks for the subject of the message, which the
   * background script reads from the header of the message on screen.
   */
  function connect({ name } = {}) {
    const subjectsPage = name === "tt-subjects"
    const onMessage = listeners()
    const onDisconnect = listeners()
    const push = (msg) => setTimeout(() => onMessage.fire(structuredClone(msg)), 0)
    const port = {
      name,
      onMessage,
      onDisconnect,
      disconnect() {},
      postMessage(msg) {
        if (msg.type === "subject") {
          push({ type: "subject", id: msg.id, subject: SUBJECT })
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
        translateSubject: true,
        renderMarkdown: true,
        tiers,
        signatures: Object.fromEntries(tiers.map((tier) => [tier, tier])),
        precise: false,
        style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
        offlineMutedPairs: [],
        consent,
      },
    })
    // The translation of the message starts as with the toolbar button; the page of translated subjects starts by itself.
    if (!subjectsPage) setTimeout(() => onMessage.fire({ type: "toggle" }), 200)
    return port
  }

  const GERMAN = /[äöüß]|\b(hallo|zusammen|und|die|der|wir|ich|bitte|vielen)\b/i
  const language = (text) => SUBJECTS[text.trim()]?.lang ?? (GERMAN.test(text) ? "de" : "en")
  const api = {
    runtime: {
      getURL: (path) => `${origin}/${String(path).replace(/^\//, "")}`,
      getManifest: () => ({ version: "2.2.0", name: "Multi Translate for Thunderbird" }),
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
    // The mail tab of the page of translated subjects shows the inbox; its list fits on one page.
    mailTabs: {
      getCurrent: async () => ({ id: 1, type: "mail" }),
      getListedMessages: async () => ({ id: null, messages: structuredClone(MESSAGES) }),
      setSelectedMessages: async () => {},
      onDisplayedFolderChanged: listeners(),
    },
    messages: {
      continueList: async () => ({ id: null, messages: [] }),
      abortList: async () => {},
      onNewMailReceived: listeners(),
      onDeleted: listeners(),
      onMoved: listeners(),
    },
    windows: { create: async () => ({}) },
    permissions: { contains: async () => true, request: async () => true, onAdded: listeners(), onRemoved: listeners() },
    messageDisplayAction: { setTitle: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    commands: { onCommand: listeners() },
  }
  globalThis.browser = api
  globalThis.messenger = api
})()
