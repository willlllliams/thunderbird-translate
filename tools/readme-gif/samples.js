// The sample messages of the README animations (record.mjs), one per variant: a made-up email with made-up names
// and example.com addresses, the translation each tier gives for every paragraph, and the words of the caption line.
// The dictionary lines are the output of the real dictionary tier (translateText() of src/offline/dictionary) with the
// packs dict-de-en and dict-en-zh-Hans of the release dicts-v1; the zh-TW line is that output in traditional characters.
// Caption texts: $1 stands for the service of the tier as the popup names it.
;(() => {
  const DE = {
    greeting: "Hallo zusammen,",
    feedback:
      "vielen Dank für die schnelle Rückmeldung zum Entwurf. Wir haben die Anmerkungen zum Budget eingearbeitet und die überarbeitete Fassung gestern Abend hochgeladen.",
    meeting: "Könnten wir die Abnahme auf Donnerstag, 15 Uhr, verschieben? Am Mittwoch bin ich auf einer Messe in Hamburg und nur eingeschränkt erreichbar.",
    closing: "Viele Grüße\nKatrin",
  }
  const EN = {
    greeting: "Hi everyone,",
    feedback: "Thanks for the quick feedback on the draft. We have worked your comments on the budget into it and uploaded the revised version last night.",
    meeting: "Could we move the review meeting to Thursday afternoon? On Wednesday I will be at a trade fair in Hamburg and hard to reach.",
    closing: "Best regards,\nKate",
  }

  globalThis.README_GIF_SAMPLES = {
    en: {
      locale: "en",
      uiTag: "en-US",
      targetLang: "en",
      messageLang: "de",
      header: { subject: "Projekt Nordlicht – Termin für die Abnahme", from: "Katrin Vogel <katrin.vogel@example.com>", date: "Tue, 13 Oct 2026 09:12", labelFrom: "From", labelDate: "Date", reply: "Reply", forward: "Forward" },
      captions: {
        intro: "Every paragraph goes to three tiers at the same time",
        dictionary: "$1: word for word, right away",
        machine: "$1 replaces the dictionary text",
        ai: "$1 writes the final translation",
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
          text: DE.meeting,
          dictionary: "be able we the Abnahme on Thursday, 15 hours, move? on Wednesday be I on one fair in Hamburg and only restricted reachable.",
          machine: "Could we postpone the acceptance to Thursday, 3 p.m.? On Wednesday I am at a trade fair in Hamburg and only available to a limited extent.",
          ai: "Could we move the sign-off meeting to Thursday at 3 pm? On Wednesday I am at a trade fair in Hamburg and hard to reach.",
        },
        { text: DE.closing, dictionary: "much greeting\nKatrin", machine: "Best regards\nKatrin", ai: "Best regards,\nKatrin" },
      ],
    },
    "zh-CN": {
      locale: "zh_CN",
      uiTag: "zh-CN",
      targetLang: "zh-CN",
      messageLang: "en",
      header: { subject: "Project Northlight – moving the review", from: "Kate Miller <kate.miller@example.com>", date: "2026/10/13 09:12", labelFrom: "发件人", labelDate: "日期", reply: "回复", forward: "转发" },
      captions: {
        intro: "每个段落同时交给三个层级翻译",
        dictionary: "$1：逐词直译，立即显示",
        machine: "$1：替换词典译文",
        ai: "$1：给出最终译文",
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
          text: EN.meeting,
          dictionary: "可以我们移动那检讨会议到星期四午后?在之上星期三我意志是在一个贸易展览会在期间汉堡和坚硬的到伸出.",
          machine: "我们可以将审核会议改到星期四下午吗？星期三我将在汉堡参加贸易展览会，很难联系到我。",
          ai: "评审会能否改到周四下午？周三我在汉堡参加展会，不太方便联系。",
        },
        { text: EN.closing, dictionary: "最好的问候,\n凯特", machine: "此致，\n凯特", ai: "祝好\nKate" },
      ],
    },
    "zh-TW": {
      locale: "zh_TW",
      uiTag: "zh-TW",
      targetLang: "zh-TW",
      messageLang: "en",
      header: { subject: "Project Northlight – moving the review", from: "Kate Miller <kate.miller@example.com>", date: "2026/10/13 09:12", labelFrom: "寄件者", labelDate: "日期", reply: "回覆", forward: "轉寄" },
      captions: {
        intro: "每個段落同時交給三個層級翻譯",
        dictionary: "$1：逐詞直譯，立即顯示",
        machine: "$1：取代辭典譯文",
        ai: "$1：產生最終譯文",
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
          text: EN.meeting,
          dictionary: "可以我們移動那檢討會議到星期四午後?在之上星期三我意志是在一個貿易展覽會在期間漢堡和堅硬的到伸出.",
          machine: "我們可以將審核會議改到星期四下午嗎？星期三我將在漢堡參加貿易展覽會，很難聯絡到我。",
          ai: "評審會議能否改到週四下午？週三我在漢堡參加展覽，不太方便聯絡。",
        },
        { text: EN.closing, dictionary: "最好的問候,\n凱特", machine: "此致，\n凱特", ai: "祝好\nKate" },
      ],
    },
  }
})()
