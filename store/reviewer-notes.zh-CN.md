# 审核员备注（简体中文对照）

本文是 [reviewer-notes.md](reviewer-notes.md) 的中文对照，供开发者核对内容。提交到 ATN 时，“Notes to Reviewers”字段填写英文版。

---

## 测试步骤（不需要账号或密钥）

1. 在测试配置文件中安装 xpi。新手引导会在标签页中打开；点击“退出引导”即可关闭，默认设置可以直接使用。
2. 打开一封非英文邮件，例如正文为这段德语的邮件：“Könnten wir die Abnahme auf Donnerstag, 15 Uhr, verschieben? Am Mittwoch bin ich auf einer Messe in Hamburg.”
3. 按 Alt+A，或点击邮件头工具栏中的“翻译邮件”，再点“翻译此邮件”。文字发往谷歌翻译（默认服务）之前，邮件上方会出现询问面板。点击“允许并翻译”后，英文译文显示在每个段落下方。
4. Alt+S 切换到仅译文；再按 Alt+A 恢复原邮件。工具栏按钮的弹出面板提供同样的开关。邮件标题的译文显示在正文上方的一行中。
5. 文件夹的标题：显示某个文件夹时，点击主工具栏中的“标题翻译”。页面列出各封邮件及其标题译文；点击一行即在邮件标签页中选中这封邮件。
6. 离线翻译：在设置页（附加组件管理器中的“选项”）为第 1 层选择“词典（离线）”，在“词典”部分下载德语 → 英语词典包（2.0 MB，来自本项目的 GitHub Releases），再翻译一次。词典结果先显示，随后被谷歌翻译的结果替换。

AI 服务需要审核员自己的 API 密钥；扩展的其他部分都不依赖 AI 服务。下文所述的摘要和四个需要自有账户的机器翻译服务同样如此。

## 2.3.0 起：使用用户自己密钥的机器翻译服务

DeepL、百度翻译、有道智云和彩云小译属于第 2 层机器翻译，各自需要用户在设置页填写自己账户的密钥；没有密钥时预设不会被添加，也不发送任何内容。密钥保存在 `storage.local` 中，只发给它所属的服务，与 AI 服务的密钥处理相同。请求只发往清单中的固定主机：

| 主机 | 服务 | 请求 |
| --- | --- | --- |
| `api.deepl.com`、`api-free.deepl.com` | DeepL API（Pro 密钥，以及以 `:fx` 结尾的免费计划密钥） | `POST /v2/translate`，请求头 `Authorization: DeepL-Auth-Key <key>`；“测试连接”读取 `GET /v2/usage`（`src/background/translators/deepl.ts`） |
| `fanyi-api.baidu.com` | 百度翻译 | `POST /api/trans/vip/translate`，签名为应用 ID、文本、salt 和密钥拼接后的 MD5（`baidu.ts`） |
| `openapi.youdao.com` | 有道智云 | `POST /v2/api`，用 Web Crypto 计算 SHA-256 签名（`youdao.ts`） |
| `api.interpreter.caiyunai.com` | 彩云小译 | `POST /v1/translator`，请求头 `X-Authorization: token <token>`（`caiyun.ts`） |

Web Crypto 不提供 MD5，所以 `src/shared/md5.ts` 按 RFC 1321 直接实现（48 行，源代码包中未压缩，用 RFC 的测试向量测试），只用于百度请求的签名。扩展在后台脚本中凭主机权限调用 DeepL，不改动任何请求头，不涉及 `webRequest` 权限。

## 2.3.0 起：摘要与待办

弹出面板中的“摘要与待办”把当前显示的邮件（正文最多 20,000 个字符，以及通过 `messageDisplay.getDisplayedMessage()` 读取的发件人、日期和标题）发给摘要所用的 AI 服务；用户没有另选时就是第 3 层的服务。摘要沿用翻译的同意：该服务第一次收到邮件文字之前，邮件上方的面板会询问；没有同意时后台脚本拒绝请求（`src/background/service.ts` 的 `summarize()`）。服务返回 JSON 对象，面板（`src/content/summary.ts`）只用 `createElement` 和文本节点构建。“复制为 Markdown”在用户点击时用 `navigator.clipboard.writeText()` 写入剪贴板，失败时改用 `document.execCommand("copy")`；不申请剪贴板权限。清单中的命令 `summarize` 没有默认快捷键。

用自己的 AI 密钥测试：在设置中为第 3 层选择一个 AI 服务，打开第 2 步的德语邮件，在弹出面板中点击“摘要与待办”，并在面板中允许该服务。邮件上方的面板列出摘要、待办、需要回复的问题和日期。

## 源代码与构建

