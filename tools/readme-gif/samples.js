// The sample messages of the README animations (record.mjs), one per variant: a made-up email with made-up names
// and example.com addresses, the translation each tier gives for every paragraph, and the words of the caption line.
// The subject is that of the message header, which the extension does not translate.
// The dictionary lines are the output of the real dictionary tier (translateText() of src/offline/dictionary) with the
// packs dict-de-en and dict-en-zh-Hans of the release dicts-v1; the zh-TW line is that output in traditional characters.
// The AI lines are Markdown, as AI services write it: the content script shows the list and the bold date of the
// third paragraph formatted. The dictionary and Google Translate lines keep the
// "- " in front of the list items as characters, as those services do.
// Caption texts: $1 stands for the service of the tier as the popup names it.
;(() => {
  const DE = {
    subject: "Projekt Nordlicht – Unterlagen für die Abnahme",
    greeting: "Hallo zusammen,",
    feedback:
      "vielen Dank für die schnelle Rückmeldung zum Entwurf. Wir haben die Anmerkungen zum Budget eingearbeitet und die überarbeitete Fassung gestern Abend hochgeladen.",
    list: "Bitte schickt mir bis Freitag, 23. Oktober:\n- die finale Kostenaufstellung\n- die Folien zum Zeitplan",
    closing: "Viele Grüße\nKatrin",
  }
  const EN = {
    subject: "Project Northlight – documents for the review",
    greeting: "Hi everyone,",
    feedback: "Thanks for the quick feedback on the draft. We have worked your comments on the budget into it and uploaded the revised version last night.",
    list: "Please send me by Friday, October 23:\n- the final cost breakdown\n- the slides for the timeline",
    closing: "Best regards,\nKate",
  }

  globalThis.README_GIF_SAMPLES = {
    en: {
      locale: "en",
      uiTag: "en-US",
      targetLang: "en",
      messageLang: "de",
      header: { subject: DE.subject, from: "Katrin Vogel <katrin.vogel@example.com>", date: "Tue, 13 Oct 2026 09:12", labelFrom: "From", labelDate: "Date", reply: "Reply", forward: "Forward" },
      captions: {
        intro: "The paragraphs go to three tiers at once",
        dictionary: "$1: word for word, right away",
        machine: "$1 replaces the dictionary text",
        ai: "$1 writes the final translation in Markdown",
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
    },
    "zh-CN": {
      locale: "zh_CN",
      uiTag: "zh-CN",
      targetLang: "zh-CN",
      messageLang: "en",
      header: { subject: EN.subject, from: "Kate Miller <kate.miller@example.com>", date: "2026/10/13 09:12", labelFrom: "发件人", labelDate: "日期", reply: "回复", forward: "转发" },
      captions: {
        intro: "每个段落同时交给三个层级翻译",
        dictionary: "$1：逐词直译，立即显示",
        machine: "$1：替换词典译文",
        ai: "$1：给出最终译文，按 Markdown 格式显示",
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
    },
    "zh-TW": {
      locale: "zh_TW",
      uiTag: "zh-TW",
      targetLang: "zh-TW",
      messageLang: "en",
      header: { subject: EN.subject, from: "Kate Miller <kate.miller@example.com>", date: "2026/10/13 09:12", labelFrom: "寄件者", labelDate: "日期", reply: "回覆", forward: "轉寄" },
      captions: {
        intro: "每個段落同時交給三個層級翻譯",
        dictionary: "$1：逐詞直譯，立即顯示",
        machine: "$1：取代辭典譯文",
        ai: "$1：產生最終譯文，依 Markdown 格式顯示",
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
    },
  }
})()
