# Thunderbird Translate

English | [简体中文](readmes/README.zh-CN.md) | [繁體中文](readmes/README.zh-TW.md) | [日本語](readmes/README.ja.md) | [한국어](readmes/README.ko.md) | [Français](readmes/README.fr.md) | [Deutsch](readmes/README.de.md) | [Español](readmes/README.es.md) | [Português (Brasil)](readmes/README.pt-BR.md) | [Русский](readmes/README.ru.md) | [Türkçe](readmes/README.tr.md) | [Tiếng Việt](readmes/README.vi.md)

Thunderbird Translate is a Thunderbird extension that translates the body of the message you are reading, directly in the message pane. A translation can appear under each original paragraph (bilingual) or replace it (translation only). Turning translation off restores the original message exactly. Google Translate (free) is the default and works right after installation. You can also connect 22 AI providers, including OpenAI, Claude, Gemini, DeepSeek and Qwen.

This document is written for readers who have not used a Thunderbird extension before. It follows the order install, use, configure, and how it works.

![Demo: translating a message, switching between bilingual and translation-only, changing the target language](docs/demo.gif)

## Other languages

Each line below introduces the extension in one language and links to the full README in that language.

- 简体中文：在 Thunderbird 阅读窗格中直接翻译邮件，支持双语对照与仅译文两种显示方式，可用免费的谷歌、微软翻译和 DeepLX，也可接入 20 多个 AI 服务商。[完整说明](readmes/README.zh-CN.md)
- 繁體中文：在 Thunderbird 閱讀窗格中直接翻譯郵件，支援雙語對照與僅譯文兩種顯示方式，可使用免費的 Google、微軟翻譯和 DeepLX，也能接入 20 多家 AI 服務商。[完整說明](readmes/README.zh-TW.md)
- 日本語：Thunderbird のメッセージ表示欄でメールをそのまま翻訳する拡張機能です。対訳表示と訳文のみ表示を切り替えられ、無料の Google 翻訳・Microsoft 翻訳・DeepLX と 20 以上の AI サービスに対応しています。[詳しい説明](readmes/README.ja.md)
- 한국어: Thunderbird 메시지 창에서 메일을 바로 번역하는 확장 기능으로, 이중 언어 보기와 번역만 보기를 지원하며 무료 Google·Microsoft 번역, DeepLX와 20개 이상의 AI 서비스를 사용할 수 있습니다. [자세한 설명](readmes/README.ko.md)
- Français : extension Thunderbird qui traduit les e-mails directement dans le volet de lecture, en mode bilingue ou traduction seule, avec Google Traduction, Microsoft Translator et DeepLX gratuits ainsi que plus de 20 fournisseurs d'IA. [Documentation complète](readmes/README.fr.md)
- Deutsch: Thunderbird-Erweiterung, die E-Mails direkt im Nachrichtenbereich übersetzt, zweisprachig oder nur als Übersetzung, mit kostenlosem Google Übersetzer, Microsoft Translator und DeepLX sowie über 20 KI-Anbietern. [Vollständige Anleitung](readmes/README.de.md)
- Español: extensión de Thunderbird que traduce los correos directamente en el panel de lectura, en modo bilingüe o solo traducción, con Google Translate, Microsoft Translator y DeepLX gratuitos y más de 20 proveedores de IA. [Documentación completa](readmes/README.es.md)
- Português (Brasil): extensão do Thunderbird que traduz e-mails diretamente no painel de leitura, em modo bilíngue ou somente tradução, com Google Tradutor, Microsoft Translator e DeepLX gratuitos e mais de 20 provedores de IA. [Documentação completa](readmes/README.pt-BR.md)
- Русский: расширение Thunderbird, которое переводит письма прямо в области просмотра, в двуязычном режиме или только перевод, с бесплатными Google Переводчиком, Microsoft Translator и DeepLX, а также более чем 20 ИИ-провайдерами. [Полное описание](readmes/README.ru.md)
- Türkçe: E-postaları doğrudan Thunderbird okuma bölmesinde çeviren bir eklenti; iki dilli veya yalnızca çeviri modunda çalışır, ücretsiz Google Çeviri, Microsoft Translator ve DeepLX ile 20'den fazla yapay zekâ sağlayıcısını destekler. [Ayrıntılı belge](readmes/README.tr.md)
- Tiếng Việt: tiện ích Thunderbird dịch thư ngay trong khung đọc, hiển thị song ngữ hoặc chỉ bản dịch, hỗ trợ Google Dịch, Microsoft Translator, DeepLX miễn phí và hơn 20 nhà cung cấp AI. [Tài liệu đầy đủ](readmes/README.vi.md)

