# Thunderbird 郵件翻譯

Thunderbird 郵件翻譯（Thunderbird Translate）是一個 Thunderbird 擴充套件，在閱讀窗格中直接翻譯正在閱讀的郵件內文，安裝後用免費的 Google 翻譯即可運作。

[English](../README.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

## 目錄

- [功能](#功能)
- [安裝](#安裝)
- [快速開始](#快速開始)
- [使用](#使用)
- [三層翻譯](#三層翻譯)
- [翻譯服務](#翻譯服務)
- [提示詞](#提示詞)
- [隱私](#隱私)
- [已知限制](#已知限制)
- [文件](#文件)
- [致謝](#致謝)
- [授權條款](#授權條款)

## 功能

- 翻譯 HTML 郵件中的段落、清單項目、表格儲存格、標題和引言，以及純文字郵件中以空行分隔的段落。程式碼、純數字、純連結和已是目標語言的段落會被略過。
- 兩種顯示方式：雙語對照（譯文放在每段原文下方）和僅譯文。取消翻譯後，郵件恢復成原樣。
- 三個翻譯層級同時運作：離線辭典、機器翻譯和 AI 服務。最快的結果先顯示，最高層級的結果送達後取代它。
- 免費服務無須註冊：Google 翻譯（預設）和 Microsoft 翻譯。
- 離線翻譯使用辭典包和 Mozilla 的 Bergamot 模型，文字不會離開本機。
- 22 個 AI 服務商預設組態，包括 OpenAI、Claude、Gemini、DeepSeek、通義千問、本機的 Ollama 和 LM Studio，以及任何 OpenAI 相容服務。
- 精翻：AI 層級以整封郵件為上下文，人名和術語在全文保持一致。
- 三套可編輯的提示詞，附帶地區用語、語言風格和難詞處理的預設。
- 可選自動翻譯：開啟非目標語言的郵件時自動開始翻譯。
- 介面支援 12 種語言，安裝後自動開啟新手導覽。

## 安裝

1. 在 [Releases 頁面](https://github.com/willlllliams/thunderbird-translate/releases)下載最新的 `thunderbird-translate-<版本號>.xpi`。
2. 在 Thunderbird 中開啟「工具 → 附加元件與佈景主題」（右上角 ≡ 選單裡也有）。
3. 點擊擴充套件清單上方的齒輪圖示，選擇「從檔案安裝附加元件…」，選取 xpi 檔案並確認。

擴充套件需要 Thunderbird 128 或更新版本。預先發行版 `nightly` 是最新提交的自動建置，供測試使用。

## 快速開始

安裝完成後，新手導覽會在新分頁中開啟。每一步只問一個問題，依序是語言、顯示方式與譯文樣式、各層級的服務（附效果示範）、離線下載、服務金鑰和提示詞。每個選擇立即儲存，任何一步都可以略過。最後一步用目前的設定翻譯一封範例郵件。

之後可以從彈出面板的「新手導覽」連結或設定頁面頂端的按鈕再次開啟導覽。不做任何設定時，開啟一封郵件按 Alt+A，Google 翻譯就會翻譯它。

## 使用

開啟一封郵件，點擊郵件標頭工具列上的「翻譯郵件」按鈕。彈出面板包含以下控制項：

- 「翻譯此郵件」開始翻譯。譯文顯示期間，按鈕變為「顯示原文」。
- 「重新翻譯」讓每個層級重新翻譯，不使用快取。
- 顯示方式、來源語言（預設「自動偵測」）和目標語言。
- 每個層級的服務下拉選單、精翻開關，以及「自動翻譯非目標語言的郵件」開關。

| 快速鍵 | 作用 |
| --- | --- |
| Alt+A | 翻譯郵件，或顯示原文 |
| Alt+S | 在雙語對照和僅譯文之間切換 |
| Alt+R | 忽略快取重新翻譯（僅在郵件已翻譯時有效） |

快速鍵可以在附加元件管理員齒輪選單的「管理擴充套件快速鍵」中修改。

雙語對照把譯文放在對應原文段落的下方。僅譯文用譯文取代原文，滑鼠游標停在譯文上可以查看原文。

其餘設定都在設定頁面：在附加元件管理員中點擊本擴充套件的「選項」開啟。變更自動儲存，滑鼠停在任一控制項上即可看到說明。全部設定項目的說明見 [docs/settings.md](../docs/settings.md)（英文）。

## 三層翻譯

| 層級 | 可選服務 | 速度 | 品質 | 離線 | 費用 |
| --- | --- | --- | --- | --- | --- |
| 1 辭典 | 辭典 | 幾毫秒 | 逐詞對照，沒有文法 | 是 | 免費；每個語言組合幾 MB |
| 2 機器翻譯 | Google、Microsoft、DeepLX、Bergamot | 每封郵件一到兩秒 | 完整通順 | 僅 Bergamot | 免費；Bergamot 每個方向下載 13–48 MB |
| 3 AI 翻譯 | 22 個 AI 服務商 | 幾秒到一分鐘 | 最自然，遵循提示詞 | 僅本機模型 | 依用量計入你的 API 金鑰；本機模型免費 |

每個層級選一個服務或「不使用」，至少一個層級要有服務。預設只有層級 2 使用 Google 翻譯。

每個段落同時送給所有使用中的層級。較低層級的結果先作為暫時譯文顯示，用斜體並標出層級名稱。最高層級的結果送達後取代它，成為最終譯文；最高層級失敗時，暫時譯文保留。

選中的辭典或 Bergamot 缺少郵件語言所需的資料時，郵件上方會出現提醒，寫明要下載的內容，附有前往設定頁面的連結和「這些語言不再提醒我」核取方塊。

## 翻譯服務

| 類別 | 服務 | 需要準備 |
| --- | --- | --- |
| 免費 | Google 翻譯 | 無 |
| | Microsoft 翻譯 | 無；可選「使用我的金鑰（Azure Translator）」模式，填寫 Azure 金鑰和區域 |
| | DeepLX | DeepLX 伺服器的端點；存取權杖選填 |
| 離線 | 辭典 | 在「辭典」部分下載語言組合，每個幾 MB |
| | Bergamot（Mozilla） | 在「離線翻譯模型（Bergamot）」部分下載方向，每個 13–48 MB，每個模型都有一側是英語 |
| AI | 22 個預設組態 | API 金鑰；Ollama、LM Studio 和自訂 OpenAI 相容服務不需要 |

取得 API 金鑰：[OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [智譜 GLM](https://open.bigmodel.cn/usercenter/apikeys) · [通義千問（阿里雲百煉）](https://bailian.console.aliyun.com/) · [矽基流動](https://cloud.siliconflow.cn/account/ak) · [火山引擎豆包](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/)。本機模型：[Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/)。

精翻在每次 AI 請求中附上整封郵件作為上下文，費用較高；每個 AI 服務商的「思考模式」開關預設關閉，因為推理會讓翻譯更慢、更貴。各服務的端點、預設模型、Ollama 的 `OLLAMA_ORIGINS` 設定和思考參數見 [docs/providers.md](../docs/providers.md)（英文）。

## 提示詞

AI 層級使用三套提示詞之一：雙語對照（貼近原文）、僅譯文（行文流暢）和精翻（全文術語一致）。每套都可以編輯，並可用「還原內建提示詞」還原。

預設會向提示詞附加規則，包括地區用語（如英式英語、臺灣用語）、語言風格、在難詞後保留原文，以及簡短解釋難詞。詳見 [docs/settings.md](../docs/settings.md#prompts)（英文）。

## 隱私

- 郵件文字只送給使用中層級的服務。辭典和 Bergamot 在本機翻譯。
- API 金鑰只儲存在你的 Thunderbird 設定檔中，只隨請求傳送到對應服務的端點。
- 有兩份清單來自網路，不含任何郵件文字：本儲存庫 GitHub Releases 上的辭典包索引，以及 Mozilla 的 Bergamot 模型記錄。設定頁面和新手導覽讀取它們來顯示離線清單。層級中選用了辭典或 Bergamot 時，Thunderbird 啟動、設定變更和開啟彈出面板時也會讀取。翻譯郵件時從不讀取。
- 辭典包和模型只在你點擊下載按鈕時下載。擴充套件不收集任何統計資料。
- 翻譯快取儲存在本機，可以關閉或清除。
- 處理敏感郵件時，只使用辭典、Bergamot 和本機 AI 模型（Ollama、LM Studio）。

## 已知限制

- 譯文是純文字，原文中的連結和行內格式不會帶到譯文裡。
- Google 和 Microsoft 的免費端點沒有公開文件，可能變更或被限流。
- 辭典給出的是依原文詞序排列的逐詞釋義。
- 辭典和 Bergamot 不能在簡體中文和繁體中文之間翻譯。
- 每個使用中的層級各自傳送請求，因此同時使用 AI 層級時，機器翻譯層級的請求同樣計入免費端點的頻率限制。
- 翻譯服務傳回的錯誤文字依原樣顯示，通常是英文。

完整清單見 [docs/settings.md](../docs/settings.md#known-limitations)（英文）。

## 文件

以下文件為英文。

- [docs/settings.md](../docs/settings.md)：全部設定項目、離線清單、缺少離線資料的提醒和快取。
- [docs/providers.md](../docs/providers.md)：各服務的端點、預設模型和思考參數。
- [docs/batching.md](../docs/batching.md)：段落如何合併成請求、逾時和費用。
- [docs/development.md](../docs/development.md)：從原始碼建置、測試、專案結構、翻譯介面文字和發行流程。

## 致謝

- [Read Frog](https://github.com/mengxi-ream/read-frog)（GPL-3.0）：段落辨識、批次處理佇列、提示詞和服務商組態的設計。
- [Mozilla Bergamot](https://browser.mt/)：離線翻譯引擎和 Firefox Translations 模型（MPL-2.0）。
- [Wiktionary](https://en.wiktionary.org/)（© Wiktionary contributors）：除英語 → 簡體中文外的辭典包改編（擷取、篩選、裁剪）自 Wiktionary，資料由 [wiktextract](https://github.com/tatuylonen/wiktextract) 擷取、[kaikki.org](https://kaikki.org/) 發布，授權為 CC BY-SA 4.0（<https://creativecommons.org/licenses/by-sa/4.0/>）。
- [ECDICT](https://github.com/skywind3000/ECDICT)，Copyright (c) 2025 Linwei，MIT 授權：英語 → 簡體中文辭典包改編（擷取、篩選、裁剪）自 ECDICT。

## 授權條款

GPL-3.0-or-later，全文見 [LICENSE](../LICENSE)。
