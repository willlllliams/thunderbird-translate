# Thunderbird Translate

Thunderbird Translate is a Thunderbird extension that translates the body of the message you are reading, directly in the message pane. It works right after installation with the free Google Translate.

English | [简体中文](readmes/README.zh-CN.md) | [繁體中文](readmes/README.zh-TW.md) | [日本語](readmes/README.ja.md) | [한국어](readmes/README.ko.md) | [Français](readmes/README.fr.md) | [Deutsch](readmes/README.de.md) | [Español](readmes/README.es.md) | [Português (Brasil)](readmes/README.pt-BR.md) | [Русский](readmes/README.ru.md) | [Türkçe](readmes/README.tr.md) | [Tiếng Việt](readmes/README.vi.md)

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
- Two display modes: bilingual (the translation under each original paragraph) or translation only. Turning translation off restores the original message exactly.
- Three translation tiers run at the same time: an offline dictionary, a machine translator and an AI service. The fastest result appears first, and the highest tier replaces it.
- Free services without an account: Google Translate (the default) and Microsoft Translator.
- Offline translation with dictionary packs and Mozilla's Bergamot models; no text leaves your computer.
- 22 AI provider presets, including OpenAI, Claude, Gemini, DeepSeek, Qwen, local Ollama and LM Studio, and any OpenAI-compatible service.
- Precise translation: the AI tier sees the whole message, so names and terms stay consistent.
- Three editable prompts with presets for regional varieties, writing styles and difficult words.
- Optional automatic translation of every message not in the target language.
- Interface in 12 languages and a setup guide that opens after installation.

## Install

1. Download the latest `thunderbird-translate-<version>.xpi` from the [Releases page](https://github.com/willlllliams/thunderbird-translate/releases).
2. In Thunderbird, open Tools → Add-ons and Themes (also in the ≡ menu in the top right corner).
3. Click the gear icon above the extension list, choose "Install Add-on From File", select the xpi file and confirm.

Thunderbird 128 or later is required. The `nightly` pre-release is an automatic build of the latest commit, meant for testing.

## Quick start

After installation the setup guide opens in a new tab. It asks one question per step: languages, display mode and translation style, the service of each tier (with a short demo of the result), offline downloads, service keys and prompts. Every choice is saved at once, and any step can be skipped. The last step translates a sample message with your settings.

You can open the guide again from the "Setup guide" link in the popup or the button at the top of the settings page. Without changing anything, open a message and press Alt+A: Google Translate translates it.

## Usage

Open a message and click the "Translate message" button in the message header toolbar. The popup has these controls:

- "Translate this message" starts translating. While a translation is shown, the button reads "Show original".
- "Retranslate" asks every tier again and ignores the cache.
- Display mode, source language ("Detect automatically" by default) and target language.
- One service list per tier, precise translation, and the switch "Automatically translate messages not in the target language".

| Shortcut | Action |
| --- | --- |
| Alt+A | Translate the message, or show the original |
| Alt+S | Switch between bilingual and translation only |
| Alt+R | Retranslate, ignoring the cache (only while the message is translated) |

The shortcuts can be changed under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager.

Bilingual mode puts each translation under its original paragraph. Translation-only mode replaces the original; hover over a translation to see the original text.

All other settings are on the settings page: the "Options" button of the extension in the Add-ons Manager. Changes are saved automatically. Every setting is described in [docs/settings.md](docs/settings.md).

## Translation tiers

| Tier | Services | Speed | Quality | Offline | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 Dictionary | Dictionary | a few milliseconds | word by word, without grammar | yes | free; a few MB per language pair |
| 2 Machine translation | Google, Microsoft, DeepLX, Bergamot | one to two seconds per message | complete and readable | Bergamot only | free; Bergamot downloads 13–48 MB per direction |
| 3 AI translation | 22 AI providers | a few seconds to a minute | the most natural; follows your prompts | local models only | billed per use to your API key; local models are free |

Each tier uses one service or "Not used"; at least one tier needs a service. The default is Google Translate in tier 2 and nothing else.

Every paragraph goes to all tiers in use at once. A lower tier's result appears first as a provisional translation, in italics and labelled with its tier. The highest tier in use replaces it with the final translation; if the highest tier fails, the provisional translation stays.

When a selected dictionary or Bergamot lacks the data for a message's languages, a notice above the message names what to download, with a link to the settings and a "Don't remind me for these languages" button.

## Translation services

| Group | Services | What you need |
| --- | --- | --- |
| Free | Google Translate | nothing |
| | Microsoft Translator | nothing; optional "Use my key (Azure Translator)" mode with an Azure key and region |
| | DeepLX | the endpoint of a DeepLX server; token optional |
| Offline | Dictionary | download language pairs in the Dictionaries section; a few MB each |
| | Bergamot (Mozilla) | download directions in "Offline translation models (Bergamot)"; 13–48 MB each, every model has English on one side |
| AI | 22 presets | an API key; Ollama, LM Studio and custom OpenAI-compatible services need none |

Get an API key: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/). Local: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/).

