# Development

This page covers building Multi Translate for Thunderbird from source, the tests, the layout of the repository, translating the interface, and the release process.

## Contents

- [Build from source](#build-from-source)
- [npm scripts](#npm-scripts)
- [Unit tests and coverage](#unit-tests-and-coverage)
- [End-to-end tests](#end-to-end-tests)
- [Project structure](#project-structure)
- [Translating the interface](#translating-the-interface)
- [Release process](#release-process)
- [Other developer documents](#other-developer-documents)

## Build from source

Node.js 22 or later is required. Development and CI use Node 24 and npm 11.

```bash
npm ci
npm test
npm run build
```

`npm run build` does the following:

1. It bundles the background script, the content script, the popup, the settings page, the setup guide, the page of translated subjects and the Bergamot worker into `dist/` with esbuild.
2. It generates `dist/_locales/<language>/messages.json` from the files in `locales/`.
3. It writes `dist/THIRD-PARTY-NOTICES.txt` with `scripts/notices.mjs`: every npm package esbuild bundled, with version, license, copyright line and license text, then the Bergamot engine with the address of its source code, the licenses of the dictionary data, and the source of the character 文 in the icons, the outline of its glyph in Noto Sans SC (SIL Open Font License 1.1). The packages come from the files esbuild read (its metafile). The build stops when a bundled package is not declared in `scripts/notices.mjs`, a declared one is no longer bundled, a license differs from the declaration, or a license text or copyright line is missing. The texts an npm package lacks are kept in `licenses/` together with their source address, so the build needs no network for them.
4. It packs `dist/` into `web-ext-artifacts/thunderbird-translate-<version>.xpi`. Packing uses the pure JavaScript fflate library and needs no system zip command.

The background script is an ES module. The AI SDK is a separate chunk under `dist/chunks/` that loads once the AI tier is in use, so Thunderbird starts the extension without it. The pinned Bergamot engine (wasm) is part of the repository in `vendor/bergamot/`, and the license texts in `licenses/`, so `npm ci` followed by `npm run build` needs no network beyond the npm registry, see [bergamot.md](bergamot.md#build).

During development you can load the extension without packing it. In Thunderbird open Tools → Developer Tools → Debug Add-ons, click "Load Temporary Add-on" and select `dist/manifest.json`.

`npm run build:experimental` produces the experimental build, `web-ext-artifacts/multi-translate-experimental-<version>.xpi`, from the same sources. Its manifest takes the add-on id, the name and the experiment API from `src/experiments/manifest.json`, its background script is `src/experiments/background.ts`, and it carries the files of the experiment API under `experiments/`. [experimental.md](experimental.md) describes the build for users. `scripts/build.mjs` checks both builds: a regular build reads no file of `src/experiments/`, and neither its manifest nor its files contain the experiment; the experimental build bundles its background script and carries the manifest entry and both files of the experiment.

`npm run build:debug` produces a debug xpi (`thunderbird-translate-<version>-debug.xpi`). It starts translating as soon as a message is opened and writes progress to the console, for checking the whole flow in a real Thunderbird.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run build` | production build and xpi |
| `npm run build:debug` | debug build, see above |
| `npm run build:experimental` | experimental build with the column "Translated subject", see above |
| `npm test` | vitest unit tests |
| `npm run test:watch` | vitest in watch mode |
| `npm run test:coverage` | unit tests with coverage; fails below the thresholds in `vitest.config.ts` |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm run locales:check` | checks every `locales/<language>.json` against `locales/en.json` |
| `npm run docs:check` | checks every relative link and heading anchor in the Markdown files, and that the files named in code spans exist |
| `npm run imports:check` | checks the imports of `src/` against the layers and the npm packages of each layer in [Project structure](#project-structure) |
| `npm run e2e` | end-to-end test in a headless Thunderbird against a local mock server |
| `npm run live-test` | calls the real Google and Microsoft endpoints through the extension's own modules, with and without a source language, and DeepL, Baidu, Youdao and Caiyun with the keys in the environment variables named at the top of `scripts/live-test.mjs`; a service without its key is skipped |
| `npm run source-zip` | packs the source archive for addons.thunderbird.net, see [Release process](#release-process) |
| `npm run fetch:bergamot` | checks the vendored Bergamot engine; without it, downloads the pinned engine into `.cache/` |

## Unit tests and coverage

The unit tests live in `tests/` and run in Node with vitest; DOM tests use jsdom, and IndexedDB is replaced by fake-indexeddb.

`npm run test:coverage` measures `src/**/*.ts` with the v8 provider and fails below these thresholds:

| Metric | Threshold |
| --- | --- |
| Lines | 99.5% |
| Statements | 98.8% |
| Branches | 96.3% |
| Functions | 98% |

Two parts are excluded from coverage. `src/offline/bergamot/worker.ts` hands the real wasm module to `worker-core.ts`, which the unit tests cover with a stand-in. `src/e2e/**` is the code of the e2e build, which puts it in place of the empty hooks of `src/hooks/`; it runs only in `npm run e2e`. `tests/hooks.test.ts` checks that every hook of `src/hooks/` is undefined and that `src/e2e/hooks/` defines the same hooks.

The unit tests cover these areas:

- batch grouping and request queues, timeouts, the failure of a single paragraph, batches that mix languages, and paragraphs longer than a batch;
- AI output parsing and the fallback to single requests;
- paragraph detection with bilingual and translation-only rendering and restoring (in jsdom);
- request building and response parsing for Google, Microsoft and DeepLX (with a mocked fetch);
- DeepL, Baidu, Youdao and Caiyun: the signatures (MD5 against the test suite of RFC 1321 and the example of Baidu's documentation, Youdao's SHA-256 and its input rule with emoji), the language codes, the host of DeepL's free keys, batches with Baidu's line breaks and the fallback to single paragraphs, the characters and requests per second of each Baidu edition, the error codes and which of them are tried again, and the directions of Caiyun;
- the summary and to-dos: tolerant reading of the JSON answer (fences, chatter, trailing commas, missing fields, long lists, dates), the prompts with header and glossary, the consent, the cache and "Regenerate", the panel drawn with DOM elements only, "Copy as Markdown" with and without the Clipboard API, the button above a translated message, and the command and popup button;
- the request URL and authentication headers of every AI preset, and the thinking parameters of every provider;
- the host permissions of the manifest: they cover the default endpoint of every preset and the offline downloads and nothing broader, a request to an address without permission is refused, and the settings page asks for a typed endpoint on "Allow access" and before a connection test;
- the migration of settings to added services, to tiers and to prompts;
- the tier lists of the popup and the settings page, the refusal of all-empty tiers and the removal protection;
- the tier rules: lower tier first and replaced, highest tier first with later lower results ignored, highest tier failing with the lower result kept, all tiers failing, unused tiers, cached highest tier;
- prompt selection and cache keys, and a display mode switch that asks the AI tier again and only re-renders the others;
- the source language in the requests of every service and in the cache key;
- dictionary packs: parsing, word splitting and phrase matching, inflected forms, translation through English, missing packs, download with checksum, with an in-memory IndexedDB;
- the dictionary manager: the index of each release tag with its age limit, failed reads and reloads, listing, installing and removing packs, and the packs stored by version 1.12;
- the Bergamot service and its model management with a mocked engine;
- the offline requests of the background script: two installations at a time per service with a queue, a direction two pages ask for installed once, cancelled queued directions never downloaded, the progress notices to the pages at most every 250 ms, the notices to the content scripts, and downloads that go on after the page that asked is closed;
- precise translation: single request, analysis with batches, failed analysis, cache keys and batches per message, identical prompt prefix with Anthropic cache control;
- the consent before online translation: the panel with each service and its host, no request before "Allow and translate", automatic translation and retranslation asking too, a tier changed to a service not allowed yet, the background script refusing a request without consent and translating at once after it, the sample of the setup guide needing none, and the list with "Revoke" on the settings page;
- the subject of a message: the request over the Port answered from the message of the tab, the line above the body with its prefixes, bilingual and translation-only, left out when the switch is off, when the subject is missing or already in the target language, and removed on stop; the reply and forward prefixes of many mail programs;
- the page of translated subjects: the first 100 messages read over several pages of the list and "Show more", sender and date, a subject in the target language left alone, lower tiers replaced by the highest, a click or Enter selecting the message, the reload after a change of folder and, half a second after the last one, after new, deleted or moved messages, a list that arrives late dropped and aborted, the window of its own, the consent panel with the title of the subjects, and the background script serving the page under its own Port name with the consent rules of messages;
- the setup guide: opening only on a new installation, step navigation with skipped steps and resuming, saving of every step, recommended dictionary packs and Bergamot directions and their download, service configuration and connection test, presets on the prompts, the trial translation through the content script modules;
- the prompt presets: variants by target language, composition with each of the three prompts, replacement of the same preset, batch parsing with all four presets applied to one prompt in both answer formats;
- the Markdown of AI translations: every element of the subset, the delimiter rules of CommonMark beside CJK, emoji and right-to-left text, escapes, lists and line breaks; hostile input (`javascript:` and `data:` links, script and img tags, deep nesting, long runs) that yields only the allowed elements; linear time from 10 KB to 80 KB; only the final AI translation rendered, provisional and lower results as text, the subject line, the page of translated subjects and the column without the marks, the original DOM after restoring, and the switch redrawing without a request;
- the hover texts: every control of the popup, the settings page, the setup guide and the notice above a message has one, also after a change of the interface language, and each is at most 60 characters in English;
- localization: identical key sets and placeholders in all languages, every `__MSG_*__` reference in the manifest, mapping of Thunderbird languages to supported languages, fallback to English for missing keys, and the absence of hard-coded interface text in the HTML pages and sources.

The service tests run on the production path `translateForPage()`, with the tiers side by side on separate request queues.

## End-to-end tests

`npm run e2e` builds a test xpi (`scripts/build.mjs --e2e`) against a local mock server (`e2e/mock-server.mjs`). Every run starts its own headless Thunderbird on a temporary profile with the xpi preinstalled, and the runner stops only the processes it started.

The production code reaches the test build through the hooks of `src/hooks/`, which are undefined. The test build replaces every module of `src/hooks/` with the module of the same name in `src/e2e/hooks/` (the esbuild plugin `scripts/e2e-hooks.mjs`), and its manifest adds the host permission `http://127.0.0.1/*` of the mock server:

| Hook | Called by | In the test build |
| --- | --- | --- |
| `beforeSettingsRead` (`hooks/background.ts`) | the background script, before it reads its settings | stores the settings of the scenario (the three tiers dictionary / Google / AI on the mock server, one machine translator with a key of its own, or the offline services; Google and the AI service already allowed, except in the runs `consent` and `subjects`, and only Google in the run `summary`) and installs or removes the dictionary packs through the dictionary manager; in the run `subjects` it shows a local folder in the mail tab and opens the page of translated subjects |
| `releaseFetch`, `bergamotServerUrl` (`hooks/servers.ts`) | the dictionary manager and the Bergamot model list of the background script | the mock server instead of GitHub and Mozilla Remote Settings |
| `contentProbe` (`hooks/content.ts`) | the content client of a displayed message: its parts (with the notice and the consent panel), every progress report, every message of the background script | runs the scenario of the run and reports what it saw |
| `welcomeProbe` (`hooks/welcome.ts`) | the setup guide, once its first step is shown | walks through the tiers and offline steps |
| `subjectsProbe` (`hooks/subjects.ts`) | the page of translated subjects, before it reads the list | allows the services in the consent panel, waits for the translations, clicks a row and shows another folder in the mail tab |

A hook is called as `hook?.(args)`, which does not evaluate `args` when the hook is undefined; its arguments are therefore values already computed or references to objects. The content client decides on automatic translation in the test build as in every other build; the probe only follows it.

`scripts/build.mjs` checks both builds: the bundles of a regular build contain neither the marker string of the hooks nor any file of `src/e2e/` among the files esbuild read, and the test build contains the marker and reads no module of `src/hooks/`, which would mean that a module was not replaced.

The test build also carries the WebExtension Experiment `e2eCapture` (`src/e2e/capture/`), which renders a Thunderbird window into a PNG image. The runs `html`, `plain`, `summary`, `subjects` and `column` take screenshots with it: the message window with the subject line in bilingual and translation-only display, the window of the page of translated subjects, and the main window with the column of the experimental build. The mock server saves them in `.cache/e2e/screenshots/`, and the CI job uploads them as an artifact per Thunderbird version. A regular build, the experimental build included, carries no file of `src/e2e/`, and the build stops when its manifest names any other Experiment than the one it is meant to carry.

| Run | What it checks |
| --- | --- |
| `html` | paragraph detection in an HTML message, the order dictionary → Google → AI for every paragraph, provisional and final translations, the Markdown of the AI answers of the mock server rendered (the label in bold, the first "report" as a link with `rel="noopener noreferrer"`, with the colour and size of its translation) while the asterisks of Google's answers stay text, the subject in a line above the body (read with `messageDisplay.getDisplayedMessage()`) with its AI translation as plain text without the marks, the switch to translation-only (only the AI tier is asked again, the subject line shows the translation alone), restoring the original DOM, translating again from memory without any request, and Alt+R: every tier is asked again although everything is cached, and the new AI translation is shown |
| `plain` | the same for a plain-text message with a quote |
| `auto` | the HTML message with automatic translation on and the cache off: automatic translation translates every paragraph through the three tiers, without the probe starting anything |
| `auto-skip` | a Simplified Chinese message with one English line, target language Simplified Chinese, automatic translation on: after 2.5 s nothing is translated and no service was requested |
| `consent` | the HTML message with no online service allowed yet and the cache off: starting the translation shows the consent panel above the message with Google and the AI service and their host, no request reaches the mock server for 1.5 s, and after "Allow and translate" every paragraph is translated through the three tiers and the settings no longer ask |
| `machine-deepl`, `machine-baidu`, `machine-youdao`, `machine-caiyun` | the HTML message with the machine translator of the name as the only tier and the cache off, pointed at the mock server: every paragraph and the subject get its translation as text; every request carries the key and the signature the server computes (Baidu's MD5, Youdao's SHA-256) and the language codes of the service; DeepL, Youdao and Caiyun batch the paragraphs |
| `summary` | the HTML message with only Google allowed: the command asks for the summary, the consent panel names the AI service alone and nothing reaches it before "Allow and translate"; then the panel at the top of the body shows the four parts with the quote of the to-do as hover text, the request carries the header of the message and the token limit, the second request is answered from the cache, and "Regenerate" asks the service again |
| `column` | the experimental test build (`scripts/build.mjs --e2e <server> --experimental`) on a profile with the same local folders: after the folder "Foreign" is shown, the column "Translated subject" is registered and visible in the table view and empty; within seconds the five subjects not in the target language show their AI translation without the Markdown marks, with "Fwd:" in front where the subject has it, both in the text the column gives the row and in the cell on screen, read through the experiment API (`translatedColumn.inspect()`) |
| `subjects` | a profile of its own with the account "Local Folders" and two folders written as mbox files (six foreign subjects, one of them in the target language and one with "Fwd:", and two more), and the table view of the message list, set both as the preference `mail.threadpane.listview` that Thunderbird 140 and later read and in `xulstore.json`, where Thunderbird 128 keeps it: the page of translated subjects, opened in a window of its own for the mail tab that shows "Foreign", asks with the consent panel and sends nothing for 1.5 s; after "Allow and translate" every subject not in the target language gets its AI translation without the prefix and as plain text without the Markdown marks, in fewer requests than subjects; a click on a row selects that message in the mail tab; and when the mail tab shows "Second", the page lists and translates its two subjects |
| `missing` | the dictionary and Bergamot tiers with nothing installed: the notice about missing offline data appears, is muted, stays away when translating again, and stays away with Google instead |
| `welcome` | Thunderbird starts without a message and opens the setup guide; the test skips the tour of the tiers step, waits until the demo shows the machine translation, chooses an AI service and waits for the replayed demo to show the AI text; then, with English as source language, it goes to the offline step, downloads the ticked dictionary pack and Bergamot model from the mock server with progress, checks that both are stored and deletes them again |
| `welcome-auto` | the same with automatic detection: the recommended directions are labelled and ticked, and the test downloads through "Download common languages" and "Download selected" |

Environment variables:

| Variable | Meaning |
| --- | --- |
| `THUNDERBIRD_BIN` | the Thunderbird binary; without it the runner tries the usual install location of the platform |
| `E2E_ONLY` | comma-separated names of the runs to execute, for example `E2E_ONLY=html,welcome` |
| `E2E_TIMEOUT_MS` | timeout of one step, 180000 by default |

To run it locally, install Thunderbird 128 or later and run `THUNDERBIRD_BIN=/path/to/thunderbird npm run e2e`. The exit code is 1 on any failure.

In CI the job `e2e` of `.github/workflows/release.yml` runs the same command on Ubuntu against four Thunderbird versions: 128.14.0esr and 140.17.0esr (older ESR still in use), 153.4.0esr (current ESR) and 157.0.1 (latest release). It downloads each version from `ftp.mozilla.org` and installs the libraries Thunderbird needs.

## Project structure

```
src/
  shared/        modules every part uses: settings, provider presets and thinking parameters, the addresses the extension connects to and their host permissions, prompts, language table and codes, language detection, fetch with classified errors, message types, i18n runtime, DOM helpers, the text filters applied before a paragraph or subject is sent (text.ts), a value loaded once and tried again after a failure (retryable.ts), the message list of a mail tab read page by page (message-list.ts), the Markdown reader of AI translations (markdown.ts), the subject without its reply and forward prefixes (subject.ts), the message as context for precise translation (mail-context.ts), MD5 for the signature of Baidu (md5.ts), the types of a summary (summary.ts)
  offline/       offline data of the background page: manager.ts, what the managers of both services have in common; catalog-cache.ts, the catalogs (dictionary index, Bergamot model list); install-registry.ts, the installations of a service, two at a time with a queue
    dictionary/  dictionary packs: format, download, storage, lookup, and manager.ts, which lists, installs and removes the packs and translates with them
    bergamot/    Bergamot engine: model list, download, storage, worker, and manager.ts, which lists, installs and removes the models and translates with them
  background/    background script: the entry index.ts and the modules it assembles (settings-state, tabs, router, offline-admin, offline-status, commands, locale-tables, content-scripts, welcome), translation service, batch and request queues, cache, provider factory, translators; subject.ts reads the subject of the displayed message for the line above the body and its header for the summary, summary.ts builds the summary request and reads its answer
  content/       content script: paragraph detection, rendering, translation state, notice about missing offline data, panel with the summary and to-dos
  popup/         popup
  options/       settings page and the parts the setup guide shares: translation style controls, service fields, dictionary and Bergamot lists (offline-list.ts shows them from the background script), prompt editor, settings session
  welcome/       setup guide: steps and navigation, demo and tour of the tiers step
  subjects/      page of translated subjects (popup of the main toolbar button): the message list of a mail tab, page by page, translated with the controller of the content script
  experiments/   the experimental build only: its background script, the column sync (column.ts), the manifest fields it adds, and the experiment API translatedColumn (translated-column/: schema.json and the parent implementation)
  hooks/         hooks of the e2e test build, undefined in every other build
  e2e/           code of the e2e test build: the defined hooks (e2e/hooks/) and the probes they run
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, the icons: icons/icon.svg for 64 px and more, icons/icon-16.svg without the text lines for 16 to 32 px
licenses/        license texts for THIRD-PARTY-NOTICES.txt: those some npm packages lack, the Apache License 2.0, Marian, ECDICT
scripts/         build, third-party notices and the hook plugin of the e2e build, Bergamot engine download, locale generation and checks, Markdown link check, layer check of src/, live endpoint test, release notes of a version from CHANGELOG.md (release-notes.mjs), source archive for the add-on site (source-zip.mjs)
vendor/
  bergamot/      Bergamot engine: the WebAssembly binary (bergamot-translator.wasm.zst) and its glue script (bergamot-translator.js), as Mozilla publishes them; README.md names their source and hashes
tools/           dict-build: the pipeline that builds the dictionary packs; store-screenshots: the screenshots of the add-on listing; readme-gif: the animations of the READMEs
store/           the add-on listing on addons.thunderbird.net: texts, privacy policy, notes to reviewers (English, with Simplified Chinese versions), screenshots and icons
readmes/         translated versions of the README
docs/            reference and developer documentation; media/ holds the animations of the READMEs; archive/ keeps the full changelog up to 1.12.0 and the size analysis of 1.5.2
promo/           the prompt for the promotional video
tests/           vitest tests
e2e/             end-to-end test in a real Thunderbird: runner, mock server, fixture messages
.github/         workflows: build and release, dictionary packs
```

The entry of the background script, `background/index.ts`, only assembles. It creates the dictionary manager (`offline/dictionary/manager.ts`; the Bergamot manager is created on first use), the settings (`settings-state.ts`), the content scripts by tab with their state and badge (`tabs.ts`), the request handlers and their dispatch (`router.ts`, which takes the offline requests from `offline-admin.ts`), the keyboard commands (`commands.ts`), what the offline services lack (`offline-status.ts`) and the interface messages for the content scripts (`locale-tables.ts`), and passes each module what it needs from the others as arguments. Then it registers its five listeners (`storage.onChanged`, `runtime.onConnect`, `runtime.onMessage`, `commands.onCommand`, `runtime.onInstalled`) and, after them, the content script (`content-scripts.ts`). Thunderbird hands the event that woke a background page only to the listeners registered in its first run, so no module of the background script awaits anything at the top level or before its listener is registered; `tests/background-entry.test.ts` checks that the five listeners exist when the content script is registered.

The dispatch of `runtime.onMessage` (`router.ts`) checks the sender. A content script runs inside a displayed message, and its sender address is that of the message, not of the extension. It gets answers only to the four requests it sends, `getLocaleMessages`, `openOptions`, `muteOfflinePairs` and `grantConsent` (`CONTENT_REQUESTS`); every other request is answered only for the pages of the extension. `tests/router.test.ts` compares this list with the request types in `src/content/`.

The directories under `src/` are layers. A file may import from its own directory and from the directories listed for it:

| Directory | May import from | npm packages |
| --- | --- | --- |
| `shared/` | `locales/*.json` only | `import type` from `ai`, no value import |
| `hooks/` | types only (`import type`, `export type`), from `shared/`, `offline/`, `background/`, `content/`, `welcome/`, `subjects/` | none |
| `offline/` | `shared/`, `hooks/` | `fzstd` |
| `background/` | `shared/`, `offline/`, `hooks/` | `ai`, `@ai-sdk/*`, `zod` |
| `content/` | `shared/`, `hooks/` | none |
| `popup/` | `shared/` | none |
| `options/` | `shared/`, `content/` (the style preview sets the same CSS variables as the translations in a message) | none |
| `welcome/` | `shared/`, `content/`, `options/`, `hooks/` | none |
| `subjects/` | `shared/`, `content/` (the translation controller, renderer and consent panel), `hooks/` | none |
| `experiments/` | `shared/`, `background/`, `offline/`, `hooks/`; no other layer imports it, so only the entry of the experimental build, `src/experiments/background.ts`, reads it (`VARIANT_LAYERS`) | none |
| `e2e/` | every directory | none |

The packages of each layer are the `PACKAGES` table of `scripts/check-imports.mjs`. The AI SDK stays in the AI chunk of the background script and the Zstandard decoder in the offline layer, so no content script or page bundle carries them.

No production file imports from `e2e/`. The pages reach dictionary packs and offline models through the background script only, so `options/` and `welcome/` import nothing from `offline/`, and no download or storage code goes into their bundles. `npm run imports:check` (`scripts/check-imports.mjs`) reads every `import`, `import type`, `export … from`, `import … = require(…)`, side-effect and dynamic import of `src/` and fails on an import across these boundaries and on an npm package that the layer does not list; CI runs it after the link check. It reads the imports from the tokens of TypeScript's scanner, so text in comments, strings, template literals and regular expressions never counts as code, a dynamic import with a template literal path is checked like one with a quoted path, and a dynamic import whose path is computed fails the check. A default import named `type` (`import type from "…"`) counts as a value import.

The design of paragraph detection, the batch queue, the prompts and the provider configuration follows [Read Frog](https://github.com/mengxi-ream/read-frog), a browser extension for translating web pages released under GPL-3.0. This project carries these ideas over to Thunderbird's message reader and adapts them to email, for example splitting plain-text mail at blank lines and joining hard-wrapped lines.

## Translating the interface

Interface text lives in `locales/<language>.json`, one flat object of key → text per language. `locales/en.json` is the reference: every other file has exactly the same keys.

- `$1` to `$9` are substitutions. They must appear in each translation with the same numbers as in English.
- `{{apiKey}}` and `{{to}}` are literal tokens and stay unchanged.
- Product names such as Google Translate, OpenAI or DeepLX are not translated.

`npm run build` converts these files into `dist/_locales/<language>/messages.json`, the format Thunderbird reads. The extension's own i18n runtime loads the same files at run time, so the interface language can change without restarting Thunderbird. Missing keys fall back to English.

The supported interface languages:

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

To add a language:

1. Create `locales/<code>.json` with all keys.
2. Add the code to `SUPPORTED_LOCALES` in `src/shared/locales.ts` together with its native name.
3. Run `npm run locales:check` and `npm test`.

The README exists in the same 12 languages: `README.md` in English and `readmes/README.<language>.md` for the others, with the language code written with a hyphen (`README.zh-CN.md`, `README.pt-BR.md`). All 12 have the same sections in the same order, and their interface terms match the locale files.

The documents in `docs/` are in English, except `dictionary-packs.md` and the archived `archive/size-and-structure-1.5.2.md`, which are in Chinese; the prompt for the promotional video, `promo/promo-video-prompt.md`, is in Chinese too.

After editing any Markdown file, run `npm run docs:check`. It resolves every relative link and checks every anchor with GitHub's rules (lower case, punctuation removed, spaces turned into `-`, letters, marks and decimal digits of every script kept, images left out, a repeated heading numbered `-1`, `-2`… until its anchor is free).

`npm run docs:check` also checks the paths in code spans: a path whose first part is a directory of the repository, such as `docs/settings.md` or `background/router.ts`, and a bare name of a source file, such as `offline-admin.ts`, must name a file or directory that exists, from the repository root, from the document's directory, from `src/` or as the end of a path of the repository. `CHANGELOG.md` and `docs/archive/` are left out, since they name the files of their time.

`tests/doc-facts.test.ts` checks the numbers and names the documents state against the code: the number of AI provider presets in the 12 READMEs and in the package description, the interface languages, and the keyboard shortcuts of the manifest.

## Release process

The version lives in four places, which must agree: `static/manifest.json`, `package.json`, and `version` and `packages[""].version` of `package-lock.json`. The build reads it from the manifest and stops when one of the other three differs. Every version has a section `## <version> - <date>` in `CHANGELOG.md`, which becomes the text of its release; versions follow [Semantic Versioning](https://semver.org/).

The workflow `.github/workflows/release.yml` (named "Build") runs on every push to `main`, on pull requests and on manual dispatch.

1. Job `build`: `npm ci`, `npm run typecheck`, `npm run locales:check`, `npm run docs:check`, `npm run imports:check`, `npm run test:coverage`, `npm run build` and `npm run build:experimental`. Both xpi files are uploaded as one build artifact named after the version and the short commit hash, kept for 30 days. Then `scripts/release-notes.mjs` writes the section of the version in `CHANGELOG.md` to a file, with relative links pointing to the files at the tag of the version, and uploads it as a second artifact. A version without a section of its own fails here.
2. Job `e2e`: the end-to-end test against the four Thunderbird versions listed above; its run `column` tests the experimental build in each of them. The screenshots of every version are uploaded as an artifact, kept for 14 days.
3. Job `release`, after both succeed, on a push to `main` and on manual dispatch (not for pull requests). It is the only job with write access to the repository.
   - On a push, it replaces the `nightly` pre-release with the two xpi files of this commit, named `thunderbird-translate-<version>-<sha>.xpi` and `multi-translate-experimental-<version>-<sha>.xpi`. The nightly build is for testing.
   - If no release `v<version>` exists yet, it creates one with both xpi files, `thunderbird-translate-<version>.xpi` and `multi-translate-experimental-<version>.xpi`, and that text as its description, and marks it as the latest release. A manual dispatch does the same when the version has no release yet.

A new versioned release therefore appears when a commit with a new version number reaches `main` and passes all checks. Pushing more commits with the same version only updates `nightly`. A manual dispatch (`workflow_dispatch`) runs the job `release` as well, on the branch it is started from, and creates the release of a version that has none yet.

Runs of the same branch or pull request do not overlap. A new push to a pull request cancels its running run. On `main` a running run finishes, and a run still waiting gives way to a newer one.

To check the text of a release before pushing, run `node scripts/release-notes.mjs <version> <file>`.

A version for addons.thunderbird.net (ATN) needs the source code next to the xpi, since the bundles are minified. `npm run source-zip` (`scripts/source-zip.mjs`) writes `web-ext-artifacts/thunderbird-translate-<version>-source.zip`: `src/` without `src/e2e/`, `static/`, `scripts/` without the live endpoint test, `locales/`, `vendor/`, `licenses/`, the package files, `tsconfig.json`, `LICENSE`, [VENDOR.md](../VENDOR.md), which declares the two unmodified files of the Bergamot engine with their upstream addresses, and [SOURCE-BUILD.md](../SOURCE-BUILD.md), which tells the reviewer how to build. Its files are sorted and carry one time stamp, like the entries of the xpi, so `npm ci` and `npm run build` in the unpacked archive give the same xpi byte for byte; `tests/source-zip.test.ts` checks the contents and that the archive is the same when made again.

The texts of the listing, the privacy policy and the notes to reviewers are in `store/`. `node tools/store-screenshots/shoot.mjs` takes the screenshots of the listing again after `npm run build`: it serves `dist/` with a stand-in for the Thunderbird API and renders the pages of the extension in headless Chrome at 1280×800. `node tools/readme-gif/record.mjs` makes the animations at the top of the READMEs (`docs/media/`) in the same way, frame by frame, and encodes them with ffmpeg; [its README](../tools/readme-gif/README.md) describes the timeline and the sample messages.

The dictionary packs have their own manually triggered workflow, `.github/workflows/dicts.yml`, which publishes to the release `dicts-v1`; see [dictionary-packs.md](dictionary-packs.md#发布).

## Other developer documents

- [batching.md](batching.md): batch queue, request queues, timeouts and cost estimate.
- [providers.md](providers.md): endpoints, default models and thinking parameters of every service.
- [settings.md](settings.md): every setting and the detailed behavior.
- [experimental.md](experimental.md): the experimental build, its column "Translated subject" and the experiment API.
- [bergamot.md](bergamot.md): the Bergamot engine module, model selection, storage and build.
- [dictionary-packs.md](dictionary-packs.md): data sources, pack format, extraction rules and build of the dictionary packs (in Chinese).
- [archive/size-and-structure-1.5.2.md](archive/size-and-structure-1.5.2.md): size of the xpi and the bundles, module dependencies and data flow of version 1.5.2, kept as a record; the numbers are outdated (in Chinese).
- [promo/promo-video-prompt.md](../promo/promo-video-prompt.md): the prompt for the promotional video (in Chinese).
