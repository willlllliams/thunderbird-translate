// Single source for _locales/en and _locales/zh_CN. Run: node scripts/locales-source.mjs
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const M = {
  extensionName: ["Thunderbird Translate", "Thunderbird 邮件翻译"],
  extensionDescription: [
    "Translate email bodies in place: bilingual or translation-only, free Google/Microsoft translators and 20+ AI providers.",
    "在阅读窗格中翻译邮件正文：双语对照或仅译文，支持免费的谷歌/微软翻译与 20 多个 AI 服务商。",
  ],
  actionTitle: ["Translate message", "翻译邮件"],
  commandToggle: ["Translate / show original", "翻译 / 显示原文"],
  commandMode: ["Switch bilingual / translation-only", "切换双语 / 仅译文"],
  badgeOn: ["ON", "译"],
  statusTranslating: ["Translating…", "翻译中…"],
  statusFailed: ["Translation failed, click to retry", "翻译失败，点击重试"],

  popupTranslate: ["Translate this message", "翻译此邮件"],
  popupShowOriginal: ["Show original", "显示原文"],
  popupNotConnected: ["No message content available. Reopen the message and try again.", "未连接到邮件内容。请重新打开邮件后再试。"],
  popupProgress: ["Translated $1 of $2", "已翻译 $1 / $2"],
  popupFailed: ["$1 failed", "$1 段失败"],
  popupNothing: ["Nothing to translate: the message is already in the target language.", "没有需要翻译的内容：邮件已是目标语言。"],
  popupIdle: ["Not translated", "未翻译"],
  labelMode: ["Display", "显示方式"],
  modeBilingual: ["Bilingual", "双语对照"],
  modeTranslationOnly: ["Translation only", "仅译文"],
  labelTargetLang: ["Target language", "目标语言"],
  labelProvider: ["Translation service", "翻译服务"],
  labelAutoTranslate: ["Automatically translate messages not in the target language", "自动翻译非目标语言的邮件"],
  popupSettings: ["Settings", "设置"],
  popupShortcuts: ["Shortcuts: Alt+A translate, Alt+S switch display", "快捷键：Alt+A 翻译，Alt+S 切换显示方式"],

  optionsTitle: ["Thunderbird Translate settings", "Thunderbird 邮件翻译设置"],
  sectionGeneral: ["General", "常规"],
  sectionProviders: ["Translation services", "翻译服务"],
  sectionPrompt: ["System prompt (AI services)", "系统提示词（AI 服务）"],
  sectionBatch: ["Request batching", "请求批处理"],
  sectionStyle: ["Translation style", "译文样式"],
  sectionCache: ["Cache", "缓存"],
  labelDefaultMode: ["Display mode", "显示方式"],
  labelActiveProvider: ["Current service", "当前服务"],
  providerActive: ["Current", "当前"],
  providerConfigured: ["Configured", "已配置"],
  labelApiKey: ["API key", "API 密钥"],
  labelDeeplxToken: ["Access token (optional)", "访问令牌（可选）"],
  labelBaseURL: ["API endpoint (base URL)", "接口地址（Base URL）"],
  labelDeeplxURL: ["DeepLX endpoint", "DeepLX 接口地址"],
  labelModel: ["Model", "模型"],
  labelTemperature: ["Temperature (empty = provider default)", "温度（留空则使用服务商默认值）"],
  hintKeyLocal: ["The key is stored only in this Thunderbird profile (storage.local) and is sent only to this service's endpoint.", "密钥只保存在当前 Thunderbird 配置文件（storage.local）中，只发送给该服务的接口地址。"],
  hintFree: ["No configuration needed.", "无需配置。"],
  hintAzure: ["Endpoint like https://<resource>.openai.azure.com/openai; model = deployment name.", "接口地址形如 https://<资源名>.openai.azure.com/openai；模型填写部署名称。"],
  hintOllama: ["Start Ollama with OLLAMA_ORIGINS=moz-extension://* so it accepts requests from Thunderbird.", "需以 OLLAMA_ORIGINS=moz-extension://* 启动 Ollama，否则它会拒绝来自 Thunderbird 的请求。"],
  hintDeeplx: ["If the endpoint contains {{apiKey}}, the token replaces it; otherwise it is sent as a Bearer token.", "接口地址中含 {{apiKey}} 时用令牌替换该占位符，否则以 Bearer 令牌发送。"],
  buttonTest: ["Test connection", "测试连接"],
  buttonUse: ["Use this service", "设为当前服务"],
  buttonShowKey: ["Show", "显示"],
  buttonHideKey: ["Hide", "隐藏"],
  testRunning: ["Testing…", "测试中…"],
  testOk: ["OK: $1", "成功：$1"],
  testFail: ["Failed: $1", "失败：$1"],
  getKey: ["Get a key / docs", "获取密钥 / 文档"],
  promptHint: ["Empty = built-in prompt. {{to}} is replaced by the target language name. Batch instructions are added automatically.", "留空使用内置提示词。{{to}} 会替换为目标语言名称。批处理指令会自动追加。"],
  buttonResetPrompt: ["Restore built-in prompt", "恢复内置提示词"],
  labelBatchDelay: ["Collection window (ms)", "收集窗口（毫秒）"],
  labelMaxChars: ["Max characters per request", "每次请求最大字符数"],
  labelMaxItems: ["Max paragraphs per request", "每次请求最大段落数"],
  labelConcurrency: ["Concurrent requests", "并发请求数"],
  labelRetries: ["Retries (429 / 5xx / network)", "重试次数（429 / 5xx / 网络错误）"],
  labelLlmBatch: ["Merge paragraphs into one AI request", "将多个段落合并为一次 AI 请求"],
  batchHint: ["Free services cap a request at 5000 characters and 100 paragraphs regardless of these values.", "免费服务的单次请求上限固定为 5000 字符、100 段，不受此处设置影响。"],
  labelStylePreset: ["Style", "样式"],
  styleBorder: ["Left border", "左侧竖线"],
  styleDashed: ["Dashed left border", "左侧虚线"],
  styleHighlight: ["Highlight", "底色高亮"],
  stylePlain: ["Plain", "无装饰"],
  labelColor: ["Accent color", "强调色"],
  labelOpacity: ["Text opacity", "文字不透明度"],
  labelFontScale: ["Font size ratio", "字号比例"],
  stylePreviewOriginal: ["The quarterly report is attached. Please review it before Friday.", "The quarterly report is attached. Please review it before Friday."],
  stylePreviewTranslation: ["Le rapport trimestriel est joint. Merci de le relire avant vendredi.", "季度报告已附上，请在周五前审阅。"],
  labelCacheEnabled: ["Cache translations", "缓存译文"],
  labelCacheMax: ["Max cached paragraphs", "最多缓存段落数"],
  cacheCount: ["$1 paragraphs cached", "已缓存 $1 段"],
  buttonClearCache: ["Clear cache", "清除缓存"],
  cacheCleared: ["Cache cleared", "缓存已清除"],
  saved: ["Saved", "已保存"],
}

const placeholders = {
  popupProgress: { 1: "done", 2: "total" },
  popupFailed: { 1: "count" },
  testOk: { 1: "text" },
  testFail: { 1: "error" },
  cacheCount: { 1: "count" },
}

for (const [dir, idx] of [["en", 0], ["zh_CN", 1]]) {
  const out = {}
  for (const [key, values] of Object.entries(M)) {
    let message = values[idx]
    const entry = {}
    if (placeholders[key]) {
      entry.placeholders = {}
      for (const [n, name] of Object.entries(placeholders[key])) {
        message = message.replace(`$${n}`, `$${name.toUpperCase()}$`)
        entry.placeholders[name] = { content: `$${n}` }
      }
    }
    out[key] = { message, ...entry }
  }
  const file = join(root, "static", "_locales", dir, "messages.json")
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)
}
console.log("locales written")