## Features

- Body translation: the extension finds paragraph-level content in the message body: paragraphs, list items, table cells, headings, block quotes, text-only divs, and blank-line separated paragraphs in plain-text mail. Code, paragraphs already in the target language, numbers, bare links and whitespace are skipped.
- Two display modes: bilingual mode inserts a translation block with a light left border under the original, readable in dark themes as well. Translation-only mode replaces the original with the translation; the original is kept in memory and put back when translation is turned off.
- Live updates: changing the display mode or the target language while a message is translated re-renders the page without reopening the message. Changing the display mode redraws from translations already received and sends no new requests.
- Entry points: the "Translate message" button in the message header toolbar with its popup, and the shortcuts Alt+A (translate / show original) and Alt+S (switch bilingual / translation-only).
- Optional automatic translation: messages not in the target language are translated as soon as they are opened.
- Request batching: the background script collects paragraphs for 50 ms and merges them into one request, with a concurrency limit, retries with exponential backoff, and a local cache.
- Services: 3 free or self-hosted translation services and 22 AI provider presets, one of which is "Custom OpenAI-compatible".
- Interface in 12 languages. The interface language follows Thunderbird by default and can be chosen on the settings page.

## Install

### From Releases

1. Download the latest `thunderbird-translate-<version>.xpi` from the Releases page of this repository.
2. In Thunderbird, open Tools → Add-ons and Themes (also reachable from the ≡ menu in the top right corner).
3. Click the gear icon above the extension list, choose "Install Add-on From File", select the downloaded xpi file and confirm.

Thunderbird 128 or later is required.

### Build from source

Node.js 22 or later is required (development uses Node 24 and npm 11).

```bash
npm ci
npm test
npm run build
```

`npm run build` bundles the background script, the content script, the popup and the settings page into `dist/` with esbuild, generates `dist/_locales/<language>/messages.json` from the files in `locales/`, and packs `dist/` into `web-ext-artifacts/thunderbird-translate-<version>.xpi`. Packing uses the pure JavaScript fflate library and needs no system zip command.

During development you can load the extension without packing it: in Thunderbird open Tools → Developer Tools → Debug Add-ons, click "Load Temporary Add-on" and select `dist/manifest.json`.

## Usage

Open a message. A "Translate message" button appears in the message header toolbar. Clicking it opens a popup with these controls:

- "Translate this message": starts translating. While a translation is running or shown, the button reads "Show original" and restores the original when clicked.
- Display: switches between bilingual and translation-only; the change applies to the current message immediately.
- Target language: after a change, a message being translated is translated again into the new language.
- Translation service: selects the service in use.
- Automatically translate messages not in the target language: when checked, a message whose body is not in the target language is translated as soon as it is opened.

The popup shows the progress, for example "Translated 8 of 12". When a paragraph fails, a red "Translation failed, click to retry" appears after it; hovering shows the error and clicking retries that paragraph.

Alt+A translates the current message or restores the original; Alt+S switches between bilingual and translation-only. Both shortcuts can be changed under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager.

In translation-only mode, hovering over a translation shows the original text in a tooltip.

## Settings

Open the settings page with the "Options" button of this extension in the Add-ons Manager. Settings are saved automatically; "Saved" appears in the top right corner once they are written.