Precise translation sends the whole message as context with every AI request and costs more; the thinking mode switch of each AI provider is off by default, because reasoning makes translation slower and more expensive. Endpoints, default models, Ollama's `OLLAMA_ORIGINS` setting and the thinking parameters are listed in [docs/providers.md](docs/providers.md).

## Prompts

The AI tier uses one of three prompts: bilingual display (close to the original), translation-only display (fluent text) and precise translation (consistent terms across the message). Each can be edited and restored with "Restore built-in prompt".

Presets add rules to a prompt: a regional variety such as British English or Taiwan usage, a writing style, the original term after difficult words, or short explanations of difficult words. Details are in [docs/settings.md](docs/settings.md#prompts).

## Privacy

- Message text goes only to the services of the tiers in use. The dictionary and Bergamot translate on your computer.
- API keys are stored only in your Thunderbird profile and are sent only to the endpoint of their own service.
- Two lists come from the network, without any message text: the dictionary pack index from this repository's GitHub releases and the Bergamot model records from Mozilla. The settings page and the setup guide read them to show the offline lists. While the dictionary or Bergamot is selected in a tier, they are also read when Thunderbird starts, when the settings change and when the popup opens. Translating a message never reads them.
- Packs and models are downloaded only when you click a download button. The extension collects no statistics.
- The translation cache is stored locally and can be turned off or cleared.
- For sensitive mail, use only the dictionary, Bergamot and local AI models (Ollama, LM Studio).

## Known limitations

- Translations are plain text: links and inline formatting of the original are not kept in the translation.
- The free Google and Microsoft endpoints are undocumented and may change or be rate-limited.
- The dictionary gives a word-by-word gloss in the source word order.
- The dictionary and Bergamot do not translate between Simplified and Traditional Chinese.
- Every tier in use sends its own requests, so the machine tier also counts against free rate limits when the AI tier is in use.
- Error texts returned by a service are shown as received, usually in English.

The complete list is in [docs/settings.md](docs/settings.md#known-limitations).

## Documentation

The documents below are in English.

- [docs/settings.md](docs/settings.md): every setting, offline lists, missing-data notices and the cache.
- [docs/providers.md](docs/providers.md): endpoints, default models and thinking parameters of every service.
- [docs/batching.md](docs/batching.md): how paragraphs are merged into requests, timeouts and costs.
- [docs/development.md](docs/development.md): building from source, tests, project structure, translating the interface and the release process.

## Acknowledgements

- [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0): the design of paragraph detection, the batch queue, the prompts and the provider configuration.
- [Mozilla Bergamot](https://browser.mt/): the offline engine and the Firefox Translations models (MPL-2.0).
- [Wiktionary](https://en.wiktionary.org/) (© Wiktionary contributors, CC BY-SA 4.0), extracted by [wiktextract](https://github.com/tatuylonen/wiktextract) and published by [kaikki.org](https://kaikki.org/): dictionary data.
- [ECDICT](https://github.com/skywind3000/ECDICT) by skywind3000 (MIT License): English → Simplified Chinese dictionary data.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
