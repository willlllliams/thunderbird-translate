# Thunderbird Translate

English | [简体中文](readmes/README.zh-CN.md) | [繁體中文](readmes/README.zh-TW.md) | [日本語](readmes/README.ja.md) | [한국어](readmes/README.ko.md) | [Français](readmes/README.fr.md) | [Deutsch](readmes/README.de.md) | [Español](readmes/README.es.md) | [Português (Brasil)](readmes/README.pt-BR.md) | [Русский](readmes/README.ru.md) | [Türkçe](readmes/README.tr.md) | [Tiếng Việt](readmes/README.vi.md)

Thunderbird Translate is a Thunderbird extension that translates the body of the message you are reading, directly in the message pane. A translation can appear under each original paragraph (bilingual) or replace it (translation only). Turning translation off restores the original message exactly. Translation runs in three tiers at the same time: an offline dictionary, a machine translator (Google Translate, Microsoft Translator, DeepLX or the offline Bergamot models) and an AI service (22 providers, including OpenAI, Claude, Gemini, DeepSeek and Qwen). The fastest result appears first and the result of the highest tier replaces it. Google Translate (free) is the default and works right after installation.

This document is written for readers who have not used a Thunderbird extension before. It follows the order install, use, configure, and how it works.

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
- Live updates: changing the display mode or the target language while a message is translated re-renders the page without reopening the message. Changing the display mode redraws the dictionary and machine translations already received; the AI tier is asked again with the prompt of the new mode, and the cache answers when it already has that translation.
- Entry points: the "Translate message" button in the message header toolbar with its popup, and the shortcuts Alt+A (translate / show original), Alt+S (switch bilingual / translation-only) and Alt+R (translate again past the cache).
- Optional translation on opening: messages not in the target language are translated as soon as they are opened.
- Request batching: the background script collects paragraphs for 50 ms and merges them into one request, with a concurrency limit per service, retries with exponential backoff, a request timeout and a local cache. A paragraph longer than one request may carry is split into pieces of whole lines; only a single line longer than a request is cut between sentences.
- Three translation tiers: dictionary, machine translation and AI. Each tier has its own service or is not used; every paragraph goes to all tiers in use at once. A lower tier is shown as a provisional translation until the highest tier replaces it, and stays when the highest tier fails.
- Services: an offline dictionary, 4 machine translators (Google Translate, Microsoft Translator, DeepLX, offline Bergamot models) and 22 AI provider presets, one of which is "Custom OpenAI-compatible". Only the services you have added appear in the tier lists.
- Source language: automatic detection or a fixed language, passed to every service.
- Three prompts for the AI tier: one for bilingual display, one for translation-only display and one for precise translation.
- Prompt presets: ready-made rules for a regional variety of the target language, difficult words with the original in parentheses, short explanations of difficult words, and four writing styles, added to any of the three prompts.
- Setup guide: opens after installation and sets up languages, display mode, tiers, offline downloads, services and prompts step by step, ending with a trial translation of a sample message.
- Precise translation (AI tier): the whole message is the context of every request, so names, terms and forms of address stay consistent across paragraphs.
- Thinking mode switch for each AI provider, off by default.
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

`npm run build` bundles the background script, the content script, the popup, the settings page, the setup guide and the Bergamot worker into `dist/` with esbuild, generates `dist/_locales/<language>/messages.json` from the files in `locales/`, and packs `dist/` into `web-ext-artifacts/thunderbird-translate-<version>.xpi`. Packing uses the pure JavaScript fflate library and needs no system zip command. The background script is an ES module: the AI SDK is a separate chunk under `dist/chunks/` that loads once the AI tier is in use, so Thunderbird starts the extension without it. The first build downloads the pinned Bergamot engine (wasm) from Mozilla into `.cache/`, see [docs/bergamot.md](docs/bergamot.md).

During development you can load the extension without packing it: in Thunderbird open Tools → Developer Tools → Debug Add-ons, click "Load Temporary Add-on" and select `dist/manifest.json`.

## Setup guide

After a new installation Thunderbird opens the setup guide in a tab. Updates of the extension or of Thunderbird do not open it. The guide is also available later from the "Setup guide" link in the popup and the "Setup guide" button at the top of the settings page.

Each step asks for one decision and saves it at once. "Back", "Next" and "Skip this step" move between steps, the numbered list under the progress bar jumps to any step, and "Exit guide" closes the tab at any time. The next visit starts at the step where the guide was left; after "Finish" it starts from the beginning.

| Step | Contents | Shown when |
| --- | --- | --- |
| 1 Languages | interface language, source language ("Detect automatically" by default), target language | always |
| 2 Display | bilingual or translation only, with a preview of a sample message in the current translation style | always |
| 3 Translation tiers | speed, quality, privacy and cost of the dictionary, machine translation and AI tiers; the service of each tier or "Not used", at least one tier with a service | always |
| 4 Offline translation | every dictionary pack and Bergamot direction with size, license and attribution, those of your languages first and ticked; tick the ones to download, then "Download selected" with progress, or "Download common languages" | the dictionary tier is used or the machine tier uses Bergamot |
| 5 Online machine translation | the fields of the machine translator: nothing to fill in for Google, free or Azure key mode for Microsoft, endpoint and token for DeepLX; "Test connection" | the machine tier uses Google, Microsoft or DeepLX |
| 6 AI translation | the AI provider, its API key, model, temperature and thinking mode, "Test connection", and the precise translation switch; a note that thinking mode and precise translation make translation slower and more expensive | the AI tier is used |
| 7 Prompts | the three prompts and the preset library (see Prompt presets) | the AI tier is used |
| 8 Done | how to translate (toolbar button, Alt+A, Alt+S), the switch "Automatically translate messages not in the target language", and "Translate the sample message" | always |