| Section | Contents |
| --- | --- |
| General | Interface language, target language, default display mode, current service, automatic translation |
| Translation services | Endpoint, API key, model and temperature of each service; "Test connection" and "Use this service" buttons |
| System prompt | Custom system prompt for AI services; `{{to}}` is replaced by the target language name; empty means the built-in prompt |
| Request batching | Collection window, maximum characters and paragraphs per request, concurrency, retries, whether to merge AI requests |
| Translation style | Left border, dashed left border, highlight or plain; accent color, text opacity, font size ratio; live preview |
| Cache | Cache on or off, maximum cached paragraphs, current number of entries, clear cache |

"Test connection" sends one test sentence with the values currently in the input fields. On success it shows the translation; on failure it shows the error returned by the service, for example an invalid key or an unknown model name.

## Interface language

The "Interface language" option in the General section has two kinds of values:

- "Follow Thunderbird" (default): the extension uses the supported language closest to Thunderbird's own interface language. The option label shows the language currently chosen, for example "Follow Thunderbird (Deutsch)".
- One of the 12 supported languages: the extension uses that language regardless of Thunderbird's language.

The choice applies to the popup, the settings page, the labels inside messages ("Translating…", "Translation failed, click to retry"), error messages, the connection test result and the toolbar button tooltip. An open settings page or popup switches its text immediately. Labels inside a message that is already translated change the next time they are drawn.

A few texts are read by Thunderbird itself from the extension manifest and always follow Thunderbird's interface language: the extension name and description in the Add-ons Manager, and the shortcut descriptions under "Manage Extension Shortcuts". The settings page states this under the option.

"Follow Thunderbird" maps Thunderbird's language as follows:

| Thunderbird language | Interface language used |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Traditional Chinese |
| other `zh-*` | Simplified Chinese |
| `pt-*` | Portuguese (Brazil) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | the language with the same primary subtag |
| any other language | English |

The target language list shows each language name in the interface language followed by the language's own name, for example "Japanese (日本語)". Prompts sent to AI services always use the English language name, because models follow English instructions most reliably.

On first installation the target language is set from the interface language: a Japanese Thunderbird starts with Japanese as the target language, an English Thunderbird with English. An existing target language is never overwritten.

## Supported interface languages

| Code | Language |
| --- | --- |
| `en` | English |
| `zh_CN` | 简体中文 (Simplified Chinese) |
| `zh_TW` | 繁體中文 (Traditional Chinese) |
| `ja` | 日本語 (Japanese) |
| `ko` | 한국어 (Korean) |
| `fr` | Français (French) |
| `de` | Deutsch (German) |
| `es` | Español (Spanish) |
| `pt_BR` | Português (Brasil) (Portuguese, Brazil) |
| `ru` | Русский (Russian) |
| `tr` | Türkçe (Turkish) |
| `vi` | Tiếng Việt (Vietnamese) |

The target language list is separate and contains 20 languages, including Italian, Ukrainian, Polish, Dutch, Thai, Indonesian, Arabic and Hindi.

## Provider configuration

### Free and self-hosted services

| Service | Setup | Notes |
| --- | --- | --- |
| Google Translate (free, default) | None | Calls the `client=gtx` endpoint of `translate.googleapis.com`; one POST carries several `q` parameters, so several paragraphs share one request |
| Microsoft Translator (free) | None | First tries to get a token from `edge.microsoft.com/translate/auth` and call `api-edge.cognitive.microsofttranslator.com`; when Microsoft has retired the token endpoint, it switches to `edge.microsoft.com/translate/translatetext`. Both routes accept arrays natively |
| DeepLX | Endpoint required | A self-hosted or third-party DeepLX service; the token is optional. If the endpoint contains `{{apiKey}}`, the token replaces it; otherwise it is sent as `Authorization: Bearer` |

### AI providers

All AI providers are called through `generateText` of the Vercel AI SDK. Providers with an official `@ai-sdk/*` package use that package; the others use `@ai-sdk/openai-compatible`. Endpoint, API key, model and temperature can be changed for every provider. The model field suggests common models and also accepts any model name.