xpi 中的脚本由 esbuild 打包并压缩，因此随提交附上源代码包。包内的 `SOURCE-BUILD.md` 写明步骤：Node.js 24.21.0 和 npm 11.19.0（Ubuntu 24.04 或 Windows），依次运行 `npm ci`、`npm run build`。产物 `web-ext-artifacts/thunderbird-translate-<version>.xpi` 与提交的 xpi 逐字节相同，可用 `sha256sum` 核对。`npm ci` 之后构建不需要联网：Bergamot 引擎随源代码包提供，构建时按固定的 sha256 校验。源代码包不含测试、文档、端到端测试构建的代码（`src/e2e/`）和实验版的代码（`src/experiments/`，只在 GitHub 发布，使用另一个附加组件 ID），常规构建都不读取这些文件；其中任一目录的文件或 `experiment_apis` 条目进入常规构建时，构建会中止。

## 权限

| 权限 | 用途 |
| --- | --- |
| `messagesRead` | 标题：内容脚本运行在邮件正文中，看不到邮件头，所以后台脚本用 `messageDisplay.getDisplayedMessage()`（`src/background/subject.ts`）读取当前显示邮件的标题，供正文上方的标题译文使用；用户请求摘要时还读取它的发件人和日期。标题翻译页面（`src/subjects/`，即 `browser_action` 的弹出页）用 `mailTabs.getListedMessages()`、`messages.continueList()` 和 `messages.abortList()` 列出邮件标签页中的邮件，并在 `messages.onNewMailReceived`、`onDeleted` 和 `onMoved` 时重新读取列表。只显示发件人、日期和标题；不借此读取邮件正文，也不保存任何内容。 |
| `accountsRead` | 仅用于标题翻译页面：Thunderbird 要求 `mailTabs.setSelectedMessages()`（点击一行即在邮件标签页中显示该邮件）、`mailTabs.onDisplayedFolderChanged`（页面跟随文件夹切换）和上面三个 `messages` 事件具备这项权限。不读取任何账户或文件夹数据。 |
| `messagesModify` | 后台脚本用 `messageDisplayScripts.register()`（`src/background/content-scripts.ts`）在显示的邮件中显示译文，并用 `tabs.executeScript()`/`insertCSS()` 把同一脚本注入扩展启动时已经打开的邮件。Thunderbird 只在有这项权限时允许这两种操作（没有它时 `messenger.messageDisplayScripts` 不存在，已在 Thunderbird 156 中验证）。扩展不修改任何已保存的邮件。 |
| `sensitiveDataUpload` | 显示的邮件文字会发往用户选定的翻译服务；第一次发往每个在线服务之前，用户在邮件上方的面板中确认 |
| `storage` | 设置、翻译缓存和新手引导的状态，保存在 `storage.local` 中（通过 `src/shared/ext.ts` 的封装调用，所以 linter 看不到这些调用） |
| `unlimitedStorage` | IndexedDB 中的离线词典包（每个 0.3 至 3.6 MB）和 Bergamot 模型（每个方向 13 至 48 MB），不能被浏览器清除 |
| 主机权限 | 只列出各服务的固定地址：谷歌翻译、微软翻译的两个地址、DeepL 的两个地址、百度翻译、有道智云和彩云小译（使用用户密钥的机器翻译，见上文）、18 个 AI 预设的默认接口地址、Mozilla Remote Settings 及其附件 CDN（Bergamot 模型），以及 GitHub 和它的两个发布下载主机（词典包）。列表在 `src/shared/hosts.ts` 中，单元测试保证它与清单和预设一致。 |
| 可选的 `http://*/*`、`https://*/*` | 用户填写的接口地址（Ollama、LM Studio、DeepLX、Azure、自定义 OpenAI 兼容服务）。用户点击“授权访问”或“测试连接”时，设置页用 `permissions.request()` 只申请这一个主机；没有权限的主机，后台脚本拒绝发送。 |

2.0 版删除了 `messagesRead`、`tabs` 和 `<all_urls>`；2.1 版为翻译标题重新需要 `messagesRead`，并为标题翻译页面需要 `accountsRead`。`tabs` 和 `<all_urls>` 仍然不用。

## 第三方代码

- 打包进脚本的 npm 包：Vercel AI SDK（`ai` 和各个 `@ai-sdk/*` 服务商包）、`zod` 和 `fzstd`，以及它们的依赖。xpi 中的 `THIRD-PARTY-NOTICES.txt` 列出每个打包进去的包及其版本、许可证和版权声明；构建根据 esbuild 实际读取的文件生成这份清单，缺少任何一个包时构建中止。
- `bergamot-translator.js` 和 `bergamot-translator.wasm.zst`：Mozilla 的 Bergamot 翻译引擎，与 Firefox 和 Thunderbird 自带的文件相同，未作修改（MPL-2.0）。源代码包中的 `VENDOR.md` 声明了这两个文件，来源与哈希值见英文版的表格。

