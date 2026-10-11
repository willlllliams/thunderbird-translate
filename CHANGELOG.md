# Changelog

All notable changes to this project are documented in this file. Versions follow [Semantic Versioning](https://semver.org/).

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
