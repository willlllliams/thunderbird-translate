# Thunderbird 邮件翻译

[English](../README.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird 邮件翻译（Thunderbird Translate）是一个 Thunderbird 扩展，在阅读窗格里直接翻译邮件正文。译文可以放在每段原文下方（双语对照），也可以替换原文（仅译文），取消翻译后邮件恢复成原样。默认使用免费的谷歌翻译，装好即可使用；也可以接入 OpenAI、Claude、Gemini、DeepSeek、通义千问等 22 个 AI 服务商。

本文写给第一次接触 Thunderbird 扩展的读者，按“装上、用起来、按需配置、了解原理”的顺序展开。

![演示：翻译邮件、切换双语与仅译文、更换目标语言](../docs/demo.gif)

## 功能

- 翻译正文：识别邮件正文中的段落级内容，包括段落、列表项、表格单元格、标题、引用块、只含文字的 div，以及纯文本邮件中以空行分隔的段落。代码、已是目标语言的段落、纯数字、纯链接和空白内容会被跳过。
- 两种显示方式：双语对照在原文下方插入带淡色左边框的译文块，深色主题下同样可读；仅译文用译文替换原文，原文保存在内存中，取消翻译时原样放回。
- 翻译过程中切换显示方式或目标语言，页面会自动重新渲染，不需要重新打开邮件。切换显示方式只用已有译文重绘，不产生新请求。
- 入口：邮件头部工具栏的“翻译邮件”按钮和弹出面板，快捷键 Alt+A（翻译 / 显示原文）和 Alt+S（切换双语 / 仅译文）。
- 可选的自动翻译：打开非目标语言的邮件时自动开始翻译。
- 请求批处理：后台在 50 毫秒窗口内收集段落，合并成一次请求；附带并发限制、失败重试、指数退避和本地缓存。
- 服务商：3 个免费或自建的翻译服务，22 个 AI 服务商预设，其中一个是“自定义 OpenAI 兼容”。各处的服务列表只列出已添加的服务。
- 竞速翻译（AI 服务）：免费翻译服务先给出临时译文，AI 译文到达后替换。
- 精翻（AI 服务）：每次请求都以整封邮件为上下文，人名、术语和称谓在各段之间保持一致。
- 每个 AI 服务商各有一个思考模式开关，默认关闭。
- 界面支持 12 种语言。界面语言默认跟随 Thunderbird，也可以在设置页指定。

## 安装

### 从 Releases 安装

1. 在本仓库的 Releases 页面下载最新的 `thunderbird-translate-<版本号>.xpi`。
2. 打开 Thunderbird，进入“工具 → 附加组件和主题”（也可以从右上角 ≡ 菜单进入）。
3. 点击扩展列表上方的齿轮图标，选择“从文件安装附加组件”，选中下载的 xpi 文件，确认安装。

扩展要求 Thunderbird 128 或更新版本。

### 从源码构建

需要 Node.js 22 或更新版本（开发时使用 Node 24、npm 11）。

```bash
npm ci
npm test
npm run build
```

`npm run build` 用 esbuild 把后台脚本、内容脚本、弹出面板和设置页分别打包到 `dist/`，由 `locales/` 中的文件生成 `dist/_locales/<语言>/messages.json`，再把 `dist/` 压缩成 `web-ext-artifacts/thunderbird-translate-<版本号>.xpi`。压缩用的是纯 JavaScript 的 fflate 库，不依赖系统里的 zip 命令。

开发调试时可以不打包安装：在 Thunderbird 中打开“工具 → 开发者工具 → 调试附加组件”，点击“临时载入附加组件”，选择 `dist/manifest.json`。

## 使用

打开一封邮件，邮件头部工具栏会出现“翻译邮件”按钮。点击它会弹出面板，面板中有以下控件：

- “翻译此邮件”按钮：开始翻译；翻译进行中或完成后，按钮变为“显示原文”，点击即恢复原文。
- 显示方式：在双语对照和仅译文之间切换，对当前邮件立即生效。
- 目标语言：改动后，正在翻译的邮件会按新语言重新翻译。
- 翻译服务：选择当前使用的服务商，列表里只有已添加的服务。下方的“+ 添加翻译服务”打开设置页并定位到“翻译服务”分组。
- 竞速翻译、精翻：当前服务是 AI 服务时显示，用来开关这两种 AI 翻译模式。
- 自动翻译非目标语言的邮件：勾选后，打开邮件时如果正文不是目标语言，会自动开始翻译。

面板下方显示翻译进度，例如“已翻译 8 / 12”。开启竞速翻译时，仍显示临时译文的段落单独计数，例如“已翻译 7 / 9（2 段为临时译文）”。某段翻译失败时，原文后会出现红色的“翻译失败，点击重试”，鼠标悬停可以看到错误原因，点击即重试这一段。

快捷键 Alt+A 翻译当前邮件或恢复原文，Alt+S 在双语和仅译文之间切换。快捷键可以在附加组件管理器的齿轮菜单“管理扩展快捷键”中修改。

在仅译文模式下，把鼠标停在译文上，提示框会显示对应的原文。

## 设置

在附加组件管理器中点击本扩展的“选项”打开设置页。设置自动保存，右上角出现“已保存”即表示已写入。

| 分组 | 内容 |
| --- | --- |
| 常规 | 界面语言、目标语言、默认显示方式、当前服务、自动翻译 |
| 翻译服务 | 服务分“已添加”和“可添加”两组；每个服务商的接口地址、API 密钥、模型、温度、思考模式；“测试连接”“添加”“设为当前服务”“移除”按钮 |
| AI 翻译模式 | 竞速翻译及其快速服务、精翻 |
| 系统提示词 | 自定义 AI 服务的系统提示词，`{{to}}` 会替换为目标语言名称；留空使用内置提示词 |
| 请求批处理 | 收集窗口、每次请求最大字符数和段落数、并发数、重试次数、是否合并 AI 请求 |
| 译文样式 | 左侧竖线、左侧虚线、底色高亮或无装饰；强调色、文字不透明度、字号比例；附带实时预览 |
| 缓存 | 是否缓存、最多缓存段落数、当前缓存条数、清除缓存 |

“测试连接”用输入框中的当前值发送一句测试文本，成功时显示译文，失败时显示服务商返回的错误，例如密钥无效或模型名称不存在。

## 添加与移除服务

“翻译服务”分组左侧的列表分为两组。“已添加”组里的服务出现在弹出面板和设置页的服务列表中，其余服务在“可添加”组里。选中一个服务后，右侧显示它的配置和按钮：

- 未添加的服务有“添加”按钮。填入 API 密钥（DeepLX 为接口地址）也会自动添加该服务。
- 已添加的服务有“设为当前服务”和“移除”按钮。移除只把服务移出列表，已填的配置保留，再次添加时密钥和模型仍在。
- 当前服务不能移除；开启竞速翻译时，被选作快速服务的服务也不能移除。这两种情况下“移除”按钮不可点，按钮下方写明原因。

新安装时，谷歌翻译和微软翻译处于已添加状态。读取 1.1 及更早版本保存的设置时，按下表判断一个服务是否已添加：

| 服务 | 视为已添加的条件 |
| --- | --- |
| 谷歌翻译、微软翻译 | 始终 |
| DeepLX | 已填写接口地址 |
| 需要密钥的 AI 服务 | 已保存 API 密钥 |
| Ollama、LM Studio、自定义 OpenAI 兼容 | 接口地址、模型或温度被改过 |
| 当前服务 | 始终 |

## AI 翻译模式

两种模式只在当前服务为 AI 服务时生效，可以在设置页的“AI 翻译模式”分组或弹出面板中开关。

### 竞速翻译

每个段落同时发给 AI 服务和一个快速服务。快速服务默认是谷歌翻译，也可以在已添加的服务中改选微软翻译或 DeepLX。两路请求各自走原有的批处理和缓存，页面按先到的结果显示：

| 情况 | 邮件中显示的内容 |
| --- | --- |
| 快速服务先返回 | 快速服务的译文，斜体并带“临时译文”标签，悬停提示“AI 译文生成中”；AI 译文到达后替换它 |
| AI 服务先返回 | AI 译文，快速服务的结果丢弃 |
| AI 请求失败 | 保留快速服务的译文，标记“AI 翻译失败”；悬停显示失败原因，点击重试这一段 |
| AI 译文已在缓存中 | 缓存的 AI 译文，不请求快速服务 |

切换显示方式时，临时译文和失败标记照常保留；“显示原文”会把它们和译文一起移除。竞速翻译不增加 AI 的 token 用量，但快速服务的请求数会翻倍。

### 精翻

精翻让每次 AI 请求都带上整封邮件作为上下文。开始翻译时，内容脚本按顺序拼接已识别的段落，得到邮件正文的纯文本（超过 20000 字符时截断，并注明后文未列出），向后台登记一次。邮件以这段文本的哈希值标识。

翻译流程取决于待翻译段落的总量：

1. 待翻译段落能放进一次请求（不超过“每次请求最大字符数”和“每次请求最大段落数”）时，一次请求翻译全部段落，这次请求本身就包含了整封邮件。
2. 放不下时，先多发一次请求分析全文，要求返回三项内容：2 到 3 句话的摘要；人名、产品名等专有名词及其统一译法组成的术语表；语气和称谓建议。返回内容无法解析时，不使用分析结果，翻译照常进行。
3. 之后每次请求都以同一段前缀开头：系统提示词、分析结果，以及全文（全文不超过约 8000 字符时）。前缀之后是本批段落，每段前后各附一个相邻段落作为参考，并注明参考段落不翻译。

同一封邮件的所有请求，前缀逐字相同，支持前缀缓存的服务商可以直接命中缓存。Anthropic 需要显式标记，扩展为前缀加上 `cacheControl: { type: "ephemeral" }`。分析结果与译文存放在同一个缓存中，缓存键由服务商、模型、目标语言和全文哈希组成；同一封邮件的多个批次共用一次分析请求。

精翻得到的译文，缓存键中包含邮件哈希；批处理也按邮件分组，不同邮件的段落不会进入同一次请求。因此同一句话出现在另一封邮件里时，会结合那封邮件重新翻译。分析请求和更长的提示词让精翻的费用高于普通翻译。

## 界面语言

设置页“常规”分组中的“界面语言”有两类取值：

- 跟随 Thunderbird（默认）：扩展选用与 Thunderbird 界面语言最接近的受支持语言。选项文字会标出当前实际使用的语言，例如“跟随 Thunderbird（Deutsch）”。
- 12 种受支持语言之一：扩展固定使用这种语言，与 Thunderbird 的语言无关。

这一设置作用于弹出面板、设置页、邮件中的提示文字（“翻译中…”“翻译失败，点击重试”）、错误信息、测试连接的结果，以及工具栏按钮的悬停提示。已打开的设置页和弹出面板会立即换成新语言。已经翻译过的邮件里，提示文字在下一次绘制时换成新语言。

有两处文字由 Thunderbird 直接从扩展的 manifest 读取，始终跟随 Thunderbird 的界面语言：

- 附加组件管理器中的扩展名称和扩展说明；
- “管理扩展快捷键”中的快捷键说明。

设置页在“界面语言”选项下方注明了这一点。

选择“跟随 Thunderbird”时，Thunderbird 的语言按下表对应到受支持语言：

| Thunderbird 的语言 | 扩展使用的界面语言 |
| --- | --- |
| `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant` | 繁体中文 |
| 其他 `zh-*` | 简体中文 |
| `pt-*` | 葡萄牙语（巴西） |
| `en-*`、`ja`、`ko`、`fr-*`、`de-*`、`es-*`、`ru`、`tr`、`vi` | 主语言标签相同的语言 |
| 其他语言 | 英语 |

目标语言下拉框中的语言名按当前界面语言显示，括号里附上该语言的自称，例如界面为中文时显示“日语（日本語）”。发给 AI 服务的提示词始终使用英文语言名，因为模型对英文指令的遵循最稳定。

首次安装时，目标语言按界面语言设定：日语界面的 Thunderbird 默认目标语言为日语，英语界面默认为英语。已经保存过的目标语言不会被覆盖。

## 支持的界面语言

| 代码 | 语言 |
| --- | --- |
| `en` | English（英语） |
| `zh_CN` | 简体中文 |
| `zh_TW` | 繁體中文（繁体中文） |
| `ja` | 日本語（日语） |
| `ko` | 한국어（韩语） |
| `fr` | Français（法语） |
| `de` | Deutsch（德语） |
| `es` | Español（西班牙语） |
| `pt_BR` | Português (Brasil)（葡萄牙语，巴西） |
| `ru` | Русский（俄语） |
| `tr` | Türkçe（土耳其语） |
| `vi` | Tiếng Việt（越南语） |

目标语言列表与界面语言相互独立，共 20 种，其中还包括意大利语、乌克兰语、波兰语、荷兰语、泰语、印尼语、阿拉伯语和印地语。

## 服务商配置

### 免费与自建服务

| 服务 | 是否需要配置 | 说明 |
| --- | --- | --- |
| Google 翻译（免费，默认） | 否 | 调用 `translate.googleapis.com` 的 `client=gtx` 接口，一次 POST 携带多个 `q` 参数，多段合并为一次请求 |
| 微软翻译（免费） | 否 | 先尝试 `edge.microsoft.com/translate/auth` 取令牌后调用 `api-edge.cognitive.microsofttranslator.com`；该令牌接口已被微软下线时，自动改用 `edge.microsoft.com/translate/translatetext`。两条路径都原生支持数组批量 |
| DeepLX | 需要填写接口地址 | 自建或第三方的 DeepLX 服务；令牌可选。地址中含 `{{apiKey}}` 时用令牌替换该占位符，否则以 `Authorization: Bearer` 发送 |

### AI 服务商

所有 AI 服务商都通过 Vercel AI SDK 的 `generateText` 调用。有官方 `@ai-sdk/*` 包的服务商使用官方包，其余使用 `@ai-sdk/openai-compatible`。每个服务商都可以改接口地址、API 密钥、模型和温度，模型输入框提供常用模型的下拉建议，也可以直接填写任意模型名。

| 服务商 | SDK 包 | 默认接口地址 | 默认模型 | 需要密钥 |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | 是 |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | 是 |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | 是 |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | 是 |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | 是 |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | 是 |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | 是 |
| Ollama（本地） | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | 否 |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | 是 |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 是 |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | 是 |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 是 |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | 是 |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | 是 |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | 是 |
| 智谱 GLM | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | 是 |
| 通义千问 / 阿里云百炼 | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 是 |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | 是 |
| 火山引擎豆包 | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | 是 |
| Azure OpenAI | `@ai-sdk/azure` | 需自填 | `gpt-4.1-mini` | 是 |
| LM Studio（本地） | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | 否 |
| 自定义 OpenAI 兼容 | `@ai-sdk/openai-compatible` | 需自填 | 需自填 | 否 |

几个服务商有额外要求：

- Anthropic Claude：扩展在请求中附加 `anthropic-dangerous-direct-browser-access: true` 头，这是 Anthropic 接受浏览器环境直连的条件。Claude 5 系列和 Opus 4.7、4.8 不接受自定义温度，扩展对这些模型不发送温度参数，默认模型的温度一栏因此留空。
- Azure OpenAI：接口地址填 `https://<资源名>.openai.azure.com/openai`，模型填部署名称。
- Ollama：Ollama 默认拒绝来自扩展页面的跨源请求，需要以环境变量 `OLLAMA_ORIGINS=moz-extension://*` 启动 Ollama。
- Moonshot：默认地址是国内站 `api.moonshot.cn`，国际站账号改为 `https://api.moonshot.ai/v1`。
- 火山引擎豆包：模型一栏可以填模型名，也可以填方舟控制台中创建的推理接入点 ID。

### 思考模式

每个 AI 服务商的配置里有“思考模式”开关，默认关闭。翻译不需要模型先推理，推理会让请求变慢、费用变高。`deepseek-flash`、`claude-haiku-5-5`、`gemini-2.5-flash` 等模型默认会思考，所以关闭时扩展会显式发送关闭参数。

各服务商控制思考的参数各不相同，同一服务商下也只有部分模型接受。扩展用下表中的模式匹配模型名，发送第一条匹配规则对应的参数；没有匹配的模型不发送任何思考参数。开启思考时不发送温度，因为推理模型会忽略或拒绝温度参数。

| 服务商 | 模型 | 关闭 | 开启 | 来源 |
| --- | --- | --- | --- | --- |
| OpenAI、Azure OpenAI | `gpt-5.1` 及更新 | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI 推理指南](https://developers.openai.com/api/docs/guides/reasoning) |
| | `gpt-5`、`gpt-5-mini`、`gpt-5-nano` | `"minimal"` | `"medium"` | 同上 |
| | `o1`、`o3`、`o4-mini` 等 | `"low"`（无法完全关闭） | `"medium"` | 同上 |
| Anthropic | Claude 5 系列、Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
| | Claude 3.7 与 4.x | 不发送（默认不思考） | `{ type: "enabled", budgetTokens: 1024 }` | 同上 |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }`（最小值，无法关闭） | `{ thinkingBudget: -1 }` | [Gemini 思考](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
| | 其他 `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | 同上 |
| | Gemini 3 及更新 | `{ thinkingLevel: "low" }`（无法完全关闭） | `{ thinkingLevel: "high" }` | 同上 |
| DeepSeek | 全部 | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [思考模式](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI 推理](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
| | `grok-3-mini` | `"low"` | `"high"` | 同上 |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"`，并设 `reasoningFormat: "parsed"` | [Groq 推理](https://console.groq.com/docs/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | 同上 |
| Mistral AI | 全部（SDK 只对支持的模型发送） | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral 推理](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3、GLM-4/5、DeepSeek V4、Kimi K3、MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together 推理](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4、GLM、Kimi K3、Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks 推理](https://docs.fireworks.ai/guides/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | 同上 |
| DeepInfra | 全部（无推理能力的模型忽略该参数） | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra 推理](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras 推理](https://inference-docs.cerebras.ai/capabilities/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | 同上 |
| Moonshot / Kimi | `kimi-k2.5`、`kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi 思考模型](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
| | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | 同上 |
| 通义千问 / 阿里云百炼 | Qwen3、`qwen-plus`、`qwen-flash`、`qwen-turbo` | `alibaba.enableThinking: false` | `true` | [深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | 全部 | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI 兼容接口](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | 必然推理的模型（`o*`、`gpt-5`、`gpt-oss`、`grok-4`、Claude Opus 5、Gemini 2.5 Pro 与 3） | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| | 其余模型（无推理能力的模型忽略该参数） | `{ enabled: false }` | `{ enabled: true }` | 同上 |
| 智谱 GLM | GLM-4.5 及更新 | `zhipu.thinking: { type: "disabled" }`；GLM-5.3 拒绝该值，不发送 | `{ type: "enabled" }` | [深度思考](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| 硅基流动 SiliconFlow | Qwen3、DeepSeek V3.1/3.2/V4、GLM-4.5 及更新、Hunyuan-A13B、Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat Completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| 火山引擎豆包 | Seed 系列与 thinking 模型 | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [方舟文档](https://www.volcengine.com/docs/82379) |

Perplexity、LM Studio 和自定义 OpenAI 兼容服务在扩展所用的接口上没有公开的思考参数，它们的开关显示为不可用，设置页注明“该服务商不支持控制思考”。

Ollama、OpenRouter、智谱、硅基流动、豆包属于 OpenAI 兼容预设，参数写在以预设 ID 命名的选项下，`@ai-sdk/openai-compatible` 会把这些键原样写入请求体；其中只有 `reasoningEffort` 会被改写为 `reasoning_effort`。

## 批处理原理

一封邮件通常有十几到几十个段落。逐段请求时，每段都要单独发送一次系统提示词和翻译指令，并单独占用一次请求配额。批处理把短时间内到达的段落合并成一次请求，这两项开销随之改为每批计一次。

### 流程

1. 内容脚本把每个待翻译段落交给后台。
2. 后台先查缓存，命中则直接返回。缓存键由服务商、模型、目标语言、系统提示词签名、段落文本的哈希组成，精翻时还包含邮件的哈希。相同文本正在翻译时，后来的请求共用同一个结果。
3. 未命中的段落进入批处理队列，按“服务商 + 模型 + 接口地址 + 目标语言”分组，精翻时再按邮件分组。同一组的段落在 50 毫秒窗口内累积；窗口结束、段落数达到上限或字符数将超过上限时，这一组立即发出。单段超过字符上限时单独成批。
4. 每一批交给请求队列执行。请求队列限制并发数，遇到 429、5xx 或网络错误时按指数退避重试，服务端给出 `Retry-After` 时按它等待。401、400 这类错误直接报告，不重试。
5. 结果写入内存缓存，并在 1 秒后合并写入 `storage.local`。缓存按最近最少使用（LRU）淘汰。

### 各类服务的合并方式

- Google：一次 POST 带多个 `q` 参数，返回数组与输入一一对应。
- 微软：请求体本身就是数组。
- DeepLX：接口一次只接受一段，批内各段并发请求。
- AI 服务商：各段编号后放入一条消息，要求模型返回长度相同的 JSON 数组。解析器依次尝试 JSON 数组（可带代码块或前后说明文字，会修复字符串中的裸换行和多余逗号）、带编号的 `<seg>` 块、编号行、`%%` 分隔符。全部失败或条数不符时，这一批改为逐段请求，用户看到的结果不受影响。认证失败等非解析错误不做逐段回退，避免同样的错误重复 N 次。

### 开销估算

设系统提示词和指令共 $s$ 个 token，每段平均 $t$ 个 token，共 $N$ 段，批大小为 $B$，每段编号与 JSON 引号的额外开销为 $c$ 个 token。

逐段请求的输入 token 总量为

$$
I_{\text{逐段}} = N(s + t).
$$

批处理时共有 $\lceil N/B \rceil$ 次请求，输入 token 总量为

$$
I_{\text{批}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

两者之差为

$$
I_{\text{逐段}} - I_{\text{批}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

只要 $s$ 明显大于 $c$，批越大节省越多。以 $s = 150$、$t = 60$、$c = 10$、$N = 20$、$B = 30$ 为例：

$$
I_{\text{逐段}} = 20 \times 210 = 4200, \qquad I_{\text{批}} = 150 + 20 \times 70 = 1550.
$$

输入 token 减少约 63%，请求次数从 20 次降为 1 次。输出 token 两种方式基本相同，因为译文本身的长度不变。请求次数的减少对免费接口同样重要：谷歌和微软的免费接口按请求频率限流，一封 20 段的邮件只占一次请求。

## 隐私

- API 密钥只保存在当前 Thunderbird 配置文件的 `storage.local` 中，只随请求发送到对应服务商的接口地址。
- 内容脚本运行在邮件页面里，它从后台拿到的设置不包含任何密钥。
- 邮件正文只发送给当前选中的翻译服务；开启竞速翻译时，也发送给所选的快速服务。扩展不收集统计数据，不访问这些服务之外的网络地址。
- 译文缓存保存在本地，可以在设置页关闭或清除。
- 邮件内容会离开本机，发往所选的翻译服务。处理敏感邮件时，可以使用 Ollama 或 LM Studio 这类本地模型，此时请求只到达本机。

## 已知限制

- 译文以纯文本呈现。原文中的链接、加粗等行内格式在译文里不保留；双语模式下原文仍完整可用，仅译文模式下可悬停查看原文或切回双语。
- 谷歌和微软的免费接口没有公开文档，接口可能变化或限流。微软的令牌接口 `edge.microsoft.com/translate/auth` 已于 2026 年 7 月下线（返回 404），扩展首次请求时仍尝试令牌接口，失败后改走直连接口，并在一小时内不再尝试令牌接口。
- 判断段落是否已是目标语言时，中日韩等文字按字符类别判断，拉丁字母语言优先调用扩展 API 的 i18n.detectLanguage；该接口不可用或结果不可靠时，只对英文有可靠的判断，其他拉丁字母语言的段落会照常发送翻译。
- 内容脚本通过 `messageDisplayScripts` 注册，只作用于注册之后打开的邮件。扩展启动时会尝试为已打开的邮件补充注入；补充注入失败时，重新点选一次邮件即可。
- 扩展自身产生的错误信息已翻译。翻译服务或 AI SDK 返回的错误文字（例如 HTTP 401 响应的正文）按原样显示，通常是英文。
- 扩展名称、附加组件管理器中的扩展说明和快捷键说明跟随 Thunderbird 的界面语言，不受“界面语言”选项控制。
- 精翻用正文文本的哈希标识邮件，因为内容脚本拿不到邮件 ID。正文完全相同的两封邮件共用译文和分析结果。
- 前缀缓存由服务商决定是否生效。Anthropic 只缓存长度达到模型下限的前缀，较短的前缀按普通输入计费。
- 思考模式开关按模型名匹配。名称不符合任何规则的新模型不会收到思考参数，需要在 `src/background/providers/thinking.ts` 的表中补充规则。
- 竞速翻译让快速服务的请求数翻倍，会占用谷歌和微软免费接口的频率限额。

## 测试

```bash
npm test               # vitest 单元测试
npm run typecheck      # TypeScript 类型检查
npm run locales:check  # 以 locales/en.json 为基准检查各语言文件
npm run live-test      # 用扩展自身的翻译模块调用真实的谷歌和微软接口
```

单元测试覆盖以下内容：

- 批处理分组与队列；
- AI 输出解析与回退；
- 段落识别，以及双语/仅译文的渲染与恢复（jsdom 环境）；
- 谷歌、微软、DeepLX 的请求构造与响应解析（模拟 fetch）；
- 每个 AI 预设的请求地址与认证头，每个服务商的思考参数；
- 设置迁移到“已添加”状态的规则，弹出面板和设置页只列出已添加服务，移除保护；
- 竞速翻译：快速结果先到后被替换、AI 先到、AI 失败保留快速译文、命中缓存不请求快速服务，以及显示方式切换和恢复原文；
- 精翻：单次请求路径、分析加分批路径、分析失败降级、缓存键包含邮件哈希、不同邮件不混批、同一邮件的提示词前缀逐字相同及 Anthropic 缓存标记；
- 本地化：各语言的键集合与占位符和英文一致，manifest 引用的 `__MSG_*__` 都存在，Thunderbird 语言到受支持语言的映射，缺失键回退到英文，HTML 页面和源码中没有硬编码的界面文字。

`npm run build:debug` 生成调试版 xpi，打开邮件即开始翻译并把进度写入控制台，用于在真实的 Thunderbird 中检查整条流程。

## 目录结构

```
src/
  background/    后台：翻译服务、批处理与请求队列、缓存、服务商工厂、各翻译接口
  content/       内容脚本：段落识别、渲染、语言判断、翻译状态控制
  popup/         弹出面板
  options/       设置页
  shared/        共享的设置、服务商预设、语言表、消息类型、i18n 运行时
locales/         界面文字，每种语言一个 JSON 文件，en.json 为基准
static/          manifest.json、HTML、CSS、SVG 图标
scripts/         构建、语言文件生成与检查、真实接口测试
readmes/         本文档的各语言版本
tests/           vitest 测试
```

## 翻译界面文字

界面文字保存在 `locales/<语言>.json` 中，每个文件是一个“键 → 文字”的扁平对象。`locales/en.json` 是基准，其他文件的键必须与它完全相同。文件内容有三条约定：

- `$1` 到 `$9` 是替换参数，译文中出现的编号必须与英文一致，位置可以按语序调整。
- `{{apiKey}}` 和 `{{to}}` 是字面标记，原样保留。
- Google 翻译、OpenAI、DeepLX 等产品名不翻译。

`npm run build` 把这些文件转换成 Thunderbird 读取的 `dist/_locales/<语言>/messages.json`。扩展自带的 i18n 运行时在运行时加载同一批文件，所以切换界面语言不需要重启 Thunderbird。某个键在当前语言中缺失时，回退到英文。

新增一种语言的步骤：

1. 按 `locales/en.json` 的全部键新建 `locales/<代码>.json`。
2. 在 `src/shared/locales.ts` 的 `SUPPORTED_LOCALES` 中加入该代码，并补上它的自称。
3. 运行 `npm run locales:check` 和 `npm test`。

## 致谢

段落识别、批处理队列、提示词写法和服务商配置的设计参考了 [Read Frog](https://github.com/mengxi-ream/read-frog)，一个以 GPL-3.0 发布的网页翻译浏览器扩展。本项目把这些思路移植到 Thunderbird 的邮件阅读环境，并针对邮件做了调整，例如纯文本邮件的空行分段和硬换行合并。

## 许可证

GPL-3.0-or-later，全文见 [LICENSE](../LICENSE)。