| Provider | SDK package | Default endpoint | Default model | Key required |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Yes |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Yes |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Yes |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-chat` | Yes |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | Yes |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Yes |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Yes |
| Ollama (local) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | No |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Yes |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Yes |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Yes |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Yes |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Yes |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Yes |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Yes |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Yes |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Yes |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Yes |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | Yes |
| Azure OpenAI | `@ai-sdk/azure` | Must be filled in | `gpt-4.1-mini` | Yes |
| LM Studio (local) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | No |
| Custom OpenAI-compatible | `@ai-sdk/openai-compatible` | Must be filled in | Must be filled in | No |

Some providers have extra requirements:

- Anthropic Claude: the extension adds the header `anthropic-dangerous-direct-browser-access: true`, which Anthropic requires for requests from a browser context. The Claude 5 series and Opus 4.7 and 4.8 reject a custom temperature, so the extension sends no temperature for these models, and the temperature field of the default model is empty.
- Azure OpenAI: the endpoint is `https://<resource>.openai.azure.com/openai`, and the model field takes the deployment name.
- Ollama: by default Ollama rejects cross-origin requests from extension pages. Start Ollama with the environment variable `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: the default endpoint is the China site `api.moonshot.cn`; accounts on the international site use `https://api.moonshot.ai/v1`.
- Volcengine Doubao: the model field takes either a model name or the ID of an inference endpoint created in the Ark console.

## How batching works

A message usually has between ten and a few dozen paragraphs. With one request per paragraph, every paragraph carries its own copy of the system prompt and instructions, and every paragraph uses one request from the rate limit. Batching merges paragraphs that arrive close together into one request, so both costs are paid per batch instead of per paragraph.

### Flow

1. The content script hands every paragraph to be translated to the background script.
2. The background script looks up the cache first and answers directly on a hit. The cache key consists of the provider, the model, the target language, a signature of the system prompt and a hash of the paragraph text. When the same text is already being translated, later requests share the same result.
3. Paragraphs not in the cache enter the batch queue, grouped by provider + model + endpoint + target language. Paragraphs of one group accumulate for 50 ms. A group is sent when the window ends, when the paragraph limit is reached, or when the next paragraph would exceed the character limit. A single paragraph longer than the character limit forms its own batch.
4. The request queue executes each batch. It limits concurrency and retries 429, 5xx and network errors with exponential backoff; when the server sends `Retry-After`, it waits for that time. Errors such as 401 and 400 are reported without retrying.
5. Results go to the in-memory cache and are written to `storage.local` in one write after 1 second. The cache evicts the least recently used (LRU) entries.

### How each service merges paragraphs

- Google: one POST with several `q` parameters; the returned array matches the input one to one.
- Microsoft: the request body itself is an array.
- DeepLX: the endpoint accepts one paragraph per request, so the paragraphs of a batch are requested concurrently.
- AI providers: the paragraphs are numbered and put into one message, and the model is asked to return a JSON array of the same length. The parser tries, in order: a JSON array (possibly inside a code block or surrounded by explanations; bare newlines inside strings and trailing commas are repaired), numbered `<seg>` blocks, numbered lines, and the `%%` separator. If all of them fail or the count does not match, that batch is sent again one paragraph per request, and the user sees the same result. Errors other than parsing errors, such as authentication failures, do not trigger this fallback, so the same error is not repeated N times.

### Cost estimate

Let the system prompt and instructions take $s$ tokens, each paragraph $t$ tokens on average, with $N$ paragraphs in total, a batch size of $B$, and $c$ extra tokens per paragraph for numbering and JSON quotes.

With one request per paragraph, the total number of input tokens is

$$
I_{\text{single}} = N(s + t).
$$

With batching there are $\lceil N/B \rceil$ requests, and the total number of input tokens is

