# Listing on addons.thunderbird.net

The texts below go into the fields of the listing on addons.thunderbird.net (ATN). The English listing is the default; a Simplified Chinese version is in [listing.zh-CN.md](listing.zh-CN.md). The screenshots are in `store/screenshots/`, the icons in `store/icons/`.

## Name

Multi Translate for Thunderbird

## Summary

At most 250 characters; this one has 249.

```text
Translate the message you read, in place: bilingual or translation only. Three tiers at once: offline dictionary, machine translation (Google, DeepL, Baidu, Bergamot…) and 22 AI services; AI summary and text in images. Data goes only where you pick.
```

## Description

```text
Your message text goes only to the translation services you choose. The online machine translators and the AI services receive the paragraphs and the subject of the message you translate (with precise translation, the whole message as context) and the subjects you translate on the page of translated subjects; the AI service of a summary you ask for receives the whole message with its sender and date. An image goes to an AI service only with precise translation on, after a click under it (or by itself if you turn image translation on), scaled down and without its file name or metadata; remote images are never sent. The extension asks once per service and address before it sends anything there, for images apart from text. The offline dictionary and the offline Bergamot models translate on your computer and send nothing. API keys stay in your Thunderbird profile and go only to their own service. The extension collects no statistics.

Multi Translate for Thunderbird translates the body of the message you are reading, directly in the message pane. It works right after installation with the free Google Translate, and you can add offline translation and AI services when you want them.

What it does
- Translates paragraphs, list items, table cells, headings and quotes of HTML mail, and the paragraphs of plain-text mail. Code, numbers, bare links and paragraphs already in your language are skipped.
- Shows the translation under each paragraph (bilingual) or in place of it (translation only). Turning translation off restores the original message exactly.
- Bold text, lists and links that an AI service writes in Markdown appear formatted. Only http, https and mailto addresses become links, and Thunderbird opens them as any link in a message.
- Translates the subject too, in a line above the body.
- The "Translated subjects" button in the main toolbar lists the messages of the current folder with their translated subjects; a click on a row shows the message.
- Runs up to three tiers at the same time: an offline dictionary, a machine translator and an AI service. The fastest result appears first as a provisional translation, and the highest tier replaces it. A tier that fails can be retried with a click.
- Machine translation without an account: Google Translate and Microsoft Translator (also with your own Azure Translator key), or your DeepLX server.
- Machine translation with your own account: DeepL API (free and Pro keys), Baidu Translate, Youdao and Caiyun.
- Offline translation: dictionary packs built from Wiktionary and ECDICT, and Mozilla's Bergamot models, the engine of Firefox Translations. Downloads run in the background, and a pack or model is used as soon as it is stored.
- 22 AI presets: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, xAI Grok, Groq, Mistral AI, OpenRouter, Together AI, Fireworks AI, DeepInfra, Cerebras, Perplexity, Moonshot/Kimi, Zhipu GLM, Qwen (DashScope), SiliconFlow, Volcengine Ark, Azure OpenAI, local Ollama and LM Studio, and any OpenAI-compatible service. Thinking mode and temperature per service, and a connection test.
- Precise translation: the AI service sees the whole message, so names and terms stay consistent.
- Summary and to-dos: an AI service lists the summary, who has to do what by when, the questions to answer and the dates of a message, in a panel above it, with "Copy as Markdown".
- Text in images: with precise translation, an AI service reads the text in the images of a message and shows the original and its translation under each image; of a chart only its labels. A button under each image (the default), every image by itself, or off.
- Three editable prompts with presets for regional varieties, writing styles and difficult words.
- Optional automatic translation of every message that is not in your language.

How to use it
- Open a message and click "Translate message" in the message header toolbar, or press Alt+A. The popup switches the display, the languages and the services of the three tiers.
- Alt+S switches between bilingual and translation only; Alt+R translates the message again past the cache.
- The first time a message would go to an online service, a panel above the message names the service and its address; nothing is sent until you click "Allow and translate".

How to set it up
- After installation a setup guide opens: languages, display, the three tiers, offline downloads, machine translation, AI service and prompts. You can skip any step.
- All settings are on the settings page (the "Options" button of the extension in the Add-ons Manager). An endpoint you type yourself, such as a local Ollama, needs your permission once: click "Allow access" or "Test connection".

Interface languages: English, 简体中文, 繁體中文, 日本語, 한국어, Français, Deutsch, Español, Português (Brasil), Русский, Türkçe, Tiếng Việt.

Requires Thunderbird 128 or later. Source code, documentation and issue tracker: https://github.com/willlllliams/thunderbird-translate
```

## Categories

Suggested: "Language Support" as the main category, and "Message and News Reading" as the second one.

## Tags

translate, translation, bilingual, ai, offline, deepl, deeplx, google translate, llm

## Links

| Field | Value |
| --- | --- |
| Homepage | https://github.com/willlllliams/thunderbird-translate |
| Support site | https://github.com/willlllliams/thunderbird-translate/issues |
| Support email | none; issues on GitHub |
| License | GNU General Public License v3.0 or later (GPL-3.0-or-later) |
| Privacy policy | the text of [privacy-policy.md](privacy-policy.md), pasted into the field |
| Requires payment | no; some AI services bill their own API keys, and the extension works without them |

## Screenshots

1280×800, in this order, each with the caption below:

| File | Caption |
| --- | --- |
| `store/screenshots/1-bilingual.png` | Bilingual display: the subject and each paragraph with its translation; the list and bold date of the AI translation appear formatted |
| `store/screenshots/2-translation-only.png` | Translation only: the subject and the message in your language |
| `store/screenshots/3-provisional-tiers.png` | The machine translation appears first, while the AI service is still working |
| `store/screenshots/4-popup.png` | The popup: display, languages and the service of each tier |
| `store/screenshots/5-settings-tiers.png` | Settings: languages, the subject line and the three tiers |
| `store/screenshots/6-setup-guide.png` | The setup guide compares the tiers |
| `store/screenshots/7-consent.png` | Nothing is sent before you allow it |
| `store/screenshots/8-subjects.png` | Translated subjects: the messages of the current folder with their subjects in your language |
| `store/screenshots/9-settings-markdown.png` | Settings: the translation style and Markdown in AI translations |
| `store/screenshots/10-summary.png` | Summary and to-dos: the summary, the to-dos with their owners and due dates, the questions to answer and the dates, in a panel above the translated message |

The message and the folder in the screenshots are invented; their names and addresses are examples. `tools/store-screenshots/shoot.mjs` renders the pages of the built extension with a stand-in for the Thunderbird API and takes the screenshots again after `npm run build`.

## Icons

`store/icons/icon-32.png` and `store/icons/icon-64.png` for the listing; `store/icons/icon-128.png` where a larger icon is asked for. They are rendered from `static/icons/icon-16.svg` (16 and 32 px) and `static/icons/icon.svg` (64 and 128 px).