A step that the earlier choices do not need stays in the list, struck through, and the navigation passes over it. Choosing an AI service in step 3, for example, brings steps 6 and 7 back.

Step 4 lists every direction of both catalogs; the order and the labels are described under [Offline lists](#offline-lists). What is ticked depends on the source language:

- A fixed source language: the directions the pair needs. For Japanese → Simplified Chinese these are the dictionary pack Japanese → Chinese when the release has it, otherwise Japanese → English and English → Chinese, and the Bergamot directions ja → en and en → zh-Hans, since every Bergamot model has English on one side.
- "Detect automatically": the directions of the recommended languages in both directions with English. A note explains the route: a message in another language goes into English with "language → English" and from there with "English → target language".

"Download selected" is disabled while nothing is ticked, and the line next to it then says "Tick the items to download first.". During the download it shows "Downloading N items…", at the end "Downloads finished." or the number of failed downloads; each failed row shows its reason.

"Translate the sample message" in step 8 renders a short email in the page, in the source language when it is English or German, otherwise in English, or in German when the target language is English, and translates it with the current settings. The page uses the paragraph detection and rendering of the content script and sends the requests to the background script over the same connection as a displayed message, so the result shows what a real message will look like, including the tiers in use.

The guide uses the same components as the settings page: the service fields and connection test, the dictionary and Bergamot lists, and the prompt editor with its presets.

## Usage

Open a message. A "Translate message" button appears in the message header toolbar. Clicking it opens a popup with these controls:

- "Translate this message": starts translating. While a translation is running or shown, the button reads "Show original" and restores the original when clicked.
- "Retranslate": appears next to "Show original" while the message is translated. It translates the message again in the current display mode and asks every tier anew: neither the cache nor a request still running answers, the new results replace the cached ones, and precise translation analyses the message again. Lower tiers show provisional translations as usual; translations of other messages stay in the cache.
- Display: switches between bilingual and translation-only; the change applies to the current message immediately.
- Source language and target language: "Detect automatically" is the default source language. After a change of either, a message being translated is translated again. A note appears when both are the same language.
- Translation tiers: one list per tier (1 dictionary, 2 machine translation, 3 AI translation), each with "Not used", the added services of that tier and, as last entry, "+ Add translation service…". That entry opens the settings page at the translation services of the tier and leaves the list at its value. At least one tier needs a service; choosing "Not used" for the last one is refused with a note. A selected dictionary or Bergamot that lacks data for the current languages is marked, see [Missing offline data](#missing-offline-data).
- Precise translation: shown while the AI tier has a service.
- Automatically translate messages not in the target language: when checked, a message whose body is not in the target language is translated as soon as it is opened.
- Setup guide: opens the setup guide in a new tab.

The popup shows the progress, for example "Translated 8 of 12". Paragraphs that still show a provisional translation of a lower tier are counted separately, for example "Translated 7 of 9 (2 provisional)". When every tier fails for a paragraph, a red "Translation failed, click to retry" appears after it; hovering shows the error and clicking retries that paragraph.

Alt+A translates the current message or restores the original; Alt+S switches between bilingual and translation-only; Alt+R retranslates the current message like "Retranslate" in the popup and does nothing while the message is not translated. All three shortcuts can be changed under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager.

In translation-only mode, hovering over a translation shows the original text in a tooltip.

## Settings

Open the settings page with the "Options" button of this extension in the Add-ons Manager. Settings are saved automatically; "Saved" appears in the top right corner once they are written. When a save fails, the error appears in its place and the change goes with the next save; the setup guide stays open with the error when its settings cannot be saved on leaving or finishing. The "Setup guide" button next to it opens the setup guide.

| Section | Contents |
| --- | --- |
| General | Interface language, source language, target language, default display mode, the switch "Automatically translate messages not in the target language" |
| Translation tiers | The service of each tier or "Not used", with the mark of an offline service that lacks data; precise translation; the muted notices about missing offline data, with "Remind me again" |
| Translation services | Services in two groups, "Added" and "Available to add", filtered by tier; endpoint, API key, model, temperature and thinking mode of each service; "Test connection", "Add", "Use this service" and "Remove" buttons |
| Dictionaries | Every pack of the release with size, license and attribution, those of the recommended languages first; filter; "Download common languages"; download and delete; release tag of the packs (advanced) |
| Offline translation models (Bergamot) | Every direction of the Bergamot models with size and version, those of the recommended languages first; filter; "Download common languages"; download, update, cancel and delete; the directions the current languages need |
| Prompts (AI tier) | The preset library; the prompts for bilingual display, translation-only display and precise translation, each with "Restore built-in prompt" |
| Request batching | Collection window, maximum characters and paragraphs per request, concurrency, retries, request timeout (60 seconds by default; three times as long for Ollama, LM Studio and thinking mode), whether to merge AI requests |
| Translation style | Left border, dashed left border, highlight or plain; accent color, text opacity, font size ratio; live preview |
| Cache | Cache on or off, maximum cached paragraphs, current number of entries, clear cache |

"Test connection" sends one test sentence with the values currently in the input fields. On success it shows the translation; on failure it shows the error returned by the service, for example an invalid key or an unknown model name.

## Adding and removing services

The side list of the translation services section has two groups. "Added" holds the services that appear in the service lists of the popup and of the settings page; "Available to add" holds all others. Selecting a service shows its configuration and buttons:

- A service that is not added has an "Add" button. Typing an API key (for DeepLX, the endpoint) adds the service as well.
- An added service has "Use this service", which puts it into its tier, and "Remove". Removing takes the service out of the lists and keeps its configuration, so adding it again restores the key and the model.
- A service that a tier uses cannot be removed. The "Remove" button is then disabled and a line below it names the tier. Services in use carry an "In use" tag in the side list.

A fresh installation starts with Google Translate and Microsoft Translator added. The dictionary and Bergamot need data that you download, so they are added by hand. When settings from version 1.1 or earlier are loaded, a service counts as added in these cases:

| Service | Counts as added when |
| --- | --- |
| Google Translate, Microsoft Translator | always |
| DeepLX | an endpoint is filled in |
| AI services that need a key | an API key is saved |
| Ollama, LM Studio, custom OpenAI-compatible | the endpoint, model or temperature was changed |
| the services of the tiers | always |

## Translation tiers

| Tier | Services | What it gives |
| --- | --- | --- |
| 1 Dictionary | Dictionary (offline) | a word-by-word gloss from the installed dictionary packs, available at once and without network |
| 2 Machine translation | Google Translate, Microsoft Translator, DeepLX, Bergamot (offline) | a full translation within a second or two |
| 3 AI translation | the 22 AI providers | the best translation, following the prompt of the display mode |

Each tier has one service or "Not used", and at least one tier has a service. The default is Google Translate in tier 2 and nothing else.

Every paragraph goes to all tiers in use at the same time. Each tier uses the normal batching and cache. What the message shows follows one rule: the highest tier that has answered wins.

| Case | What the message shows |
| --- | --- |
| A lower tier answers first | its translation, in italics with a tag naming its tier ("Dictionary", "Machine translation"); hovering says which tier is still running. A higher tier replaces it when it arrives. |
| The highest tier in use answers | its translation, without a tag: the final translation. Lower tiers that answer later are ignored. |
| The highest tier fails | the best lower translation stays, marked "AI translation failed" (or the name of the highest tier); hovering shows the reason, clicking retries only the failed tiers |
| Every tier fails | the red "Translation failed, click to retry" marker |
| The highest tier's translation is already cached | that translation at once; the lower tiers are not asked |

Switching the display mode re-renders the dictionary and machine translations as they are. The AI tier uses one prompt per display mode, so it is asked again with the prompt of the new mode; a translation already cached for that prompt comes back without a request. The popup counts final translations as translated and lower-tier translations as provisional.

Settings saved by version 1.3 and earlier are converted once: an AI service as current service becomes tier 3, together with the fast service of race translation as tier 2 when race translation was on; any other current service becomes tier 2. The dictionary tier starts unused.

## Source language

The source language is "Detect automatically" by default, or one of the 20 languages of the target language list. It goes to every service:

| Service | Automatic detection | Fixed language |
| --- | --- | --- |
| Google Translate | `sl=auto` | `sl=<code>` |
| Microsoft Translator, free and with key | no `from` parameter | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (Chinese variants as `ZH`) |
| AI services | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Dictionary | detected per paragraph | the language as set |
| Bergamot | detected per paragraph; the paragraphs of each language are translated together | the language as set |

Paragraphs detected as the target language are skipped as before. With Chinese as the target language, a paragraph also has to be written in the target's standard: a Simplified Chinese paragraph is translated when the target is Traditional Chinese, and the other way round. Characters that exist in one standard only (们/們, 这/這, 说/說…) decide; a paragraph without such characters reads the same in both and is skipped. With a fixed source language, paragraphs whose language cannot be detected reliably count as that language. Cache keys and batches contain the source language, so changing it never returns translations made for the old setting.

The dictionary and Bergamot do not translate between Simplified and Traditional Chinese. Both would go through English and return English glosses in Chinese word order, for example 我们明天开会 as 我們明天持有一個會議. A paragraph in the other Chinese standard therefore fails in these two tiers with "This service does not translate between Simplified and Traditional Chinese.", shows no provisional translation from them, and is translated by the machine and AI tiers. The setup guide recommends no dictionary packs for this pair.

## Prompts

The AI tier has three system prompts. Each can be edited on the settings page and restored with "Restore built-in prompt". The settings store only prompts you changed: an unchanged prompt is stored as empty and stands for the built-in text, which the box shows, so a later version of the extension brings its improved built-in prompts to you. "Restore built-in prompt" and a box whose text equals the built-in prompt both store empty. Copies of a built-in prompt saved by earlier versions are recognised and cleared when the settings are read, and the settings are written back in this form at once. `{{to}}` is replaced by the English name of the target language. The extension adds the source language and the batch format to every request itself.

| Prompt | Used for | Built-in prompt asks for |
| --- | --- | --- |
| Bilingual display | the AI tier in bilingual mode | a translation close to the original, sentence by sentence in the same order, adding and dropping nothing, since the reader compares it with the original |
| Translation-only display | the AI tier in translation-only mode | fluent text that reads as an email written in the target language; clauses may be reordered and sentences split or joined, with the complete meaning kept |
| Precise translation | the AI tier while precise translation is on, in both display modes | consistent terms, names and forms of address across the message, using the glossary, the summary and the neighbouring paragraphs |

Cache keys and batch keys contain the kind of prompt and a hash of its text. Editing a prompt therefore never returns translations made with the old text. A custom system prompt saved by version 1.3 or earlier becomes the prompt of both display modes; the precise prompt starts with its built-in text.

### Prompt presets

The preset library sits above the three prompts on the settings page and in step 7 of the setup guide. Choose a preset, a variant where the preset has variants, and the prompt to add it to, then click "Apply preset". The line "Example" shows a source sentence and the expected result of the chosen preset.

| Preset | Variants | Rule added to the prompt |
| --- | --- | --- |
| Plain (no added rules), the first entry | none | none: applying it removes every block that a preset added to the prompt and keeps the text you wrote; a prompt that is then the built-in one is stored as empty again |
| Dialect or regional usage | by target language: Cantonese (Hong Kong) and Sichuanese for Simplified Chinese; Cantonese (Hong Kong) and Taiwan usage for Traditional Chinese; British and American English; Brazilian and European Portuguese; Mexican Spanish and Spanish of Spain; Canadian French (Quebec); Swiss Standard German | write in that variety, with its spelling, vocabulary and forms of address |
| Difficult words with the original | none | translate normally and put the original term in parentheses after each difficult word or technical term, once per paragraph, for example 尽职调查（due diligence） |
| Explanations of difficult words | none | translate the paragraph, then explain its difficult words in the target language at the end of the same paragraph in one bracket: 〔Note: term: explanation; …〕 |
| Writing style | formal business, casual, plain language for learners, literary | use that register and keep the complete meaning |

The variant list follows the target language. A target language without varieties, such as Japanese, does not offer the dialect preset.

A preset adds a block of English rules to the end of the prompt, after a blank line. The block starts with a heading such as `Style (this rule takes precedence over the rules above):`, so it overrides general rules of the built-in prompt such as "Do not add explanations". Applying the same preset again replaces its block; different presets add up. The prompt box shows the combined text and stays editable, and "Restore built-in prompt" removes every addition.

The presets keep one translation per paragraph. The explanations of difficult words stay inside the translation of their paragraph, and the block forbids returning them as a separate paragraph or array element, so a batch still comes back as a JSON array (or numbered segments) with exactly one entry per paragraph. The tests apply all four presets to one prompt and parse the answer of a mocked model in both formats.

## Precise translation

Precise translation applies to the AI tier and sends the message as context with every AI request. It is turned on in the popup or in the "Translation tiers" section of the settings page. When translation starts, the content script joins the paragraphs it found into the plain text of the message (cut after 20,000 characters, with a note that the text continues) and registers it with the background script once. The message is identified by a hash of its full text; the cut applies only to the text sent as context.

The flow depends on the size of the paragraphs to translate:

1. If they fit into one request (within "Max characters per request" and "Max paragraphs per request"), one request translates all of them; the request itself carries the whole message.
2. Otherwise one extra request first analyzes the whole message and returns a summary of two to three sentences, a glossary of names, products and other proper nouns with the translation to use, and the tone and form of address. If this answer cannot be read, translation goes on without it, and the message is not analyzed again. If the request fails (network error, timeout, HTTP error), translation also goes on without it, and the next translation of the message asks again.
3. Every request then starts with the same prefix: the system prompt, the analysis and, for messages up to about 8,000 characters, the full text. After the prefix come the paragraphs of the batch, each with the paragraph before and after it as reference that is not translated.

The prefix is identical, character for character, for every request of one message, so providers that cache repeated prompt prefixes can serve it from their cache. For Anthropic the prefix is marked with `cacheControl: { type: "ephemeral" }`. The analysis is cached like translations, keyed by provider, model, source and target language, the hash of the request configuration (endpoint, prompt, thinking switch, temperature) and the hash of the message text; batches of one message wait for the same analysis request.

Translations made in precise mode are cached under a key that contains the message hash, and batches never mix paragraphs of different messages. The same sentence in another message is therefore translated again, with that message as context. The analysis request and the longer prompts make precise translation more expensive than normal translation.

## Dictionary translation

The dictionary service translates word by word with dictionary packs stored in the Thunderbird profile. It needs no network once a pack is installed, and it answers within milliseconds, so it fills the time until the machine and AI tiers answer. The result is a gloss: words in the source order, without grammar.

### Packs

The packs are published as assets of a GitHub release of this repository, by default the release `dicts-v1`. The release tag can be changed under "Release tag of the dictionary packs (advanced)" in the Dictionaries section. Each direction is one file `dict-<src>-<tgt>.tsv.gz`, a gzip-compressed UTF-8 text file:

```text
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
w	<key>	<translation>
f	<key>	<lemmaKey>
```

The first line describes the pack. Lines starting with `w` are entries, lines starting with `f` map an inflected form to the key of its lemma, for example `went` to `go`. A key is NFC-normalized, lower-cased with the rules of the source language and trimmed; it may be a phrase of several words. The index `dict-index.json` lists every pack with size, number of entries and forms, SHA-256 checksum, source, license and attribution. The packs cover English, Simplified and Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Turkish and Vietnamese. [docs/dictionary-packs.md](docs/dictionary-packs.md) describes how they are built.

The Dictionaries section reads the index and lists every pack with its size, license and attribution. "Download" fetches the file with a progress display and a "Cancel" button, checks its SHA-256 checksum and its header, and stores it in the IndexedDB database `tt-dictionary` of the extension; "Delete" removes it. If the index cannot be loaded, the section says why, and installed packs can still be deleted. The index fails after 30 seconds without an answer. A download that receives no data for 30 seconds stops with an error; a slow download that keeps receiving data has no time limit.

### Translation

1. The source language is the one set, or with automatic detection the language of the paragraph (script, browser detector, English stop words).
2. `Intl.Segmenter` splits the paragraph into words. At each word, the longest phrase of up to three words with an entry wins, then the single word. A word without an entry is looked up through its lemma; if that fails too, it stays as it is. Punctuation and numbers stay as they are.
3. For Chinese and Japanese targets the words are joined without spaces, for other targets with spaces.
4. Between two languages other than English, the text goes through English: French to German uses the packs French → English and English → German.
5. When a needed pack is missing, the error names the language pair and points to the Dictionaries section.

The background script reads a pack from IndexedDB on first use and keeps it in memory; after five minutes without dictionary translations it releases the memory.

### Data sources

The packs are built from Wiktionary, extracted by wiktextract and published by kaikki.org (CC BY-SA 4.0, © Wiktionary contributors), and from ECDICT by skywind3000 (MIT License). Each pack names its own source and license in the index, and the settings page shows them next to the pack.

## Offline translation (Bergamot)

The Bergamot service translates on your computer with the engine and the models of Firefox Translations, published by Mozilla under MPL-2.0. The engine ships with the extension; each translation direction is downloaded once from Mozilla, 13 to 48 MB, and stored in the extension's IndexedDB. A loaded direction takes about 200 MB of memory and is released after five minutes without use. Every model has English on one side, so Japanese to Chinese uses Japanese → English and English → Chinese.

The section "Offline translation models (Bergamot)" of the settings page lists the 114 direction pairs among 58 languages with size and version, in the order described under [Offline lists](#offline-lists). It names the directions the current source and target language need. Downloads show their progress and can be canceled; the model list fails after 30 seconds without an answer, and a download that receives no data for 30 seconds stops with an error; an installed pair with a newer version offered by Mozilla shows "Update". Deleting a pair that the current languages need asks for confirmation. Installation, translation and removal run in the background script, where the engine lives. [docs/bergamot.md](docs/bergamot.md) describes model selection, verification, storage and the engine.

## Offline lists

The dictionary list and the Bergamot list, on the settings page and in step 4 of the setup guide, show every direction of their catalog and the installed ones. A filter field takes language names or directions such as `ja>en`; several terms are separated by commas.

The directions of the recommended languages come first. A recommended language comes from one or more of these sources, in this order of importance:

1. the target language;
2. the source language, when it is fixed;
3. the interface language of the extension ("Follow Thunderbird" counts as Thunderbird's language);
4. Thunderbird's interface language;
5. the system languages (`i18n.getPreferredSystemLanguages()`; Thunderbird versions without it use the locale of the `Intl` formats).

For every recommended language X other than English, the directions X → English and English → X are recommended, and for the dictionary also the direct packs between X and the target language when the release has them. Each recommended row carries its sources as labels, plus "Direct" for a direction into the target language and "Via English" for one into English that serves the route through English. The other directions follow by name.

"Download common languages" downloads the directions to and from English of eight fixed languages: Simplified Chinese, Spanish, French, German, Japanese, Portuguese, Russian and Korean, as far as the catalog has them. Before downloading it lists the directions and their total size; installed directions are left out. When all are installed, the button is disabled and says "The common languages are all installed.".

## Missing offline data

The rule for what a language pair needs is the same everywhere:

| Service | Pair with English on one side | Pair without English |
| --- | --- | --- |
| Dictionary | the direct pack | the direct pack when the release has it, otherwise source → English and English → target |
| Bergamot | the direct direction | source → English and English → target |

Simplified ↔ Traditional Chinese and pairs whose directions the catalog does not offer are unsupported: there is nothing to download, and the paragraphs go to the other tiers.

When the dictionary tier or Bergamot in the machine tier fails for paragraphs of a message because a pack or model is missing, a notice appears above the message once the first translation round has finished. It appears once per message and only for the offline tiers in use. It lists one line per service and language pair, for example "Dictionary: Japanese → Simplified Chinese, missing Japanese → English and English → Simplified Chinese", and has three controls:

- "Download in settings" opens the settings page with both offline lists filtered to the missing directions.
- "Don't remind me for these languages" mutes the listed entries, per service and language pair. The muted entries are listed under "Translation tiers" on the settings page, and "Remind me again" brings them back.
- "Close" removes the notice.

Paragraphs whose language was only guessed, network errors and unsupported pairs do not count. The paragraphs still get the translations of the other tiers; with only offline tiers in use they stay failed.

In the popup and on the settings page, a selected dictionary or Bergamot that lacks what the current languages need reads "Dictionary (local model not downloaded)" or "Bergamot (local model not downloaded)" in red, and a line under the tier lists names the missing directions with a "Download" link to the filtered lists. With automatic detection the direction from English into the target language counts; for English as target, at least one direction into English. An unsupported pair is named on that line without red. The marks follow installations and deletions made on other pages.

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
| Dictionary (offline) | Download language pairs in the Dictionaries section | Word-by-word translation with the installed packs, see "Dictionary translation" |
| Bergamot (offline) | Download direction pairs in the "Offline translation models" section | Translation on your computer with Mozilla's models, see "Offline translation (Bergamot)" |
| Microsoft Translator (free) | None | Calls `edge.microsoft.com/translate/translatetext`, the endpoint the Edge browser uses; the request body is an array of paragraphs. The panel option “Use my key (Azure Translator)” calls the official `api.cognitive.microsofttranslator.com` instead: create a Translator resource in the Azure portal, then copy its key and region from Keys and Endpoint into the panel (the region can stay empty for a global resource). |
| DeepLX | Endpoint required | A self-hosted or third-party DeepLX service; the token is optional. If the endpoint contains `{{apiKey}}`, the token replaces it; otherwise it is sent as `Authorization: Bearer` |

### AI providers

All AI providers are called through `generateText` of the Vercel AI SDK. Providers with an official `@ai-sdk/*` package use that package; the others use `@ai-sdk/openai-compatible`. Endpoint, API key, model and temperature can be changed for every provider. The model field suggests common models and also accepts any model name.

| Provider | SDK package | Default endpoint | Default model | Key required |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Yes |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Yes |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Yes |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Yes |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-4.3` | Yes |
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
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-mini-260428` | Yes |
| Azure OpenAI | `@ai-sdk/azure` | Must be filled in | `gpt-4.1-mini` | Yes |
| LM Studio (local) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | No |
| Custom OpenAI-compatible | `@ai-sdk/openai-compatible` | Must be filled in | Must be filled in | No |

Some providers have extra requirements:

- Anthropic Claude: the extension adds the header `anthropic-dangerous-direct-browser-access: true`, which Anthropic requires for requests from a browser context. The Claude 5 series and Opus 4.7 and 4.8 reject a custom temperature, so the extension sends no temperature for these models, and the temperature field of the default model is empty.
- Azure OpenAI: the endpoint is `https://<resource>.openai.azure.com/openai`, and the model field takes the deployment name.
- Ollama: by default Ollama rejects cross-origin requests from extension pages. Start Ollama with the environment variable `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: the default endpoint is the China site `api.moonshot.cn`; accounts on the international site use `https://api.moonshot.ai/v1`.
- Volcengine Doubao: the model field takes either a model name or the ID of an inference endpoint created in the Ark console.

### Thinking mode

Each AI provider has a "Thinking mode" switch, off by default. Translation does not need the model to reason first, and reasoning makes requests slower and more expensive. Several current models reason unless told otherwise, for example `deepseek-flash`, `claude-haiku-5-5` and `gemini-2.5-flash`, so "off" is sent explicitly.

Every provider spells the switch differently, and within one provider only some models accept it. The extension matches the model name against the patterns below and sends the provider options of the first match; a model without a match gets no thinking parameter. While thinking is on, no temperature is sent for models that match a pattern in the table, because reasoning models ignore or reject it.

| Provider | Models | Off | On | Source |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` and later | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
| | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | same |
| | `o1`, `o3`, `o4-mini` … | `"low"` (cannot be turned off) | `"medium"` | same |
| Anthropic | Claude 5 series, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
| | Claude 3.7 and 4.x | nothing (off by default) | `{ type: "enabled", budgetTokens: 1024 }` | same |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }` (minimum, cannot be turned off) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
| | other `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | same |
| | Gemini 3 and later | `{ thinkingLevel: "low" }` (no full off) | `{ thinkingLevel: "high" }` | same |
| DeepSeek | all | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
| | `grok-4.5`, `grok-4.6`, `grok-4.7` | `"low"` (cannot be turned off) | `"high"` | same |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"` with `reasoningFormat: "parsed"` | [Groq reasoning](https://console.groq.com/docs/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | same |
| Mistral AI | all (the SDK sends it only for models that accept it) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | same |
| DeepInfra | all (ignored by models without reasoning) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | same |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
| | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | same |
| DashScope | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | all | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | models that always reason (`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro and 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| | all others (ignored by models without reasoning) | `{ enabled: false }` | `{ enabled: true }` | same |
| Zhipu GLM | GLM-4.5 and later | `zhipu.thinking: { type: "disabled" }`; nothing for GLM-5.3, which rejects it | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5+, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| Volcengine Doubao | Seed and thinking models | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark documentation](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio and custom OpenAI-compatible services have no documented thinking parameter on the endpoint the extension uses. Their switch is disabled, and the settings page says so.

For OpenAI-compatible presets (Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao) the options are written under the preset ID, and `@ai-sdk/openai-compatible` copies them into the request body as they are; `reasoningEffort` is the one key it renames, to `reasoning_effort`.

## How batching works

A message usually has between ten and a few dozen paragraphs. With one request per paragraph, every paragraph carries its own copy of the system prompt and instructions, and every paragraph uses one request from the rate limit. Batching merges paragraphs that arrive close together into one request, so both costs are paid per batch instead of per paragraph.

### Flow

1. The content script hands every paragraph to be translated to the background script, once for all tiers in use.
2. For each tier the background script looks up the cache first and answers directly on a hit. The cache key consists of the provider, the model, the source and target language, one hash of everything else that shapes the result, and a hash of the paragraph text. That hash covers the endpoint and, for Microsoft Translator, free or key mode; for AI services the kind of prompt and its text, the thinking switch and the temperature; for the dictionary and Bergamot the installed packs or models and their versions; in precise mode the message is added. Changing any of these never returns a translation made with the old setting. When the same text is already being translated, later requests share the same result; a request that failed or timed out is dropped, and the next request starts a new one.
3. Paragraphs not in the cache enter the batch queue, grouped by provider + model + endpoint + source language + target language; AI services are also grouped by prompt, thinking switch and temperature, Microsoft Translator by free or key mode, and in precise mode by message. Paragraphs of one group accumulate for 50 ms. A group is sent when the window ends, when the paragraph limit is reached, or when the next paragraph would exceed the character limit. A paragraph longer than the character limit is split into pieces that fit. A piece takes whole lines, line breaks included, as long as they fit; when the next line does not fit, the piece ends at its last line break. A single line longer than the limit is cut between sentences (`Intl.Segmenter`), a sentence longer than the limit by length. Whitespace at the start of the paragraph is not sent and is put back in front of the translation. The pieces are translated like paragraphs and joined in their order: with the line break where they were cut at one, otherwise with a space (none for Chinese and Japanese). A quoted reply of 60 lines and 3,900 characters, for example, goes out as two pieces cut at a line break with the default limit of 3,000 characters, instead of 60 one-line requests. The cache holds the whole paragraph.
4. Each service has its own request queue, so a slow AI service never holds back the dictionary or the machine translator. The queue limits the concurrent requests of its service and retries 408, 429, 5xx and network errors with exponential backoff, up to the number of retries in the settings; when the server sends `Retry-After`, it waits for that time, up to 30 seconds. Errors such as 401 and 400 are reported without retrying. A request whose answer, body included, has not arrived after the request timeout is cancelled. What follows depends on the service:

   | Service | Timeout | After a timeout |
   | --- | --- | --- |
   | Google, Microsoft, DeepLX | the request timeout of the settings (60 seconds by default) | one more attempt; the error names the time of both attempts, for example "no answer within 120 s" |
   | AI services, including the analysis of precise translation and "Test connection" | the request timeout; three times as long for Ollama, LM Studio and any model with thinking mode on | no further attempt: a model that was too slow once is too slow again, and every attempt is charged; the error names the time waited, for example "no answer within 180 s" |

   Every timeout error comes with a hint to raise the timeout. The offline Bergamot engine terminates its worker when a translation does not answer within 2 minutes, or loading a model within 5 minutes; the next request starts a fresh one. After two timeouts in a row, offline translations fail at once for one minute with a message saying so, instead of each waiting for its own timeout.
5. Results go to the in-memory cache and are written to `storage.local` in one write after 1 second. The cache evicts the least recently used (LRU) entries.

### How each service merges paragraphs

- Dictionary and Bergamot: the whole batch is translated in one local call, and every paragraph gets its own result: a paragraph whose language has no pack or model fails alone. With automatic detection, Bergamot detects the language of each paragraph and translates the paragraphs of each language together; a paragraph too short for the detector takes the language found most often in the batch, else English.
- Google: one POST with several `q` parameters; the returned array matches the input one to one. When the answer has an unexpected shape, the batch is requested again one paragraph per request through the same request queue, with its concurrency limit and retries; a failure then affects its paragraph only.
- Microsoft: the request body itself is an array.
- DeepLX: the endpoint accepts one paragraph per request, so the paragraphs of a batch are requested concurrently.
- AI providers: the paragraphs are numbered and put into one message, and the model is asked to return a JSON array of the same length. The parser tries, in order: a JSON array (possibly inside a code block or surrounded by explanations; bare newlines inside strings and trailing commas are repaired), numbered `<seg>` blocks, numbered lines, and the `%%` separator. If all of them fail, the count does not match, or a translation is empty while its paragraph has letters or digits, that batch is sent again one paragraph per request, and the user sees the same result. Errors other than parsing errors, such as authentication failures, do not trigger this fallback, so the same error is not repeated N times.

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
- The content script runs inside the message page; the settings it receives from the background script contain neither keys nor endpoints, since an endpoint can hold a token.
- Error messages mask what may be a secret: the API key or token of the service wherever it appears, URL path segments that look like a token (20 or more characters with letters and digits), user names and passwords in URLs, and URL parameters whose names contain key, token, auth, secret, sig, pass, credential or session. The masked parts read `***`.
- Message text is sent only to the services of the tiers in use. The dictionary and Bergamot translate on your computer and send no text anywhere. The settings page and the setup guide read the list of dictionary packs from this repository's GitHub releases and the list of Bergamot models from Mozilla; the packs and models themselves are downloaded only when you click "Download". None of these requests carries message text. The extension collects no statistics and contacts no other network address.
- The translation cache is stored locally and can be turned off or cleared on the settings page.
- With Google, Microsoft, DeepLX or an online AI service, message text leaves your computer. For sensitive mail, use only the dictionary, Bergamot and local AI models such as Ollama or LM Studio, which keep every request on your own machine.

## Known limitations

- Translations are plain text. Links, bold text and other inline formatting of the original are not kept in the translation. In bilingual mode the original stays fully usable; in translation-only mode you can hover to see the original or switch back to bilingual.
- The free Google and Microsoft endpoints are undocumented and may change or be rate-limited. Microsoft retired the token endpoint `edge.microsoft.com/translate/auth` in July 2026; the extension uses only the direct endpoint.
- To decide whether a paragraph is already in the target language, Chinese, Japanese, Korean and similar scripts are judged by character class, and Latin- and Cyrillic-script languages first use `i18n.detectLanguage` of the extension API. When that API is unavailable or its result is unreliable, only English is detected reliably; paragraphs in other Latin-script languages are sent for translation as usual.
- The content script is registered through `messageDisplayScripts` and reaches only messages opened after registration. On startup the extension tries to inject it into messages already open; if that fails, selecting the message again is enough.
- Error messages produced by the extension are translated. Error texts returned by a translation service or by the AI SDK (for example the body of an HTTP 401 response) are shown as received, usually in English.
- The extension name, its description in the Add-ons Manager and the shortcut descriptions follow Thunderbird's interface language, not the interface language option.
- Precise translation identifies a message by a hash of its body text, because the content script has no access to the message ID. Two copies of the same text share their translations and their analysis.
- Prompt caching is up to the provider. Anthropic caches only prefixes above a minimum length that depends on the model; shorter prefixes are sent and billed normally.
- The thinking switch works by matching model names. A new model whose name matches none of the patterns gets no thinking parameter until the table in `src/background/providers/thinking.ts` is extended.
- Every tier in use sends its own requests. With the AI tier and the machine tier both in use, each message also costs requests to the machine translator, which count against the rate limits of the free Google and Microsoft endpoints.
- Dictionary translation is a word-by-word gloss: it keeps the word order of the source and does not inflect. Words outside the packs stay untranslated.
- The sample message of the setup guide is in English, or in German when the target language is English. With a fixed source language other than these two, the trial still sends that source language with the English text.
- Alt+A pressed while the setup guide is the active tab translates or restores the sample message; the label of the trial button then does not follow.
- The presets are instructions to the model. How closely a dialect or style is followed depends on the model; small models mix regional varieties more often.
- With automatic detection, Bergamot gives a paragraph too short for the detector (fewer than 12 letters) the most frequent language of its batch. A short paragraph in another language than its neighbours is therefore translated as theirs.
- Simplified and Traditional Chinese are told apart by a table of 83 frequent characters. A paragraph that uses none of them counts as already in either Chinese target.
- The dictionary and Bergamot do not convert between Simplified and Traditional Chinese; with one of them as the only tier in use, a paragraph in the other standard stays untranslated.

## Tests

```bash
npm test               # vitest unit tests
npm run test:coverage  # unit tests with coverage; fails below the thresholds in vitest.config.ts
npm run e2e            # headless Thunderbird (THUNDERBIRD_BIN) against a local mock server: three tiers, mode switch, restore, retranslation; offline downloads of the setup guide
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules, with and without a source language
```

The unit tests cover batch grouping and queues, AI output parsing and fallback, paragraph detection with bilingual and translation-only rendering and restoring (in jsdom), request building and response parsing for Google, Microsoft and DeepLX (with a mocked fetch), the request URL and authentication headers of every AI preset, the thinking parameters of every provider, the migration of settings to added services and to tiers and prompts, the popup and settings page tier lists, the refusal of all-empty tiers and the removal protection, the tiers (lower tier first and replaced, highest tier first with later lower results ignored, highest tier failing with the lower result kept, all tiers failing, unused tiers, cached highest tier), prompt selection and cache keys, a display mode switch that asks the AI tier again and only re-renders the others, the source language in the requests of every service and in the cache key, dictionary packs (parsing, word splitting and phrase matching, inflected forms, translation through English, missing packs, download with checksum, with an in-memory IndexedDB), the Bergamot service and its model management with a mocked engine, precise translation (single request, analysis with batches, failed analysis, cache keys and batches per message, identical prompt prefix with Anthropic cache control), the setup guide (opening only on a new installation, step navigation with skipped steps and resuming, saving of every step, recommended dictionary packs and Bergamot directions and their download, service configuration and connection test, presets on the prompts, the trial translation through the content script modules), the prompt presets (variants by target language, composition with each of the three prompts, replacement of the same preset, batch parsing with every preset applied), and localization: identical key sets and placeholders in all languages, every `__MSG_*__` reference in the manifest, mapping of Thunderbird languages to supported languages, fallback to English for missing keys, and the absence of hard-coded interface text in the HTML pages and sources. The service tests run on the production path `translateForPage()`: tiers side by side with separate request queues, timeouts, the failure of a single paragraph, batches that mix languages, and paragraphs longer than a batch.

`npm run e2e` runs three scenarios, each in its own headless Thunderbird on a temporary profile, and stops only the processes it started:

| Scenario | What it checks |
| --- | --- |
| HTML message | paragraph detection, the order dictionary → Google → AI for every paragraph, provisional and final translations, the switch to translation-only (only the AI tier is asked again), restoring the original DOM, translating again from memory without any request, and Alt+R: every tier is asked again although everything is cached, and the new AI translation is shown |
| Plain-text message | the same for a plain-text message with a quote |
| Offline downloads of the setup guide | Thunderbird starts without a message and opens the setup guide; the test goes to the offline step, downloads the dictionary pack and the Bergamot model from the mock server with progress, checks that both are stored and deletes them again |

`npm run build:debug` produces a debug xpi that starts translating as soon as a message is opened and writes progress to the console, for checking the whole flow in a real Thunderbird.

## Project structure

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators, dictionary, offline model management
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page and the parts the setup guide shares: service fields, dictionary and Bergamot lists, prompt editor, settings session
  welcome/       setup guide: steps and navigation
  offline/       Bergamot engine module: model list, download, storage, worker
  shared/        shared settings, provider presets, prompts, language table and detection, message types, i18n runtime
  e2e/           hooks of the e2e test build (left out of every other build)
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, Bergamot engine download, locale generation and checks, live endpoint test
vendor/          Bergamot engine glue script (bergamot-translator.js)
tools/           dict-build: the pipeline that builds the dictionary packs
readmes/         translated versions of this README
docs/            developer notes on Bergamot and the dictionary packs, demo GIF used in this README
tests/           vitest tests
e2e/             end-to-end test in a real Thunderbird: runner, mock server, fixture messages
.github/         workflows: build and release, dictionary packs
```

## Translating the interface

Interface text lives in `locales/<language>.json`, one flat object of key → text per language. `locales/en.json` is the reference: every other file has exactly the same keys. `$1` to `$9` are substitutions and must appear in each translation with the same numbers as in English; `{{apiKey}}` and `{{to}}` are literal tokens and stay unchanged. Product names such as Google Translate, OpenAI or DeepLX are not translated.

`npm run build` converts these files into `dist/_locales/<language>/messages.json`, the format Thunderbird reads. The extension's own i18n runtime loads the same files at run time, so the interface language can change without restarting Thunderbird. Missing keys fall back to English.

To add a language, create `locales/<code>.json` with all keys, add the code to `SUPPORTED_LOCALES` in `src/shared/locales.ts` together with its native name, and run `npm run locales:check` and `npm test`.

## Acknowledgements

The design of paragraph detection, the batch queue, the prompts and the provider configuration follows [Read Frog](https://github.com/mengxi-ream/read-frog), a browser extension for translating web pages released under GPL-3.0. This project carries these ideas over to Thunderbird's message reader and adapts them to email, for example splitting plain-text mail at blank lines and joining hard-wrapped lines.

Dictionary data comes from [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors, CC BY-SA 4.0), extracted by [wiktextract](https://github.com/tatuylonen/wiktextract) and published by [kaikki.org](https://kaikki.org/), and from [ECDICT](https://github.com/skywind3000/ECDICT) by skywind3000 (MIT License). Offline translation uses the [Bergamot](https://browser.mt/) engine and the translation models of Firefox Translations, published by Mozilla under MPL-2.0.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