$$
I_{\text{batch}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

The difference is

$$
I_{\text{single}} - I_{\text{batch}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

As long as $s$ is clearly larger than $c$, larger batches save more. With $s = 150$, $t = 60$, $c = 10$, $N = 20$ and $B = 30$:

$$
I_{\text{single}} = 20 \times 210 = 4200, \qquad I_{\text{batch}} = 150 + 20 \times 70 = 1550.
$$

Input tokens drop by about 63%, and the number of requests drops from 20 to 1. Output tokens are about the same in both cases, since the length of the translation does not change. Fewer requests matter for the free endpoints as well: Google and Microsoft limit their free endpoints by request rate, and a 20-paragraph message takes a single request.

## Privacy

- API keys are stored only in `storage.local` of the current Thunderbird profile and are sent only with requests to the endpoint of the matching provider.
- The content script runs inside the message page; the settings it receives from the background script never contain keys.
- Message text is sent only to the currently selected translation service. The extension collects no statistics and contacts no network address other than the translation service.
- The translation cache is stored locally and can be turned off or cleared on the settings page.
- Message text leaves your computer and goes to the selected translation service. For sensitive mail, local models such as Ollama or LM Studio keep every request on your own machine.

## Known limitations

- Translations are plain text. Links, bold text and other inline formatting of the original are not kept in the translation. In bilingual mode the original stays fully usable; in translation-only mode you can hover to see the original or switch back to bilingual.
- The free Google and Microsoft endpoints are undocumented and may change or be rate-limited. Microsoft retired the token endpoint `edge.microsoft.com/translate/auth` in July 2026 (it returns 404). The extension still tries the token endpoint on the first request, falls back to the direct endpoint after a failure, and does not try the token endpoint again for one hour.
- To decide whether a paragraph is already in the target language, Chinese, Japanese, Korean and similar scripts are judged by character class, and Latin-script languages first use `i18n.detectLanguage` of the extension API. When that API is unavailable or its result is unreliable, only English is detected reliably; paragraphs in other Latin-script languages are sent for translation as usual.
- The content script is registered through `messageDisplayScripts` and reaches only messages opened after registration. On startup the extension tries to inject it into messages already open; if that fails, selecting the message again is enough.
- Error messages produced by the extension are translated. Error texts returned by a translation service or by the AI SDK (for example the body of an HTTP 401 response) are shown as received, usually in English.
- The extension name, its description in the Add-ons Manager and the shortcut descriptions follow Thunderbird's interface language, not the interface language option.

## Tests

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

The unit tests cover batch grouping and queues, AI output parsing and fallback, paragraph detection with bilingual and translation-only rendering and restoring (in jsdom), request building and response parsing for Google, Microsoft and DeepLX (with a mocked fetch), the request URL and authentication headers of every AI preset, and localization: identical key sets and placeholders in all languages, every `__MSG_*__` reference in the manifest, mapping of Thunderbird languages to supported languages, fallback to English for missing keys, and the absence of hard-coded interface text in the HTML pages and sources.

`npm run build:debug` produces a debug xpi that starts translating as soon as a message is opened and writes progress to the console, for checking the whole flow in a real Thunderbird.

## Project structure

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page
  shared/        shared settings, provider presets, language table, message types, i18n runtime
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, locale generation and checks, live endpoint test
readmes/         translated versions of this README
tests/           vitest tests
```

## Translating the interface

Interface text lives in `locales/<language>.json`, one flat object of key → text per language. `locales/en.json` is the reference: every other file has exactly the same keys. `$1` to `$9` are substitutions and must appear in each translation with the same numbers as in English; `{{apiKey}}` and `{{to}}` are literal tokens and stay unchanged. Product names such as Google Translate, OpenAI or DeepLX are not translated.

`npm run build` converts these files into `dist/_locales/<language>/messages.json`, the format Thunderbird reads. The extension's own i18n runtime loads the same files at run time, so the interface language can change without restarting Thunderbird. Missing keys fall back to English.

To add a language, create `locales/<code>.json` with all keys, add the code to `SUPPORTED_LOCALES` in `src/shared/locales.ts` together with its native name, and run `npm run locales:check` and `npm test`.

## Acknowledgements

The design of paragraph detection, the batch queue, the prompts and the provider configuration follows [Read Frog](https://github.com/mengxi-ream/read-frog), a browser extension for translating web pages released under GPL-3.0. This project carries these ideas over to Thunderbird's message reader and adapts them to email, for example splitting plain-text mail at blank lines and joining hard-wrapped lines.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
