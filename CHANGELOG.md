# Changelog

All notable changes to this project are documented in this file. Versions follow [Semantic Versioning](https://semver.org/).

## 1.3.1

### Fixed

- Turning the translation off, or changing the target language or service, while the extension was still checking which paragraphs are already in the target language could let the interrupted run continue: it sent translation requests for the old run, could leave a loading marker in the message and reported a wrong paragraph count to the popup.
- Clearing the cache while the stored cache was still being read brought the old entries back once the read finished.

### Changed

- Internal cleanup: unused messages, exports, members and build options removed; duplicated code in the translators, the settings, the error descriptions, the popup and settings page, and the tests merged. Settings pushed to a message are applied in the order they arrive. The display-mode shortcut changes the stored settings instead of the background script's copy. No change in behavior otherwise.

## 1.3.0

### Added

- Microsoft Translator can use your own Azure Translator key. The service panel has a switch between "Default interface (free)", which keeps the Edge token route with the direct fallback, and "Use my key (Azure Translator)". In key mode the extension calls the official Translator v3 `translate` method (`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=<language>`) with the headers `Ocp-Apim-Subscription-Key` and, when a region is entered, `Ocp-Apim-Subscription-Region`; the region can stay empty for a global resource. The panel shows the endpoint (for resources with a custom domain), the key (with the show and hide button) and the region only in key mode. The settings keep the mode as `mode` ("free" or "key") in the provider configuration, next to `apiKey`, `region` and the endpoint (`baseURL`). The connection test works in both modes.
- Batches for Azure follow the documented limits of one translate request: 1,000 array elements and 50,000 characters. The free route keeps its caps of 100 paragraphs and 5,000 characters. Your own batch settings still apply on top.
- A wrong Azure key or region (HTTP 401 and 403) gets its own advice: use the key of a Translator or multi-service resource, enter the region shown under Keys and Endpoint, and a 403 can also mean the free quota is used up. After a 404 in key mode the default endpoint is named.
- Interface texts for these features in all 12 languages.

### Fixed

- A change made in the popup while the settings page was open (current service, target language, display mode, automatic translation, race and precise switches) was overwritten by the next save of the settings page. The page now saves only what the user changed there, on top of the settings in storage, and shows changes made elsewhere right away. A field being edited is not touched. The popup shows changes of the display mode and of automatic translation made on the settings page as well.

## 1.2.0

### Added

- Added services. Every provider has an `enabled` flag. The popup's service list and the settings page's "Current service" list show added services only; a "+ Add translation service" button under the popup list opens `options.html#providers`. The provider side list of the settings page has two groups, "Added" and "Available to add", with "Add" and "Remove" buttons. Typing an API key (for DeepLX, the endpoint) adds the service. The current service, and the fast service while race translation is on, cannot be removed; the disabled button comes with the reason.
- Race translation (`race: { enabled, fastProviderId }`, off by default, fast service Google Translate). With an AI service as current service, every paragraph is also translated by the fast service (Google, Microsoft or DeepLX). The background script pushes a `provisional` message over the content script's Port when the fast answer comes first and a `result` message with the final answer. Provisional translations are shown in italics with a "Provisional" tag; a failed AI request keeps the fast translation, marked "AI translation failed" with the reason as tooltip and a click to retry. A cached AI translation is answered without asking the fast service. The popup counts provisional paragraphs separately, for example "Translated 7 of 9 (2 provisional)".
- Precise translation (`precise: { enabled }`, off by default, AI services only). The content script registers the message text (paragraphs in order, cut at 20,000 characters) once per translation. Paragraphs that fit into one request are translated in that request. Longer messages get one analysis request that returns a summary, a glossary and the tone as JSON; it is parsed tolerantly, cached by provider, model, target language and message hash, shared by concurrent batches, and skipped when it fails. Every request of one message starts with the same system prefix (system prompt, analysis, and the full text up to about 8,000 characters), and each batch carries the neighbouring paragraphs as reference. For Anthropic the prefix is marked with `cacheControl: { type: "ephemeral" }`. Cache keys and batch keys contain the message hash.
- Thinking mode switch for each AI provider (`thinking`, off by default). `src/background/providers/thinking.ts` maps it to each provider's options by model name, for example `deepseek.thinking.type`, `anthropic.thinking.type`, `google.thinkingConfig`, `openai.reasoningEffort`, `alibaba.enableThinking` or `zhipu.thinking.type`; the README lists every value with its source. Perplexity, LM Studio and custom services have no thinking parameter; their switch is disabled with an explanation. While thinking is on, no temperature is sent.
- Interface texts for these features in all 12 languages.

### Changed

- DeepSeek: `deepseek-flash` thinks by default, which also made the API ignore the temperature. Requests now send `thinking: { type: "disabled" }` unless thinking mode is turned on, so the preset temperature 1.3 applies again.
- Settings saved by 1.1 and earlier are migrated: Google and Microsoft count as added, DeepLX with an endpoint, AI services with a saved key, keyless services (Ollama, LM Studio, custom) whose configuration was changed, and always the current service.
- Translation requests from the content script go over its Port instead of `runtime.sendMessage`, so the background script can answer twice.
- The system prompt is passed to the AI SDK as `instructions` (the `system` option is deprecated in AI SDK 7).
- The "Configured" tag in the provider list was replaced by the two groups.

## 1.1.1

### Fixed

- A failed connection test showed only "Failed:" with no reason. In Thunderbird, responses arrive over HTTP/2, where `statusText` is always empty; the AI SDK uses `statusText` as the error message when the response body is not in the provider's error format, so the message was an empty string. This happened for example with the DeepSeek endpoint set to the web console `https://platform.deepseek.com` (HTTP 405, body `{"detail":"Method Not Allowed"}`).
- Failure markers inside messages and the popup could show an empty reason for the same cause.

### Changed

- All error messages are built by one function and are never empty. HTTP failures show the status code with its standard reason phrase (filled in when `statusText` is empty), the request URL and the server's own message, taken from the JSON fields `error.message`, `error`, `message`, `detail`, `msg` or `errors[0].message`. An HTML page in the response is reported as "a web page instead of an API response" rather than quoted; other text is shortened to about 200 characters.
- Network failures name the host that could not be reached. The free Google and Microsoft translators and DeepLX now report the URL of a failed request as well.
- Errors come with suggestions in the interface language: invalid key or missing permission (401/403), wrong endpoint or model with the preset's default endpoint and the endpoint in use (404/405), console or documentation sites used as endpoint, unknown model, rate limit or used-up balance (402/429), server errors (5xx), and network or proxy problems.
- The settings page shows a failed connection test on several lines (reason, server message, suggestions, request URL); the text can be selected and copied, and the colors work with a dark theme.
- The endpoint field on the settings page warns, after editing, about malformed URLs and about known console, documentation and chat sites (for example `platform.deepseek.com`, `platform.openai.com`, `console.anthropic.com`, `aistudio.google.com`, `console.groq.com`), shows the default endpoint and offers a button to restore it. Saving is not blocked. Presets list these sites in a new optional `webHosts` field.
- The popup shows the reason of the most recent failure next to the failure count, shortened, with the full text as tooltip.
- DeepSeek preset: the default model is now `deepseek-flash`, and the suggestions are `deepseek-flash` and `deepseek-v4-pro`. DeepSeek retired `deepseek-chat` and `deepseek-reasoner` on 2026-07-24. Settings that leave the model field empty switch to the new default automatically.

## 1.1.0

### Added

- Interface in 12 languages: English, Simplified Chinese, Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese (Brazil), Russian, Turkish and Vietnamese.
- "Interface language" option on the settings page. The default follows Thunderbird's language; any of the 12 languages can be chosen explicitly. Open settings pages and popups switch immediately, labels inside messages switch the next time they are drawn.
- The extension's own i18n runtime, which loads `_locales/<locale>/messages.json` packaged with the extension, substitutes placeholders, formats numbers with `Intl.NumberFormat`, falls back to English for missing keys, and sets `<html lang>` and `dir`.
- Target language names are shown in the interface language with the language's own name, for example "Japanese (日本語)", using `Intl.DisplayNames`. Prompts for AI services still use English language names.
- Error messages of the extension (missing endpoint, key or model, unexpected responses, HTTP failures) and the connection test result are shown in the interface language.
- The toolbar button tooltip and the "translation on" badge follow the interface language.
- README in 12 languages under `readmes/`.
- Tests for locale completeness and placeholders, manifest `__MSG_*__` references, language mapping, runtime fallback and the absence of hard-coded interface text.

### Changed

- On first installation the target language is taken from the interface language (for example Japanese for a Japanese Thunderbird, English for an English one) instead of always Simplified Chinese. Existing settings are kept.
- Interface text now lives in `locales/<locale>.json`, one file per language with `en.json` as the reference. `npm run build` generates `dist/_locales`; `npm run locales:check` validates the files. `scripts/locales-source.mjs` and `static/_locales` were removed.
- Provider names keep their brand names untranslated; suffixes such as "(free)" and "(local)" are translated.
- `README.md` is now the English main document; the Chinese version moved to `readmes/README.zh-CN.md`, and `README.en.md` was removed.

## 1.0.0

- First release: in-place translation of the message body (bilingual or translation-only), free Google and Microsoft translators, DeepLX, 22 AI provider presets, request batching with cache, settings page and popup in English and Simplified Chinese.
