// The sample messages of the README animations (record.mjs), one set per variant: made-up emails with made-up names
// and example.com addresses, the translation each tier gives for every paragraph, the summary and the text of the
// chart image the AI service answers, and the words of the caption line of each scene.
// The subjects are those of the message header, which the extension does not translate.
// The dictionary lines are the output of the real dictionary tier (translateText() of src/offline/dictionary) with the
// packs dict-de-en and dict-en-zh-Hans of the release dicts-v1; the zh-TW line is that output in traditional characters.
// The AI lines are Markdown, as AI services write it: the content script shows the list and the bold date of the
// third paragraph formatted. The dictionary and Google Translate lines keep the "- " in front of the list items as
// characters, as those services do. Only the tiers scene shows the lower tiers; the other scenes start with the
// final translation, so their paragraphs carry the AI line only.
// Caption texts: $1 stands for the service of the tier as the popup names it.
// The chart of the images scene is drawn by chart() below as SVG: invented figures of an invented company.
;(() => {
  const DE = {
    subject: "Projekt Nordlicht – Unterlagen für die Abnahme",
    greeting: "Hallo zusammen,",
    feedback:
      "vielen Dank für die schnelle Rückmeldung zum Entwurf. Wir haben die Anmerkungen zum Budget eingearbeitet und die überarbeitete Fassung gestern Abend hochgeladen.",
    list: "Bitte schickt mir bis Freitag, 23. Oktober:\n- die finale Kostenaufstellung\n- die Folien zum Zeitplan",
    meeting: "Die Abnahme selbst würde ich gern auf Dienstag, 27. Oktober, 15 Uhr, legen. Am Montag bin ich auf einer Messe in Hamburg und nur eingeschränkt erreichbar.",
    closing: "Viele Grüße\nKatrin",
    reportSubject: "Quartalszahlen – Grafik für die Vorstandssitzung",
    reportBody: "Jonas, anbei die Grafik für die Vorstandssitzung am Donnerstag. Kannst du die Beschriftungen prüfen?",
    reportClosing: "Danke und viele Grüße\nKatrin",
  }
  const EN = {
    subject: "Project Northlight – documents for the review",
    greeting: "Hi everyone,",
    feedback: "Thanks for the quick feedback on the draft. We have worked your comments on the budget into it and uploaded the revised version last night.",
    list: "Please send me by Friday, October 23:\n- the final cost breakdown\n- the slides for the timeline",
    meeting: "I would like to hold the review itself on Tuesday, October 27, at 3 pm. On Monday I am at a trade fair in Hamburg and hard to reach.",
    closing: "Best regards,\nKate",
    reportSubject: "Quarterly figures – chart for the board meeting",
    reportBody: "Jonas, here is the chart for the board meeting on Thursday. Could you check the labels?",
    reportClosing: "Thanks and best regards,\nKate",
  }

  /** The labels of the chart in the language of the message. */
  const CHART = {
    de: { title: "Umsatz nach Vertriebskanal 2026", axis: "Umsatz (Mio. €)", quarter: "Quartal", series: ["Onlineshop", "Filialen", "Großhandel"], forecast: "Prognose" },
    en: { title: "Revenue by sales channel, 2026", axis: "Revenue (€ million)", quarter: "Quarter", series: ["Online shop", "Retail stores", "Wholesale"], forecast: "Forecast" },
  }

  /** Invented figures in € million, per series and quarter; the fourth quarter is a forecast. */
  const FIGURES = [
    [4.2, 4.8, 5.1, 5.9],
    [6.1, 5.8, 5.6, 6.4],
    [3.0, 3.2, 3.1, 3.5],
  ]
  const COLORS = ["#2f6fdb", "#e08a2e", "#4a9d6b"]

  /** A grouped bar chart as an SVG data: URI, drawn on 560×300 and shown at 470×252, with the labels of `lang`. */
  function chart(lang) {
    const c = CHART[lang]
    const W = 560
    const H = 300
    const left = 58
    const right = 150
    const top = 44
    const bottom = 250
    const max = 8
    const y = (v) => bottom - (v / max) * (bottom - top)
    const groupW = (W - left - right) / 4
    const barW = 22
    const parts = []
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
    parts.push(`<text x="${left}" y="26" font-size="18" font-weight="600" fill="#1f2328">${c.title}</text>`)
    for (let v = 0; v <= max; v += 2) {
      parts.push(`<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#6b7280" : "#e3e6eb"}" stroke-width="1"/>`)
      parts.push(`<text x="${left - 8}" y="${y(v) + 4}" font-size="12" text-anchor="end" fill="#4b5563">${v}</text>`)
    }
    parts.push(`<text transform="translate(16 ${(top + bottom) / 2}) rotate(-90)" font-size="13" text-anchor="middle" fill="#374151">${c.axis}</text>`)
    for (let q = 0; q < 4; q++) {
      const x0 = left + q * groupW + (groupW - 3 * barW) / 2
      FIGURES.forEach((series, i) => {
        const v = series[q]
        const forecast = q === 3
        parts.push(`<rect x="${x0 + i * barW}" y="${y(v)}" width="${barW - 3}" height="${bottom - y(v)}" fill="${COLORS[i]}" fill-opacity="${forecast ? 0.45 : 1}" stroke="${COLORS[i]}" stroke-dasharray="${forecast ? "3 2" : "none"}"/>`)
      })
      parts.push(`<text x="${left + q * groupW + groupW / 2}" y="${bottom + 16}" font-size="13" text-anchor="middle" fill="#374151">Q${q + 1}</text>`)
    }
    parts.push(`<text x="${left + 3.5 * groupW}" y="${top - 4}" font-size="12" text-anchor="middle" fill="#6b7280" font-style="italic">${c.forecast}</text>`)
    parts.push(`<text x="${left + 2 * groupW}" y="${bottom + 34}" font-size="13" text-anchor="middle" fill="#374151">${c.quarter}</text>`)
    c.series.forEach((name, i) => {
      const ly = top + 10 + i * 22
      parts.push(`<rect x="${W - right + 18}" y="${ly - 9}" width="12" height="12" fill="${COLORS[i]}"/>`)
      parts.push(`<text x="${W - right + 36}" y="${ly + 1}" font-size="13" fill="#1f2328">${name}</text>`)
    })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 0.84}" height="${H * 0.84}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">${parts.join("")}</svg>`
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  }

  /** The answer of the AI service for the chart: a table of each label with its translation, without the figures or a word on the trend. */
  const table = (lang, rows) => ["| Original | Translation |", "| --- | --- |", ...[CHART[lang].title, CHART[lang].axis, CHART[lang].quarter, ...CHART[lang].series, CHART[lang].forecast].map((label, i) => `| ${label} | ${rows[i]} |`)].join("\n")

  globalThis.README_GIF_SAMPLES = {
    en: {
      locale: "en",
      uiTag: "en-US",
      targetLang: "en",
      messageLang: "de",
      header: { subject: DE.subject, reportSubject: DE.reportSubject, from: "Katrin Vogel <katrin.vogel@example.com>", date: "Tue, 13 Oct 2026 09:12", labelFrom: "From", labelDate: "Date", reply: "Reply", forward: "Forward" },
      captions: {
        intro: "The paragraphs go to three tiers at once",
        dictionary: "$1: word for word, right away",
        machine: "$1 replaces the dictionary text",
        ai: "$1 writes the final translation in Markdown",
      },
      scenes: {
        images: { steps: ["Ask under each image", "Allow once", "Original and translation"], say: ["Precise translation on, images: ask", "One click sends this image only", "Images are allowed once per service", "Only the labels are translated"] },
        summary: { steps: ["Summary", "To-dos", "Copy as Markdown"], say: ["A translated message", "One request to $1", "To-dos with owner and due date", "Ready to paste as Markdown"] },
        modes: { steps: ["Bilingual", "Translation only", "Original"], say: ["The translation under each paragraph", "Same translations, no new request", "Back to bilingual at once", "Translation off: the original, unchanged"] },
      },
      paragraphs: [
        { text: DE.greeting, dictionary: "hello together,", machine: "Hello everyone,", ai: "Hi all," },
        {
          text: DE.feedback,
          dictionary: "thank you very much for the quick feedback to draft. we have the remark to budget eingearbeitet and the revise version yesterday evening upload.",
          machine: "thank you very much for the quick feedback on the draft. We have incorporated the comments on the budget and uploaded the revised version yesterday evening.",
          ai: "Thank you for the quick feedback on the draft. We have worked your comments on the budget into it and uploaded the revised version last night.",
        },
        {
          text: DE.list,
          dictionary: "please send I until Friday, 23. October:\n- the final Kostenaufstellung\n- the slide to timetable",
          machine: "Please send me by Friday, October 23rd:\n- the final cost breakdown\n- the slides on the schedule",
          ai: "Please send me the following by **Friday, 23 October**:\n- the final cost breakdown\n- the slides on the timeline",
        },
        { text: DE.closing, dictionary: "much greeting\nKatrin", machine: "Best regards\nKatrin", ai: "Best regards,\nKatrin" },
      ],
      meeting: { text: DE.meeting, ai: "I would like to hold the sign-off itself on Tuesday, 27 October, at 3 pm. On Monday I am at a trade fair in Hamburg and hard to reach." },
      summary: {
        summary: ["Katrin has uploaded the revised draft with the comments on the budget worked in. She asks for the final cost breakdown and the slides on the timeline by Friday, and proposes Tuesday afternoon for the sign-off."],
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
      },
      report: {
        chart: chart("de"),
        paragraphs: [
          { text: DE.reportBody, ai: "Jonas, here is the chart for the board meeting on Thursday. Could you check the labels?" },
          { text: DE.reportClosing, ai: "Thanks and best regards,\nKatrin" },
        ],
        table: table("de", ["Revenue by sales channel, 2026", "Revenue (€ million)", "Quarter", "Online shop", "Retail stores", "Wholesale", "Forecast"]),
      },
    },
    "zh-CN": {
      locale: "zh_CN",
      uiTag: "zh-CN",
      targetLang: "zh-CN",
      messageLang: "en",
      header: { subject: EN.subject, reportSubject: EN.reportSubject, from: "Kate Miller <kate.miller@example.com>", date: "2026/10/13 09:12", labelFrom: "发件人", labelDate: "日期", reply: "回复", forward: "转发" },
      captions: {
        intro: "每个段落同时交给三个层级翻译",
        dictionary: "$1：逐词直译，立即显示",
        machine: "$1：替换词典译文",
        ai: "$1：给出最终译文，按 Markdown 格式显示",
      },
      scenes: {
        images: { steps: ["图片下询问", "确认一次", "原文与译文对照"], say: ["开启精翻，图片翻译选“图片下询问”", "点击后只发送这一张图片", "每个服务只确认一次", "只译图中的标注"] },
        summary: { steps: ["摘要", "待办", "复制为 Markdown"], say: ["一封已翻译的邮件", "向 $1 发送一次请求", "待办写明负责人和截止日期", "可直接粘贴为 Markdown"] },
        modes: { steps: ["双语对照", "仅译文", "原文"], say: ["译文在每段原文下方", "沿用已有译文，不发新请求", "立即切回双语对照", "关闭翻译，原文原样恢复"] },
      },
      paragraphs: [
        { text: EN.greeting, dictionary: "喂每个人,", machine: "大家好，", ai: "大家好：" },
        {
          text: EN.feedback,
          dictionary: "感谢为那快的反馈在之上那气流.我们有工作你的注解在之上那预算进入之内它和上传那改进的一种描述最后的夜.",
          machine: "感谢您对草稿的快速反馈。我们已将您对预算的意见纳入其中，并于昨晚上传了修订版本。",
          ai: "感谢各位对草稿的及时反馈。我们已按大家对预算的意见做了修改，修订版昨晚已经上传。",
        },
        {
          text: EN.list,
          dictionary: "请发送我被星期五,十月23:\n-那期末考试代价崩溃\n-那滑为那时间轴",
          machine: "请在 10 月 23 日星期五之前发送给我：\n- 最终成本明细\n- 时间表幻灯片",
          ai: "请在**10月23日（周五）前**发给我：\n- 最终费用明细\n- 时间安排的幻灯片",
        },
        { text: EN.closing, dictionary: "最好的问候,\n凯特", machine: "此致，\n凯特", ai: "祝好\nKate" },
      ],
      meeting: { text: EN.meeting, ai: "评审本身我想安排在10月27日（周二）下午3点。周一我在汉堡参加展会，不方便联系。" },
      summary: {
        summary: ["Kate 已上传按预算意见修改后的草稿。她请你在周五前发来最终费用明细和时间安排的幻灯片，并提议周二下午进行评审。"],
        actions: [
          { who: "me", task: "把最终费用明细和时间安排的幻灯片发给 Kate", due: "2026-10-23", dueText: "周五", quote: "Please send me by Friday, October 23" },
          { who: "me", task: "告诉 Kate 周二下午3点是否适合评审", due: "", dueText: "", quote: "I would like to hold the review itself on Tuesday, October 27, at 3 pm." },
        ],
        questions: [{ from: "Kate Miller", question: "10月27日（周二）下午3点进行评审是否合适？" }],
        dates: [
          { what: "费用明细和幻灯片的截止日期", when: "2026-10-23", where: "" },
          { what: "Northlight 项目评审", when: "2026-10-27 15:00", where: "" },
          { what: "Kate 参加展会，不方便联系", when: "2026-10-26", where: "汉堡" },
        ],
      },
      report: {
        chart: chart("en"),
        paragraphs: [
          { text: EN.reportBody, ai: "Jonas，这是周四董事会要用的图表，能帮忙检查一下图上的标注吗？" },
          { text: EN.reportClosing, ai: "谢谢，祝好\nKate" },
        ],
        table: table("en", ["2026 年各销售渠道营收", "营收（百万欧元）", "季度", "网店", "门店", "批发", "预测"]),
      },
    },
    "zh-TW": {
      locale: "zh_TW",
      uiTag: "zh-TW",
      targetLang: "zh-TW",
      messageLang: "en",
      header: { subject: EN.subject, reportSubject: EN.reportSubject, from: "Kate Miller <kate.miller@example.com>", date: "2026/10/13 09:12", labelFrom: "寄件者", labelDate: "日期", reply: "回覆", forward: "轉寄" },
      captions: {
        intro: "每個段落同時交給三個層級翻譯",
        dictionary: "$1：逐詞直譯，立即顯示",
        machine: "$1：取代辭典譯文",
        ai: "$1：產生最終譯文，依 Markdown 格式顯示",
      },
      scenes: {
        images: { steps: ["圖片下詢問", "確認一次", "原文與譯文對照"], say: ["開啟精翻，圖片翻譯選「圖片下詢問」", "點擊後只傳送這一張圖片", "每個服務只確認一次", "只譯圖中的標示"] },
        summary: { steps: ["摘要", "待辦", "複製為 Markdown"], say: ["一封已翻譯的郵件", "向 $1 發出一次請求", "待辦寫明負責人和截止日期", "可直接貼上為 Markdown"] },
        modes: { steps: ["雙語對照", "僅譯文", "原文"], say: ["譯文在每段原文下方", "沿用已有譯文，不發新請求", "立即切回雙語對照", "關閉翻譯，原文原樣恢復"] },
      },
      paragraphs: [
        { text: EN.greeting, dictionary: "喂每個人,", machine: "大家好，", ai: "大家好：" },
        {
          text: EN.feedback,
          dictionary: "感謝為那快的反饋在之上那氣流.我們有工作你的註解在之上那預算進入之內它和上傳那改進的一種描述最後的夜.",
          machine: "感謝您對草稿的快速回饋。我們已將您對預算的意見納入其中，並於昨晚上傳了修訂版本。",
          ai: "感謝各位對草稿的即時回饋。我們已依照大家對預算的意見修改，修訂版昨晚已經上傳。",
        },
        {
          text: EN.list,
          dictionary: "請發送我被星期五,十月23:\n-那期末考試代價崩潰\n-那滑為那時間軸",
          machine: "請在 10 月 23 日星期五之前寄給我：\n- 最終成本明細\n- 時程表投影片",
          ai: "請在**10月23日（週五）前**寄給我：\n- 最終費用明細\n- 時程安排的投影片",
        },
        { text: EN.closing, dictionary: "最好的問候,\n凱特", machine: "此致，\n凱特", ai: "祝好\nKate" },
      ],
      meeting: { text: EN.meeting, ai: "評審本身我想安排在10月27日（週二）下午3點。週一我在漢堡參加展覽，不方便聯絡。" },
      summary: {
        summary: ["Kate 已上傳依預算意見修改後的草稿。她請你在週五前寄來最終費用明細和時程安排的投影片，並提議週二下午進行評審。"],
        actions: [
          { who: "me", task: "把最終費用明細和時程安排的投影片寄給 Kate", due: "2026-10-23", dueText: "週五", quote: "Please send me by Friday, October 23" },
          { who: "me", task: "告訴 Kate 週二下午3點是否適合評審", due: "", dueText: "", quote: "I would like to hold the review itself on Tuesday, October 27, at 3 pm." },
        ],
        questions: [{ from: "Kate Miller", question: "10月27日（週二）下午3點進行評審是否合適？" }],
        dates: [
          { what: "費用明細和投影片的截止日期", when: "2026-10-23", where: "" },
          { what: "Northlight 專案評審", when: "2026-10-27 15:00", where: "" },
          { what: "Kate 參加展覽，不方便聯絡", when: "2026-10-26", where: "漢堡" },
        ],
      },
      report: {
        chart: chart("en"),
        paragraphs: [
          { text: EN.reportBody, ai: "Jonas，這是週四董事會要用的圖表，能幫忙檢查一下圖上的標示嗎？" },
          { text: EN.reportClosing, ai: "謝謝，祝好\nKate" },
        ],
        table: table("en", ["2026 年各銷售通路營收", "營收（百萬歐元）", "季度", "網路商店", "門市", "批發", "預測"]),
      },
    },
  }
})()
