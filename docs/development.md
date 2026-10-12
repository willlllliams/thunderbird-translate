# Development

This page covers building Thunderbird Translate from source, the tests, the layout of the repository, translating the interface, and the release process.

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

1. It bundles the background script, the content script, the popup, the settings page, the setup guide and the Bergamot worker into `dist/` with esbuild.
2. It generates `dist/_locales/<language>/messages.json` from the files in `locales/`.
3. It packs `dist/` into `web-ext-artifacts/thunderbird-translate-<version>.xpi`. Packing uses the pure JavaScript fflate library and needs no system zip command.

The background script is an ES module. The AI SDK is a separate chunk under `dist/chunks/` that loads once the AI tier is in use, so Thunderbird starts the extension without it. The first build downloads the pinned Bergamot engine (wasm) from Mozilla into `.cache/`, see [bergamot.md](bergamot.md#build).

During development you can load the extension without packing it. In Thunderbird open Tools → Developer Tools → Debug Add-ons, click "Load Temporary Add-on" and select `dist/manifest.json`.

`npm run build:debug` produces a debug xpi (`thunderbird-translate-<version>-debug.xpi`). It starts translating as soon as a message is opened and writes progress to the console, for checking the whole flow in a real Thunderbird.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run build` | production build and xpi |
| `npm run build:debug` | debug build, see above |
| `npm test` | vitest unit tests |
| `npm run test:watch` | vitest in watch mode |
| `npm run test:coverage` | unit tests with coverage; fails below the thresholds in `vitest.config.ts` |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm run locales:check` | checks every `locales/<language>.json` against `locales/en.json` |
| `npm run docs:check` | checks every relative link and heading anchor in the Markdown files |
| `npm run imports:check` | checks the imports of `src/` against the layers in [Project structure](#project-structure) |
| `npm run e2e` | end-to-end test in a headless Thunderbird against a local mock server |
| `npm run live-test` | calls the real Google and Microsoft endpoints through the extension's own modules, with and without a source language |
| `npm run fetch:bergamot` | downloads the pinned Bergamot engine into `.cache/` |

## Unit tests and coverage

The unit tests live in `tests/` and run in Node with vitest; DOM tests use jsdom, and IndexedDB is replaced by fake-indexeddb.

`npm run test:coverage` measures `src/**/*.ts` with the v8 provider and fails below these thresholds:

| Metric | Threshold |
| --- | --- |
| Lines | 97% |
| Statements | 97% |
| Branches | 93% |
| Functions | 96% |

Two parts are excluded from coverage. `src/offline/bergamot/worker.ts` hands the real wasm module to `worker-core.ts`, which the unit tests cover with a stand-in. `src/e2e/**` is the code of the e2e build, which puts it in place of the empty hooks of `src/hooks/`; it runs only in `npm run e2e`. `tests/hooks.test.ts` checks that every hook of `src/hooks/` is undefined and that `src/e2e/hooks/` defines the same hooks.

The unit tests cover these areas:

- batch grouping and request queues, timeouts, the failure of a single paragraph, batches that mix languages, and paragraphs longer than a batch;
- AI output parsing and the fallback to single requests;
- paragraph detection with bilingual and translation-only rendering and restoring (in jsdom);
- request building and response parsing for Google, Microsoft and DeepLX (with a mocked fetch);
- the request URL and authentication headers of every AI preset, and the thinking parameters of every provider;
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
- the setup guide: opening only on a new installation, step navigation with skipped steps and resuming, saving of every step, recommended dictionary packs and Bergamot directions and their download, service configuration and connection test, presets on the prompts, the trial translation through the content script modules;
- the prompt presets: variants by target language, composition with each of the three prompts, replacement of the same preset, batch parsing with all four presets applied to one prompt in both answer formats;
- the hover texts: every control of the popup, the settings page, the setup guide and the notice above a message has one, also after a change of the interface language, and each is at most 60 characters in English;
- localization: identical key sets and placeholders in all languages, every `__MSG_*__` reference in the manifest, mapping of Thunderbird languages to supported languages, fallback to English for missing keys, and the absence of hard-coded interface text in the HTML pages and sources.

The service tests run on the production path `translateForPage()`, with the tiers side by side on separate request queues.

## End-to-end tests

`npm run e2e` builds a test xpi (`scripts/build.mjs --e2e`) against a local mock server (`e2e/mock-server.mjs`). Every run starts its own headless Thunderbird on a temporary profile with the xpi preinstalled, and the runner stops only the processes it started.

The production code reaches the test build through the hooks of `src/hooks/`, which are undefined. The test build replaces every module of `src/hooks/` with the module of the same name in `src/e2e/hooks/` (the esbuild plugin `scripts/e2e-hooks.mjs`):

| Hook | Called by | In the test build |
| --- | --- | --- |
| `beforeSettingsRead` (`hooks/background.ts`) | the background script, before it reads its settings | stores the settings of the scenario (the three tiers dictionary / Google / AI on the mock server, or the offline services) and installs or removes the dictionary packs through the dictionary manager |
| `releaseFetch`, `bergamotServerUrl` (`hooks/servers.ts`) | the dictionary manager and the Bergamot model list of the background script | the mock server instead of GitHub and Mozilla Remote Settings |
| `contentProbe` (`hooks/content.ts`) | the content client of a displayed message: its parts, every progress report, every message of the background script | runs the scenario of the run and reports what it saw |
| `welcomeProbe` (`hooks/welcome.ts`) | the setup guide, once its first step is shown | walks through the tiers and offline steps |

A hook is called as `hook?.(args)`, which does not evaluate `args` when the hook is undefined; its arguments are therefore values already computed or references to objects. The content client decides on automatic translation in the test build as in every other build; the probe only follows it.

`scripts/build.mjs` checks both builds: the bundles of a regular build contain neither the marker string of the hooks nor any file of `src/e2e/` among the files esbuild read, and the test build contains the marker and reads no module of `src/hooks/`, which would mean that a module was not replaced.

| Run | What it checks |
| --- | --- |
| `html` | paragraph detection in an HTML message, the order dictionary → Google → AI for every paragraph, provisional and final translations, the switch to translation-only (only the AI tier is asked again), restoring the original DOM, translating again from memory without any request, and Alt+R: every tier is asked again although everything is cached, and the new AI translation is shown |
| `plain` | the same for a plain-text message with a quote |
| `auto` | the HTML message with automatic translation on and the cache off: automatic translation translates every paragraph through the three tiers, without the probe starting anything |
| `auto-skip` | a Simplified Chinese message with one English line, target language Simplified Chinese, automatic translation on: after 2.5 s nothing is translated and no service was requested |
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
  shared/        modules every part uses: settings, provider presets and thinking parameters, prompts, language table and codes, language detection, fetch with classified errors, message types, i18n runtime, DOM helpers
  offline/       offline data of the background page: manager.ts, what the managers of both services have in common; catalog-cache.ts, the catalogs (dictionary index, Bergamot model list); install-registry.ts, the installations of a service, two at a time with a queue
    dictionary/  dictionary packs: format, download, storage, lookup, and manager.ts, which lists, installs and removes the packs and translates with them
    bergamot/    Bergamot engine: model list, download, storage, worker, and manager.ts, which lists, installs and removes the models and translates with them
  background/    background script: the entry index.ts and the modules it assembles (settings-state, tabs, router, offline-admin, offline-status, commands, locale-tables, content-scripts, welcome), translation service, batch and request queues, cache, provider factory, translators
  content/       content script: paragraph detection, rendering, translation state, notice about missing offline data
  popup/         popup
  options/       settings page and the parts the setup guide shares: translation style controls, service fields, dictionary and Bergamot lists (offline-list.ts shows them from the background script), prompt editor, settings session
  welcome/       setup guide: steps and navigation, demo and tour of the tiers step
  hooks/         hooks of the e2e test build, undefined in every other build
  e2e/           code of the e2e test build: the defined hooks (e2e/hooks/) and the probes they run
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build and the hook plugin of the e2e build, Bergamot engine download, locale generation and checks, Markdown link check, layer check of src/, live endpoint test
vendor/
  bergamot/      Bergamot engine glue script (bergamot-translator.js)
tools/           dict-build: the pipeline that builds the dictionary packs
readmes/         translated versions of the README
docs/            reference and developer documentation; archive/ keeps the full changelog up to 1.12.0 and the size analysis of 1.5.2
promo/           the prompt for the promotional video
tests/           vitest tests
e2e/             end-to-end test in a real Thunderbird: runner, mock server, fixture messages
.github/         workflows: build and release, dictionary packs
```

The entry of the background script, `background/index.ts`, only assembles. It creates the dictionary manager (`offline/dictionary/manager.ts`; the Bergamot manager is created on first use), the settings (`settings-state.ts`), the content scripts by tab with their state and badge (`tabs.ts`), the request handlers and their dispatch (`router.ts`, which takes the offline requests from `offline-admin.ts`), the keyboard commands (`commands.ts`), what the offline services lack (`offline-status.ts`) and the interface messages for the content scripts (`locale-tables.ts`), and passes each module what it needs from the others as arguments. Then it registers its five listeners (`storage.onChanged`, `runtime.onConnect`, `runtime.onMessage`, `commands.onCommand`, `runtime.onInstalled`) and, after them, the content script (`content-scripts.ts`). Thunderbird hands the event that woke a background page only to the listeners registered in its first run, so no module of the background script awaits anything at the top level or before its listener is registered; `tests/background-entry.test.ts` checks that the five listeners exist when the content script is registered.

The directories under `src/` are layers. A file may import from its own directory and from the directories listed for it:

| Directory | May import from |
| --- | --- |
| `shared/` | npm packages and `locales/*.json` only |
| `hooks/` | types only (`import type`, `export type`), from `shared/`, `offline/`, `background/`, `content/`, `welcome/` |
| `offline/` | `shared/`, `hooks/` |
| `background/` | `shared/`, `offline/`, `hooks/` |
| `content/` | `shared/`, `hooks/` |
| `popup/` | `shared/` |
| `options/` | `shared/`, `content/` (the style preview sets the same CSS variables as the translations in a message) |
| `welcome/` | `shared/`, `content/`, `options/`, `hooks/` |
| `e2e/` | every directory |

No production file imports from `e2e/`. The pages reach dictionary packs and offline models through the background script only, so `options/` and `welcome/` import nothing from `offline/`, and no download or storage code goes into their bundles. `npm run imports:check` (`scripts/check-imports.mjs`) reads every `import`, `import type`, `export … from`, side-effect and dynamic import of `src/` and fails on an import across these boundaries; CI runs it after the link check.

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

The README exists in the same 12 languages: `README.md` in English and `readmes/README.<code>.md` for the others. All 12 have the same sections in the same order, and their interface terms match the locale files. The documents in `docs/` are in English, except `dictionary-packs.md` and the archived `archive/size-and-structure-1.5.2.md`, which are in Chinese; the prompt for the promotional video, `promo/promo-video-prompt.md`, is in Chinese too. After editing any Markdown file, run `npm run docs:check`: it resolves every relative link and checks every anchor with GitHub's rules (lower case, punctuation removed, spaces turned into `-`, letters, marks and decimal digits of every script kept, images left out, a repeated heading numbered `-1`, `-2`… until its anchor is free).

## Release process

The version lives in three places, which must agree: `static/manifest.json`, `package.json` and `package-lock.json`. The build reads it from the manifest. Every version has an entry in `CHANGELOG.md`; versions follow [Semantic Versioning](https://semver.org/).

The workflow `.github/workflows/release.yml` (named "Build") runs on every push to `main`, on pull requests and on manual dispatch.

1. Job `build`: `npm ci`, `npm run typecheck`, `npm run locales:check`, `npm run docs:check`, `npm run imports:check`, `npm run test:coverage` and `npm run build`. The xpi is uploaded as a build artifact named after the version and the short commit hash, kept for 30 days.
2. Job `e2e`: the end-to-end test against the four Thunderbird versions listed above.
3. Job `release`, after both succeed and not for pull requests:
   - On a push, it replaces the `nightly` pre-release with the xpi of this commit, named `thunderbird-translate-<version>-<sha>.xpi`. The nightly build is for testing.
   - If no release `v<version>` exists yet, it creates one with the xpi, generated release notes, and marks it as the latest release.

A new versioned release therefore appears when a commit with a new version number reaches `main` and passes all checks. Pushing more commits with the same version only updates `nightly`.

The dictionary packs have their own manually triggered workflow, `.github/workflows/dicts.yml`, which publishes to the release `dicts-v1`; see [dictionary-packs.md](dictionary-packs.md#发布).

## Other developer documents

- [batching.md](batching.md): batch queue, request queues, timeouts and cost estimate.
- [providers.md](providers.md): endpoints, default models and thinking parameters of every service.
- [settings.md](settings.md): every setting and the detailed behavior.
- [bergamot.md](bergamot.md): the Bergamot engine module, model selection, storage and build.
- [dictionary-packs.md](dictionary-packs.md): data sources, pack format, extraction rules and build of the dictionary packs (in Chinese).
- [archive/size-and-structure-1.5.2.md](archive/size-and-structure-1.5.2.md): size of the xpi and the bundles, module dependencies and data flow of version 1.5.2, kept as a record; the numbers are outdated (in Chinese).
- [promo/promo-video-prompt.md](../promo/promo-video-prompt.md): the prompt for the promotional video (in Chinese).
