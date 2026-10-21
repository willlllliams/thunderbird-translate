# Multi Translate for Thunderbird

Multi Translate for Thunderbird is a Thunderbird extension that translates the body of the message you are reading, directly in the message pane. It works right after installation with the free Google Translate. Up to version 1.13 it was called Thunderbird Translate.

English | [简体中文](readmes/README.zh-CN.md) | [繁體中文](readmes/README.zh-TW.md) | [日本語](readmes/README.ja.md) | [한국어](readmes/README.ko.md) | [Français](readmes/README.fr.md) | [Deutsch](readmes/README.de.md) | [Español](readmes/README.es.md) | [Português (Brasil)](readmes/README.pt-BR.md) | [Русский](readmes/README.ru.md) | [Türkçe](readmes/README.tr.md) | [Tiếng Việt](readmes/README.vi.md)

![Dictionary, machine translation and AI translation arriving in turn](docs/media/tiers-en.gif)

Video: [YouTube](https://www.youtube.com/watch?v=OZmiMGeuhJ0) (1 min) · [Bilibili](https://www.bilibili.com/video/BV1JaWw6YENX) (2 min)

## Contents

- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Translation tiers](#translation-tiers)
- [Translation services](#translation-services)
- [Prompts](#prompts)
- [Privacy](#privacy)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Features

- Translates paragraphs, list items, table cells, headings and quotes of HTML mail, and blank-line separated paragraphs of plain-text mail. Code, numbers, bare links and paragraphs already in the target language are skipped.
- Two display modes: bilingual (the translation under each original paragraph) or translation only, both showing the bold text, lists and links of AI translations formatted. Turning translation off restores the original message exactly.
- Three translation tiers run at the same time: an offline dictionary, a machine translator and an AI service. The fastest result appears first, and the highest tier replaces it.
- Machine translation without an account (Google Translate, the default, and Microsoft Translator), or with a key of your own (DeepL, Baidu, Youdao, Caiyun).
- Offline translation with dictionary packs and Mozilla's Bergamot models; no text leaves your computer.
- 22 AI provider presets, including OpenAI, Claude, Gemini, DeepSeek, Qwen, local Ollama and LM Studio, and any OpenAI-compatible service.
- Precise translation: the AI tier sees the whole message, so names and terms stay consistent. With it, an AI service can read the text in the images of a message and show the original and its translation under each image.
- Summary and to-dos: an AI service lists the summary, the to-dos, the questions to answer and the dates of a message in a panel above it. The "Automatic summary" setting opens it without a click, when the message is translated or for every opened message. With precise translation, a message too long for one request needs an analysis before translation; when the summary uses the same AI service and model as the AI tier, one request writes the analysis and the summary.
- Three editable prompts with presets for regional varieties, writing styles and difficult words.
- Optional automatic translation of every message not in the target language.
- Interface in 12 languages and a setup guide that opens after installation.

## Install

1. Download the latest `thunderbird-translate-<version>.xpi` from the [Releases page](https://github.com/willlllliams/thunderbird-translate/releases).
2. In Thunderbird, open Tools → Add-ons and Themes (also in the ≡ menu in the top right corner).
3. Click the gear icon above the extension list, choose "Install Add-on From File", select the xpi file and confirm.

Thunderbird 128 or later is required. The `nightly` pre-release is an automatic build of the latest commit, meant for testing.

## Quick start

After installation the setup guide opens in a new tab. It asks one question per step: languages, display mode and translation style, the service of each tier (with a short demo of the result), offline downloads, service keys and prompts. Every choice is saved at once, and any step can be skipped. The last step translates a sample message with your settings. You can open the guide again from the "Setup guide" link in the popup or the button at the top of the settings page. Without changing anything, open a message and press Alt+A: Google Translate translates it.

## Usage

Open a message and click the "Translate message" button in the message header toolbar. The popup has these controls:

- "Translate this message" starts translating. While a translation is shown, the button reads "Show original".
- "Retranslate" asks every tier again and ignores the cache; "Summary and to-dos" shows the summary of the message above it.
- Display mode, source language ("Detect automatically" by default), target language, one service list per tier, precise translation with the mode of image translation (off, ask under each image, on; greyed out with a "Turn on precise translation" button while precise translation is off), and the switch "Automatically translate messages not in the target language".

| Shortcut | Action |
| --- | --- |
| Alt+A | Translate the message, or show the original |
| Alt+S | Switch between bilingual and translation only |
| Alt+R | Retranslate, ignoring the cache (only while the message is translated) |

The shortcuts can be changed under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager, where the summary gets a shortcut of your choice.

Bilingual mode puts each translation under its original paragraph. Translation-only mode replaces the original; hover over a translation to see the original text.

All other settings are on the settings page: the "Options" button of the extension in the Add-ons Manager. Changes are saved automatically, and hovering over a control shows what it does. Every setting is described in [docs/settings.md](docs/settings.md).

## Translation tiers

| Tier | Services | Speed | Quality | Offline | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 Dictionary | Dictionary | a few milliseconds | word by word, without grammar | yes | free; a few MB per language pair |
| 2 Machine translation | Google, Microsoft, DeepL, Baidu, Youdao, Caiyun, DeepLX, Bergamot | one to two seconds per message | complete and readable | Bergamot only | free; DeepL and Baidu have a monthly free quota, Youdao and Caiyun bill by characters after the trial credit of a new account; Bergamot downloads 13–48 MB per direction |
| 3 AI translation | 22 AI providers | a few seconds to a minute | the most natural; follows your prompts | local models only | billed per use to your API key; local models are free |

Each tier uses one service or "Not used"; at least one tier needs a service. The default is Google Translate in tier 2 and nothing else.

Every paragraph goes to all tiers in use at once. A lower tier's result appears first as a provisional translation, in italics and labelled with its tier. The highest tier in use replaces it with the final translation; if the highest tier fails, the provisional translation stays.

When a selected dictionary or Bergamot lacks the data for a message's languages, a notice above the message names what to download, with a link to the settings and a "Don't remind me for these languages" check box.

## Translation services

| Group | Services | What you need |
| --- | --- | --- |
| Free | Google Translate | nothing |
| | Microsoft Translator | nothing; optional "Use my key (Azure Translator)" mode with an Azure key and region |
| | DeepLX | the endpoint of a DeepLX server; token optional |
| With your key | DeepL API, Baidu Translate, Youdao, Caiyun | a key of your own account; Baidu and Youdao also an app ID |
| Offline | Dictionary | download language pairs in the Dictionaries section; a few MB each |
| | Bergamot (Mozilla) | download directions in "Offline translation models (Bergamot)"; 13–48 MB each, every model has English on one side |
| AI | 22 presets | an API key; Ollama, LM Studio and custom OpenAI-compatible services need none |

Get an API key: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). Local: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

Precise translation sends the whole message as context with every AI request and costs more; the thinking mode switch of each AI provider is off by default, because reasoning makes translation slower and more expensive. Endpoints, default models, Ollama's `OLLAMA_ORIGINS` setting and the thinking parameters are listed in [docs/providers.md](docs/providers.md).

## Prompts

The AI tier uses one of three prompts: bilingual display (close to the original), translation-only display (fluent text) and precise translation (consistent terms across the message). Each can be edited and restored with "Restore built-in prompt".

Presets add rules to a prompt: a regional variety such as British English or Taiwan usage, a writing style, the original term after difficult words, or short explanations of difficult words. Details are in [docs/settings.md](docs/settings.md#prompt-presets).

## Privacy

- Message text goes only to the services of the tiers in use. The dictionary and Bergamot translate on your computer. A summary, opened by a click or automatically, sends the whole message with its sender, date and subject to its AI service.
- Before the text of a message first goes to an online service, a panel above the message names the service and its address and asks once per service and address. Nothing is sent until you click “Allow and translate”; the settings page lists the allowed services and takes them back. With only the dictionary and Bergamot, nothing is asked.
- An image goes to an AI service only while precise translation is on: after a click on the button under it, or by itself when image translation is “On”. Before the first image, a panel under it asks once per service, apart from the text. The image is scaled down and encoded again, without its file name and metadata. Remote images are never translated.
- An endpoint you type (Ollama, LM Studio, DeepLX, a custom service, a changed endpoint) needs your permission to connect, given once with “Allow access” or “Test connection” in the settings.
- API keys are stored only in your Thunderbird profile and are sent only to the endpoint of their own service.
- Two lists come from the network, without any message text: the dictionary pack index from this repository's GitHub releases and the Bergamot model records from Mozilla. The settings page and the setup guide read them to show the offline lists. While the dictionary or Bergamot is selected in a tier, they are also read when Thunderbird starts, when the settings change and when the popup opens. Translating a message never reads them. The settings page and the setup guide also send the fixed sentence of "Test connection" to Google Translate (free) and Microsoft Translator (free), once per page and service, when they show the service as added, to tell whether this network reaches it.
- Packs and models are downloaded only when you click a download button. The translation cache is stored locally and can be turned off or cleared. The extension collects no statistics.
- For sensitive mail, use only the dictionary, Bergamot and local AI models (Ollama, LM Studio).

## Known limitations

- Links and inline formatting of the original are not carried into the translation. Bold text, lists and links appear in a translation only when an AI service writes them as Markdown; translations of the dictionary and of machine translation, and provisional translations, are plain text.
- The free Google and Microsoft endpoints are undocumented and may change or be rate-limited.
- The dictionary gives a word-by-word gloss in the source word order, and neither it nor Bergamot translates between Simplified and Traditional Chinese.
- Every tier in use sends its own requests, so the machine tier also counts against free rate limits when the AI tier is in use.
- Error texts returned by a service are shown as received, usually in English.

The complete list is in [docs/settings.md](docs/settings.md#known-limitations).

## Documentation

The documents below are in English, except dictionary-packs.md, which is in Chinese.

- [docs/settings.md](docs/settings.md): every setting, offline lists, missing-data notices and the cache.
- [docs/providers.md](docs/providers.md): endpoints, default models, thinking parameters and the models that read images, for every service.
- [docs/batching.md](docs/batching.md): how paragraphs are merged into requests, timeouts and costs.
- [docs/bergamot.md](docs/bergamot.md): the Bergamot offline engine, the choice and storage of its models, and its build.
- [docs/dictionary-packs.md](docs/dictionary-packs.md): data sources, format and build of the dictionary packs (in Chinese).
- [docs/development.md](docs/development.md): building from source, tests, project structure, translating the interface and the release process.

## Acknowledgements

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0): the design of paragraph detection, the batch queue, the prompts and the provider configuration.
- [Mozilla Bergamot](https://browser.mt/): the offline engine and the Firefox Translations models (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors): the dictionary packs other than English → Simplified Chinese are adapted (extracted, filtered and trimmed) from Wiktionary as extracted by [wiktextract](https://github.com/tatuylonen/wiktextract) and published by [kaikki.org](https://kaikki.org/); license CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>).
- [ECDICT](https://github.com/skywind3000/ECDICT), Copyright (c) 2025 Linwei, MIT License: the English → Simplified Chinese dictionary pack is adapted (extracted, filtered and trimmed) from it.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
