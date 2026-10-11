# Changelog

All notable changes to this project are documented in this file. Versions follow [Semantic Versioning](https://semver.org/).

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
