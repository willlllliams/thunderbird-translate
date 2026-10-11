# Thunderbird 郵件翻譯

[English](../README.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird 郵件翻譯（Thunderbird Translate）是一個 Thunderbird 擴充套件，在閱讀窗格中直接翻譯郵件內文。譯文可以放在每段原文下方（雙語對照），也可以取代原文（僅譯文）；取消翻譯後，郵件會恢復原狀。預設使用免費的 Google 翻譯，安裝後即可使用；也可以串接 OpenAI、Claude、Gemini、DeepSeek、通義千問等 22 個 AI 服務商。

本文寫給第一次接觸 Thunderbird 擴充套件的讀者，依「安裝、開始使用、依需求設定、了解原理」的順序說明。

![示範：翻譯郵件、切換雙語與僅譯文、更換目標語言](../docs/demo.gif)

## 功能

- 翻譯內文：辨識郵件內文中段落層級的內容，包括段落、清單項目、表格儲存格、標題、引言區塊、只含文字的 div，以及純文字郵件中以空行分隔的段落。程式碼、已是目標語言的段落、純數字、純連結和空白內容會被略過。
- 兩種顯示方式：雙語對照會在原文下方插入帶淡色左框線的譯文區塊，在深色佈景主題下同樣清楚可讀；僅譯文以譯文取代原文，原文保留在記憶體中，取消翻譯時原樣放回。
- 翻譯過程中切換顯示方式或目標語言，頁面會自動重新繪製，不需要重新開啟郵件。切換顯示方式只用既有譯文重繪，不會發出新的請求。
- 入口：郵件標頭工具列上的「翻譯郵件」按鈕與彈出面板，以及快速鍵 Alt+A（翻譯 / 顯示原文）和 Alt+S（切換雙語對照 / 僅譯文）。
- 可選的自動翻譯：開啟非目標語言的郵件時自動開始翻譯。
- 請求批次處理：背景程式在 50 毫秒的時間窗內收集段落，合併成一次請求；並提供同時請求數限制、失敗重試、指數退避與本機快取。
- 服務商：3 個免費或自架的翻譯服務，22 個 AI 服務商預設組態，其中一個是「自訂 OpenAI 相容服務」。
- 介面支援 12 種語言。介面語言預設跟隨 Thunderbird，也可以在設定頁面中指定。

## 安裝

### 從 Releases 安裝

1. 在本儲存庫的 Releases 頁面下載最新的 `thunderbird-translate-<版本號>.xpi`。
2. 開啟 Thunderbird，進入「工具 → 附加元件與佈景主題」（也可以從右上角的 ≡ 選單進入）。
3. 點擊擴充套件清單上方的齒輪圖示，選擇「從檔案安裝附加元件…」，選取下載的 xpi 檔案，確認安裝。

本擴充套件需要 Thunderbird 128 或更新版本。

### 從原始碼建置

需要 Node.js 22 或更新版本（開發時使用 Node 24、npm 11）。

```bash
npm ci
npm test
npm run build
```

`npm run build` 以 esbuild 將背景指令碼、內容指令碼、彈出面板和設定頁面分別打包到 `dist/`，由 `locales/` 中的檔案產生 `dist/_locales/<語言>/messages.json`，再將 `dist/` 壓縮成 `web-ext-artifacts/thunderbird-translate-<版本號>.xpi`。壓縮使用純 JavaScript 的 fflate 函式庫，不依賴系統中的 zip 指令。

開發除錯時可以不打包直接安裝：在 Thunderbird 中開啟「工具 → 開發者工具 → 除錯附加元件」，點擊「載入暫時附加元件…」，選擇 `dist/manifest.json`。

## 使用方式

開啟一封郵件，郵件標頭工具列上會出現「翻譯郵件」按鈕。點擊後會彈出面板，面板中有以下控制項：

- 「翻譯此郵件」按鈕：開始翻譯；翻譯進行中或完成後，按鈕會變成「顯示原文」，點擊即可恢復原文。
- 顯示方式：在雙語對照與僅譯文之間切換，對目前的郵件立即生效。
- 目標語言：變更後，正在翻譯的郵件會依新語言重新翻譯。
- 翻譯服務：選擇目前使用的服務商。
- 自動翻譯非目標語言的郵件：勾選後，開啟郵件時若內文不是目標語言，會自動開始翻譯。

面板下方顯示翻譯進度，例如「已翻譯 8 / 12」。某一段翻譯失敗時，原文後方會出現紅色的「翻譯失敗，點擊重試」；滑鼠游標停在上面可以看到錯誤原因，點擊即重試這一段。

快速鍵 Alt+A 翻譯目前的郵件或恢復原文，Alt+S 在雙語對照與僅譯文之間切換。快速鍵可以在附加元件管理員齒輪選單中的「管理擴充套件快速鍵」修改。

在僅譯文模式下，將滑鼠游標停在譯文上，提示框會顯示對應的原文。

## 設定

在附加元件管理員中點擊本擴充套件的「選項」即可開啟設定頁面。設定會自動儲存，右上角出現「已儲存」即表示已經寫入。

| 分組 | 內容 |
| --- | --- |
| 一般 | 介面語言、目標語言、預設顯示方式、目前服務、自動翻譯 |
| 翻譯服務 | 每個服務商的 API 端點、API 金鑰、模型、溫度，以及「測試連線」和「設為目前服務」按鈕 |
| 系統提示詞 | 自訂 AI 服務的系統提示詞，`{{to}}` 會替換為目標語言名稱；留空則使用內建提示詞 |
| 請求批次處理 | 收集時間窗、每次請求的字元數上限與段落數上限、同時請求數、重試次數、是否合併 AI 請求 |
| 譯文樣式 | 左側直線、左側虛線、底色醒目提示或無裝飾；強調色、文字不透明度、字型大小比例；附即時預覽 |
| 快取 | 是否快取、快取段落數上限、目前快取筆數、清除快取 |

「測試連線」會以輸入欄位中目前的值傳送一句測試文字；成功時顯示譯文，失敗時顯示服務商傳回的錯誤，例如金鑰無效或模型名稱不存在。

## 介面語言

設定頁面「一般」分組中的「介面語言」有兩類選項：

- 跟隨 Thunderbird（預設）：擴充套件選用與 Thunderbird 介面語言最接近的受支援語言。選項文字會標出目前實際使用的語言，例如「跟隨 Thunderbird（Deutsch）」。
- 12 種受支援語言之一：擴充套件固定使用該語言，與 Thunderbird 的語言無關。

這項設定套用於彈出面板、設定頁面、郵件中的提示文字（「翻譯中…」「翻譯失敗，點擊重試」）、錯誤訊息、測試連線的結果，以及工具列按鈕的滑鼠懸停提示。已開啟的設定頁面和彈出面板會立即換成新語言。已翻譯過的郵件中，提示文字會在下一次繪製時換成新語言。

有兩處文字由 Thunderbird 直接從擴充套件的 manifest 讀取，一律跟隨 Thunderbird 的介面語言：

- 附加元件管理員中的擴充套件名稱與擴充套件說明；
- 「管理擴充套件快速鍵」中的快速鍵說明。

設定頁面在「介面語言」選項下方註明了這一點。

選擇「跟隨 Thunderbird」時，Thunderbird 的語言依下表對應到受支援語言：

| Thunderbird 的語言 | 擴充套件使用的介面語言 |
| --- | --- |
| `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant` | 繁體中文 |
| 其他 `zh-*` | 簡體中文 |
| `pt-*` | 葡萄牙語（巴西） |
| `en-*`、`ja`、`ko`、`fr-*`、`de-*`、`es-*`、`ru`、`tr`、`vi` | 主要語言標籤相同的語言 |
| 其他語言 | 英語 |

目標語言下拉選單中的語言名稱依目前的介面語言顯示，括號內附上該語言的自稱，例如介面為中文時顯示「日語（日本語）」。傳給 AI 服務的提示詞一律使用英文語言名稱，因為模型對英文指令的遵循最穩定。

初次安裝時，目標語言依介面語言設定：日語介面的 Thunderbird 預設目標語言為日語，英語介面預設為英語。已儲存過的目標語言不會被覆蓋。

## 支援的介面語言

| 代碼 | 語言 |
| --- | --- |
| `en` | English（英語） |
| `zh_CN` | 简体中文（簡體中文） |
| `zh_TW` | 繁體中文 |
| `ja` | 日本語（日語） |
| `ko` | 한국어（韓語） |
| `fr` | Français（法語） |
| `de` | Deutsch（德語） |
| `es` | Español（西班牙語） |
| `pt_BR` | Português (Brasil)（葡萄牙語，巴西） |
| `ru` | Русский（俄語） |
| `tr` | Türkçe（土耳其語） |
| `vi` | Tiếng Việt（越南語） |

目標語言清單與介面語言彼此獨立，共 20 種，另外還包括義大利語、烏克蘭語、波蘭語、荷蘭語、泰語、印尼語、阿拉伯語和印地語。

## 服務商設定

### 免費與自架服務

| 服務 | 是否需要設定 | 說明 |
| --- | --- | --- |
| Google 翻譯（免費，預設） | 否 | 呼叫 `translate.googleapis.com` 的 `client=gtx` 端點，一次 POST 攜帶多個 `q` 參數，多段合併為一次請求 |
| Microsoft 翻譯（免費） | 否 | 先嘗試從 `edge.microsoft.com/translate/auth` 取得權杖，再呼叫 `api-edge.cognitive.microsofttranslator.com`；該權杖端點已被微軟停用時，自動改用 `edge.microsoft.com/translate/translatetext`。兩條路徑都原生支援陣列批次 |
| DeepLX | 需要填寫端點 | 自架或第三方的 DeepLX 服務；權杖為選填。端點中含有 `{{apiKey}}` 時以權杖取代該預留位置，否則以 `Authorization: Bearer` 傳送 |

### AI 服務商

所有 AI 服務商都透過 Vercel AI SDK 的 `generateText` 呼叫。有官方 `@ai-sdk/*` 套件的服務商使用官方套件，其餘使用 `@ai-sdk/openai-compatible`。每個服務商都可以修改 API 端點、API 金鑰、模型和溫度；模型輸入欄位提供常用模型的下拉建議，也可以直接填寫任何模型名稱。

| 服務商 | SDK 套件 | 預設 API 端點 | 預設模型 | 需要金鑰 |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | 是 |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | 是 |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | 是 |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | 是 |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | 是 |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | 是 |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | 是 |
| Ollama（本機） | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | 否 |
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
| Azure OpenAI | `@ai-sdk/azure` | 需自行填寫 | `gpt-4.1-mini` | 是 |
| LM Studio（本機） | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | 否 |
| 自訂 OpenAI 相容服務 | `@ai-sdk/openai-compatible` | 需自行填寫 | 需自行填寫 | 否 |

以下幾個服務商有額外要求：

- Anthropic Claude：擴充套件會在請求中附加 `anthropic-dangerous-direct-browser-access: true` 標頭，這是 Anthropic 接受瀏覽器環境直接連線的條件。Claude 5 系列和 Opus 4.7、4.8 不接受自訂溫度，擴充套件對這些模型不傳送溫度參數，因此預設模型的溫度欄位留空。
- Azure OpenAI：API 端點填寫 `https://<資源名稱>.openai.azure.com/openai`，模型填寫部署名稱。
- Ollama：Ollama 預設拒絕來自擴充套件頁面的跨來源請求，需要以環境變數 `OLLAMA_ORIGINS=moz-extension://*` 啟動 Ollama。
- Moonshot：預設端點是中國站 `api.moonshot.cn`，國際站帳號請改為 `https://api.moonshot.ai/v1`。
- 火山引擎豆包：模型欄位可以填寫模型名稱，也可以填寫在方舟控制台中建立的推論接入點 ID。

## 批次處理原理

一封郵件通常有十幾到幾十個段落。逐段請求時，每一段都要單獨傳送一次系統提示詞和翻譯指示，並各自佔用一次請求配額。批次處理把短時間內到達的段落合併成一次請求，這兩項開銷隨之改為每批計一次。

### 流程

1. 內容指令碼將每個待翻譯段落交給背景程式。
2. 背景程式先查詢快取，命中則直接傳回。快取鍵由服務商、模型、目標語言、系統提示詞簽章和段落文字的雜湊值組成。相同文字正在翻譯時，後到的請求共用同一個結果。
3. 未命中的段落進入批次處理佇列，依「服務商 + 模型 + API 端點 + 目標語言」分組。同一組的段落在 50 毫秒的時間窗內累積；時間窗結束、段落數達到上限或字元數即將超過上限時，該組立即送出。單一段落超過字元上限時自成一批。
4. 每一批交給請求佇列執行。請求佇列限制同時請求數，遇到 429、5xx 或網路錯誤時以指數退避重試；伺服器提供 `Retry-After` 時依其指定時間等待。401、400 這類錯誤直接回報，不重試。
5. 結果寫入記憶體快取，並在 1 秒後合併寫入 `storage.local`。快取以最近最少使用（Least Recently Used，LRU）策略淘汰。

### 各類服務的合併方式

- Google：一次 POST 攜帶多個 `q` 參數，傳回的陣列與輸入一一對應。
- Microsoft：請求本文本身就是陣列。
- DeepLX：端點一次只接受一段，批次內各段同時發出請求。
- AI 服務商：各段編號後放入同一則訊息，要求模型傳回長度相同的 JSON 陣列。剖析器依序嘗試 JSON 陣列（可包在程式碼區塊中或帶有前後說明文字，並會修正字串中未跳脫的換行與多餘的逗號）、帶編號的 `<seg>` 區塊、編號行、`%%` 分隔符號。全部失敗或筆數不符時，這一批改為逐段請求，使用者看到的結果不受影響。驗證失敗等非剖析錯誤不做逐段退回，以免同樣的錯誤重複 N 次。

### 開銷估算

設系統提示詞與指示共 $s$ 個 token，每段平均 $t$ 個 token，共 $N$ 段，批次大小為 $B$，每段編號與 JSON 引號的額外開銷為 $c$ 個 token。

逐段請求的輸入 token 總量為

$$
I_{\text{逐段}} = N(s + t).
$$

批次處理時共有 $\lceil N/B \rceil$ 次請求，輸入 token 總量為

$$
I_{\text{批次}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

兩者之差為

$$
I_{\text{逐段}} - I_{\text{批次}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

只要 $s$ 明顯大於 $c$，批次越大，節省越多。以 $s = 150$、$t = 60$、$c = 10$、$N = 20$、$B = 30$ 為例：

$$
I_{\text{逐段}} = 20 \times 210 = 4200, \qquad I_{\text{批次}} = 150 + 20 \times 70 = 1550.
$$

輸入 token 減少約 63%，請求次數從 20 次降為 1 次。兩種方式的輸出 token 大致相同，因為譯文本身的長度不變。請求次數的減少對免費端點同樣重要：Google 和 Microsoft 的免費端點依請求頻率限流，一封 20 段的郵件只佔用一次請求。

## 隱私

- API 金鑰只儲存在目前 Thunderbird 設定檔的 `storage.local` 中，只隨請求傳送到對應服務商的 API 端點。
- 內容指令碼在郵件頁面中執行，它從背景程式取得的設定不包含任何金鑰。
- 郵件內文只傳送給目前選定的翻譯服務，不會傳送到其他任何地方。擴充套件不收集統計資料，也不連線到翻譯服務以外的網路位址。
- 譯文快取儲存在本機，可以在設定頁面中關閉或清除。
- 郵件內容會離開本機，傳送到所選的翻譯服務。處理敏感郵件時，可以使用 Ollama 或 LM Studio 這類本機模型，此時請求只會到達本機。

## 已知限制

- 譯文以純文字呈現。原文中的連結、粗體等行內格式在譯文中不會保留；雙語對照模式下原文仍完整可用，僅譯文模式下可以將滑鼠游標停在譯文上查看原文，或切回雙語對照。
- Google 和 Microsoft 的免費端點沒有公開文件，端點可能變動或遭到限流。微軟的權杖端點 `edge.microsoft.com/translate/auth` 已於 2026 年 7 月停用（傳回 404）；擴充套件第一次請求時仍會嘗試權杖端點，失敗後改走直接連線的端點，並在一小時內不再嘗試權杖端點。
- 判斷段落是否已是目標語言時，中日韓等文字依字元類別判斷，拉丁字母語言優先呼叫擴充套件 API 的 i18n.detectLanguage；該介面無法使用或結果不可靠時，只有英文能可靠判斷，其他拉丁字母語言的段落會照常送出翻譯。
- 內容指令碼透過 `messageDisplayScripts` 註冊，只對註冊之後開啟的郵件生效。擴充套件啟動時會嘗試為已開啟的郵件補充注入；補充注入失敗時，重新點選一次該郵件即可。
- 擴充套件本身產生的錯誤訊息已經翻譯。翻譯服務或 AI SDK 傳回的錯誤文字（例如 HTTP 401 回應的本文）會原樣顯示，通常是英文。
- 擴充套件名稱、附加元件管理員中的擴充套件說明和快速鍵說明跟隨 Thunderbird 的介面語言，不受「介面語言」選項控制。

## 測試

```bash
npm test               # vitest 單元測試
npm run typecheck      # TypeScript 型別檢查
npm run locales:check  # 以 locales/en.json 為基準檢查各語言檔案
npm run live-test      # 以擴充套件本身的翻譯模組呼叫真實的 Google 和 Microsoft 端點
```

單元測試涵蓋以下內容：

- 批次處理分組與佇列；
- AI 輸出剖析與退回；
- 段落辨識，以及雙語對照 / 僅譯文的繪製與還原（jsdom 環境）；
- Google、Microsoft、DeepLX 的請求建構與回應剖析（模擬 fetch）；
- 每個 AI 預設組態的請求位址與驗證標頭；
- 在地化：各語言的鍵集合與替換參數和英文一致，manifest 引用的 `__MSG_*__` 都存在，Thunderbird 語言到受支援語言的對應，缺少的鍵退回英文，HTML 頁面和原始碼中沒有寫死的介面文字。

`npm run build:debug` 會產生除錯版 xpi：開啟郵件即開始翻譯，並將進度寫入主控台，用於在真實的 Thunderbird 中檢查整個流程。

## 目錄結構

```
src/
  background/    背景程式：翻譯服務、批次處理與請求佇列、快取、服務商工廠、各翻譯端點
  content/       內容指令碼：段落辨識、繪製、語言判斷、翻譯狀態控制
  popup/         彈出面板
  options/       設定頁面
  shared/        共用的設定、服務商預設組態、語言表、訊息型別、i18n 執行階段
locales/         介面文字，每種語言一個 JSON 檔案，en.json 為基準
static/          manifest.json、HTML、CSS、SVG 圖示
scripts/         建置、語言檔案產生與檢查、真實端點測試
readmes/         本文件的各語言版本
tests/           vitest 測試
```

## 翻譯介面文字

介面文字儲存在 `locales/<語言>.json` 中，每個檔案是一個「鍵 → 文字」的扁平物件。`locales/en.json` 是基準，其他檔案的鍵必須與它完全相同。檔案內容有三項約定：

- `$1` 到 `$9` 是替換參數，譯文中出現的編號必須與英文一致，位置可以依語序調整。
- `{{apiKey}}` 和 `{{to}}` 是字面標記，原樣保留。
- Google 翻譯、OpenAI、DeepLX 等產品名稱不翻譯。

`npm run build` 會將這些檔案轉換成 Thunderbird 讀取的 `dist/_locales/<語言>/messages.json`。擴充套件內建的 i18n 執行階段會在執行時載入同一批檔案，因此切換介面語言不需要重新啟動 Thunderbird。某個鍵在目前語言中缺少時，會退回英文。

新增一種語言的步驟：

1. 依 `locales/en.json` 的全部鍵新建 `locales/<代碼>.json`。
2. 在 `src/shared/locales.ts` 的 `SUPPORTED_LOCALES` 中加入該代碼，並補上它的自稱。
3. 執行 `npm run locales:check` 和 `npm test`。

## 致謝

段落辨識、批次處理佇列、提示詞寫法和服務商設定的設計參考了 [Read Frog](https://github.com/mengxi-ream/read-frog)，這是一個以 GPL-3.0 發布的網頁翻譯瀏覽器擴充套件。本專案將這些做法移植到 Thunderbird 的郵件閱讀環境，並針對郵件做了調整，例如純文字郵件的空行分段與硬換行合併。

## 授權條款

GPL-3.0-or-later，全文見 [LICENSE](../LICENSE)。