内容安全策略中的 `'wasm-unsafe-eval'` 只用于在 worker 中编译这个随包提供的引擎。扩展自己的脚本不调用 `eval` 或 `Function` 构造器。随包的 zod 库（位于 `chunks/llm-*.js`，与 AI SDK 一起加载）含有用 `Function` 构造器生成函数的代码：一个特性探测、一个可选的对象 schema 编译器，以及没有任何调用方的 `z.compile()`。扩展在创建任何 schema 之前设置 `z.config({ jitless: true })`（见 `src/background/translators/zod-config.ts`），这些代码因此都不会运行；内容安全策略不含 `'unsafe-eval'`，同样会拦截它们。

从 2.2.0 起，AI 译文中的 Markdown 按格式显示。`src/shared/markdown.ts` 用 `createElement`、`createTextNode` 和 `setAttribute` 构建这些内容，从不把译文赋给 `innerHTML`；元素只有 `strong`、`em`、`code`、`del`、`a`、`ul`、`ol`、`li` 和 `br`，链接只在地址以 `http:`、`https:` 或 `mailto:` 开头时才带地址。

## 运行时下载的是数据

扩展不下载任何代码。用户请求时，它下载：

- 词典包：来自本项目 GitHub Releases 的 gzip 压缩制表符分隔词表，存储前按发布索引中的 sha256 校验；
- Bergamot 模型：来自 Mozilla Remote Settings 的 Marian 模型、词表和候选词表文件，与 Firefox 翻译功能使用的文件相同，存储前按 Remote Settings 记录中的 sha256 校验。

两者都只作为数据，由词典查词和随包的引擎读取。

## http://localhost 预设

Ollama 和 LM Studio 是运行在用户自己电脑上的 AI 服务器。它们的预设指向 `http://localhost:11434/v1` 和 `http://localhost:1234/v1`，即回环地址：这些请求不会离开这台电脑，接口地址字段下方也注明了这一点。它们仍然需要用户授予的可选主机权限。其他任何 `http://` 地址都是用户自己填写的。

## webext-linter

用 thunderbird/webext-linter 2.3.2 检查 2.2.0 的 xpi，并用 `--sca-root` 指向解压后的源代码包（审核 schema 为 Thunderbird 158.0.2）。检查结果与用同样方式检查 2.1.0 时相同：unsafe-html 检查没有报告任何问题，2.2.0 新增的 Markdown 渲染也在其中。它把 `messagesRead` 和 `accountsRead` 对应到各自的调用（`messageDisplay.getDisplayedMessage`、`mailTabs.getListedMessages`、`mailTabs.setSelectedMessages`、`mailTabs.onDisplayedFolderChanged`、`messages.continueList`、`messages.abortList` 和三个 `messages` 事件），两项都判为通过。剩余项目与 2.0.0 相同：

- sync-xhr（`bergamot-translator.js` 第 63、70 行）：Mozilla 原版胶水脚本中 Emscripten 文件加载器的两个同步 `XMLHttpRequest`。扩展不会执行到它们：worker 自行读取 wasm，并以 `wasmBinary` 传给 `loadBergamot()`（`src/offline/bergamot/worker.ts`、`worker-core.ts`），胶水脚本因此跳过加载器。这个文件已在 `VENDOR.md` 中声明；在源代码审核模式下，linter 只从源代码包读取 vendoring 声明，所以把 xpi 中的副本当作自写代码扫描。
- 第三方来源无法自动审计（info）：胶水脚本没有发布在 npm 上，来源是 Firefox 仓库的固定提交，sha256 一致。
- 本地化名称（de、es、fr、pt_BR、ru、vi）：“für”“para”“pour”“para”“для”“cho”都是“for”的意思，每个名称都是“<名称> for Thunderbird”的形式。
- 可能未使用的权限 `sensitiveDataUpload`、`storage`、`unlimitedStorage`：见上文“权限”。
- 可能未使用的文件：`bergamot-translator.js` 由 `bergamot-worker.js` 用 `importScripts()` 加载，`bergamot-translator.wasm.zst` 由它用 `fetch()` 读取；`welcome.html`（及 `welcome.css`）是新手引导，安装后以及从弹出面板和设置页通过 `tabs.create()` 打开。
- 针对 `fetch()` 调用的用户数据外传检查：`src/offline/bergamot/manager.ts`（从 Mozilla 读取模型列表和模型文件）和 `src/offline/bergamot/index.ts`（它使用的 fetch）不发送用户数据；`src/offline/bergamot/worker.ts` 和 `src/shared/i18n-ext.ts` 读取扩展自身的文件；`scripts/fetch-bergamot.mjs` 属于构建脚本，只在缺少随包引擎时下载。邮件文字只在用户通过同意面板后发往翻译服务。
- 构建过程审核：只有 `npm ci` 和 `npm run build`；`package.json` 中没有生命周期脚本。
