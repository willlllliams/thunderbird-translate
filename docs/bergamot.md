# Offline machine translation (Bergamot)

The module in `src/offline/bergamot/` translates plain text on the user's computer with Bergamot, the Marian-based engine compiled to WebAssembly that Firefox Translations uses. The engine binary ships inside the xpi. Translation models are downloaded per language pair from Mozilla on request and stored in IndexedDB. After a pair is installed, translating with it needs no network access.

## Interface

`src/offline/bergamot/index.ts` exports `getBergamot()`, the `BergamotManager` of the background page (created on first use with the browser's IndexedDB, `fetch` and `Worker`), and `requiredPairs`. Translation runs in a Worker started by the page that owns the manager, so the extension keeps the manager in the background page. The settings page and the setup guide reach it through the messages handled in `src/background/bergamot-admin.ts`, so one engine sees every installation and removal.

| Method or function | Result |
| --- | --- |
| `translate(texts, src, tgt)` | `Promise<string[]>`, one output per input, same order |
| `listPairs(forceRefresh?)` | `Promise<BergamotPairInfo[]>`, sorted by source, then target |
| `install(src, tgt, onProgress?, signal?)` | `Promise<void>`; `onProgress(doneBytes, totalBytes)`. Requests of the pages go through `bergamot-admin.ts`, which runs one installation per pair: a second request shares the running one's progress, cancellation and result |
| `remove(src, tgt)` | `Promise<void>` |
| `missingPairs(pairs)` | the entries of `pairs` that are not installed |
| `requiredPairs(src, tgt)` | `Array<[string, string]>`, the direction pairs a translation needs |
| `normalizeBergamotLang(code)` (`languages.ts`) | the model tag for an application or detector code |

`translate` behaves as follows:

- `src` is a language; `"auto"` throws `bergamotDetectFailed`. Automatic detection happens before, in `src/background/translators/bergamot.ts`, for every text on its own with the shared detection of `src/shared/lang-detect.ts`: `browser.i18n.detectLanguage` from 12 letters on, when it is reliable and its top language covers at least 60 % of the text, else the script and the English stop words. A text that none of these place takes the language found most often among the texts of the call, else English. The texts of each language go to `translate` together, and the results are put back in their order; a language whose models are missing fails for its texts only.
- When source and target are the same language, the texts come back unchanged.
- Empty and whitespace-only texts come back unchanged without reaching the engine. Leading and trailing whitespace of every text is kept, and line breaks inside a text survive translation.
- Input is plain text. The engine also has an HTML mode, but it misplaces tags in Chinese, Japanese and Korean output, so the module does not use it.
- When a needed pair is not installed, the call throws `bergamotModelMissing` and names the missing pairs.
- A worker that does not answer a request within 2 minutes is terminated, the call fails with `bergamotEngineFailed`, and the next call starts a fresh worker.

`BergamotPairInfo` has these fields:

| Field | Meaning |
| --- | --- |
| `src`, `tgt` | model tags, e.g. `en`, `zh-Hans` |
| `version` | model version offered by Mozilla, e.g. `3.0` |
| `architecture` | `tiny`, `base` or `base-memory` |
| `bytes` | download size (compressed); this is also what IndexedDB stores |
| `rawBytes` | size after decompression |
| `installed` | whether the pair is in IndexedDB |
| `installedVersion` | present only when the installed version differs from `version`; installing again updates the pair |

Pairs that are installed but no longer offered by Mozilla stay in the list with the installed version.

## Language tags and translation through English

Mozilla's models use BCP 47 tags with scripts for Chinese. `normalizeBergamotLang` maps the codes used elsewhere in the extension and by the detector:

| Input | Model tag |
| --- | --- |
| `zh`, `zh-CN`, `zh-SG`, `zh-Hans` | `zh-Hans` |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | `zh-Hant` |
| `iw` | `he` |
| `no` | `nb` |
| `in` | `id` |
| `fil` | `tl` |
| `ji` | `yi` |
| any other tag | its primary subtag, e.g. `pt-BR` → `pt` |

Every model has English on one side. A pair without English runs through two models in one engine call (`translateViaPivoting`): Japanese to Simplified Chinese uses `ja → en`, then `en → zh-Hans`. `requiredPairs` returns the pairs for a translation:

```ts
requiredPairs("en", "zh-CN") // [["en", "zh-Hans"]]
requiredPairs("ja", "zh-TW") // [["ja", "en"], ["en", "zh-Hant"]]
requiredPairs("de", "de")    // []
```

Storage works per direction pair. Removing `ja → en` leaves `en → zh-Hans` intact, and both stay usable for other combinations. The settings page should therefore present a combination such as Japanese → Chinese as the two pairs it needs, and warn before removing a pair that another chosen combination still uses.

## Model selection

The list comes from Mozilla Remote Settings, collection `main/translations-models-v2` at `https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models-v2/records`. The attachment base URL is read from `capabilities.attachments.base_url` of the server root (currently `https://firefox-settings-attachments.cdn.mozilla.net/`). The CDN sends no CORS headers; the extension's `<all_urls>` host permission covers it.

One file set per direction pair is chosen with the rules Firefox applies:

1. Only versions `3.x` count. Pre-releases with a letter suffix (`3.0a1`) and other major versions are dropped.
2. `filter_expression` must be empty or `env.appinfo.OS != 'Android'`. Records for Android and for Nightly-only channels are dropped.
3. File types other than `model`, `lex`, `vocab`, `srcvocab` and `trgvocab` are ignored, which includes `qualityModel`.
4. For each pair and file name the highest version wins.
5. The pair's version is that of its `model` file. Only files of exactly that version belong to the pair.
6. A pair needs a model and either `vocab` or both `srcvocab` and `trgvocab`. When both forms exist, `vocab` is used. `lex` (the shortlist) is optional.

Rule 5 matters for pairs such as `en → ko`: the Android set (3.1) has separate source and target vocabularies, the desktop set (3.0) has one shared vocabulary, and mixing the two would load a vocabulary that does not belong to the model.

On 2026-10-11 the collection held 404 records, and the rules leave 114 direction pairs among 58 languages. A model file is 12 to 45 MB compressed; `en → zh-Hans` downloads 34.5 MiB in total.

The list is kept in memory for 6 hours and saved in IndexedDB. When Mozilla cannot be reached, the saved copy is used. When there is no saved copy, or when the caller forces a refresh (the reload button of the settings page), the call throws `bergamotRecordsFailed`.

## Installation and storage

Every file is zstd-compressed. Installation downloads the files one after another and checks each of them:

1. sha256 of the downloaded bytes against `attachment.hash`;
2. decompression with fzstd;
3. size and sha256 of the result against `decompressedSize` and `decompressedHash`.

A failed check throws `bergamotChecksumMismatch` with the file name and stores nothing. Only after all files of a pair pass are they written, together with the pair record, in one IndexedDB transaction.

The IndexedDB database `tt-bergamot` has three object stores:

| Store | Key | Content |
| --- | --- | --- |
| `pairs` | `"src>tgt"` | version, architecture, sizes and the file list (type, name, both hashes, both sizes) |
| `files` | sha256 of the compressed file | the compressed bytes as downloaded |
| `meta` | name | the cached model list |

Files are stored compressed and decompressed in the worker when a pair is loaded, which costs about 0.3 s for a 45 MB model. Removing a pair deletes the files no other pair lists. Reinstalling a pair at a newer version replaces its files in the same way. The `unlimitedStorage` permission keeps the browser from evicting the data and from capping it.

## Engine

`bergamot-worker.js` is a classic Worker (`new Worker(browser.runtime.getURL("bergamot-worker.js"))`). On its first request it loads `bergamot-translator.js` with `importScripts`, fetches `bergamot-translator.wasm.zst` from the extension, decompresses it and calls `loadBergamot` with a 40 MiB initial heap. A model is loaded by copying each decompressed file into `AlignedMemory` (alignment 256 for the model, 64 for the others) and constructing `TranslationModel` with the Marian options Firefox uses:

```text
beam-size: 1
normalize: 1.0
word-penalty: 0
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
skip-cost: true
cpu-threads: 0
quiet: true
quiet-translation: true
gemm-precision: int8shiftAlphaAll   (int8shiftAll for model files ending in intgemm8.bin)
alignment: soft
```

All texts of one call go into one `VectorString` and are translated by a `BlockingService` with the cache disabled. Before translation the module applies Firefox's text clean-up: it removes soft hyphens, and for Chinese, Japanese and Korean sources it inserts a space between `。！？` and a following `“` so that the sentence splitter keeps the quote with its sentence.

The background side (`engine.ts`) serializes requests and keeps at most two direction pairs loaded, which is what a translation through English needs. A third pair evicts the least recently used one. After 5 minutes without requests the worker is terminated. The WebAssembly heap never shrinks, so terminating the worker is the only way to return its memory. A failure inside the engine also terminates the worker, and the next call starts a fresh one.

Worker messages are defined in `protocol.ts`. Each request carries an id, the worker answers every request exactly once and in order:

| Request | Answer |
| --- | --- |
| `load { key, src, tgt, files }` (compressed `ArrayBuffer`s, transferred) | `ok` |
| `unload { key }` | `ok` |
| `translate { keys, texts }` (one key, or two for English in between) | `ok`, `result: string[]` |

## Build

`scripts/fetch-bergamot.mjs` downloads the engine during `npm run build` (or on its own with `npm run fetch:bergamot`), checks it and caches it in `.cache/bergamot/`. The build copies it unchanged into the xpi together with `vendor/bergamot/bergamot-translator.js`. Later builds use the cache when its hash still matches.

| Item | Value |
| --- | --- |
| Record | `main/translations-wasm-v2`, id `ce71828c-5e7a-4024-8f18-03064bf0b9f0` |
| Name, version | `bergamot-translator` 4.0, release v0.6.0, revision `1de4a085d3a7afb625c51a60aabb5ad298e4059f` |
| File | `main-workspace/translations-wasm-v2/a76f9efe-b185-4a7f-9c3b-5f5d216d12e6.zst` |
| sha256 (zstd file, 1,211,955 bytes) | `327fcfc7b7e9d95f6fa0844ebf899cfc05469872ef02d3aef5783182839a6255` |
| sha256 (wasm, 4,960,506 bytes) | `f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926` |
| License | MPL-2.0 |

The glue script and the binary must come from the same build. `vendor/bergamot/README.md` records where the glue comes from. To move to a newer engine, replace the glue and update the pinned values in `scripts/fetch-bergamot.mjs` in the same change.

## Permissions and content security policy

The manifest gains the `unlimitedStorage` permission and an explicit policy, `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. `'wasm-unsafe-eval'` allows compiling WebAssembly and nothing else. The other scripts of the extension are bundled files loaded from the package and use neither `eval` nor `new Function`, so the policy does not change how they run.

## Message keys for the interface

The module throws `LocalizedError` with the keys below, so `describeError` shows the message in the interface language. The server or engine detail follows it after ` - `. Storage, model list and worker failures inside the module are plain `Error`s whose message becomes that detail.

| Key | English text | Placeholders |
| --- | --- | --- |
| `bergamotModelMissing` | The offline translation model for $1 → $2 is not installed. Install these language pairs in the settings: $3 | `$1` source tag, `$2` target tag, `$3` missing pairs, e.g. `ja → en, en → zh-Hans` |
| `bergamotUnsupportedPair` | Offline translation does not support $1 → $2. | `$1` source, `$2` target |
| `bergamotDetectFailed` | Could not detect the language of the text. Choose the source language for offline translation. | none |
| `bergamotRecordsFailed` | Could not load the list of offline translation models from Mozilla. | none; detail: the network error |
| `bergamotDownloadFailed` | Could not download the offline model file $1. | `$1` file name; detail: HTTP status or network error |
| `bergamotChecksumMismatch` | The downloaded model file $1 is damaged (checksum mismatch). Try the installation again. | `$1` file name; detail: expected and actual hash |
| `bergamotStorageFailed` | Could not save or read the offline models in the extension storage. | none; detail: the IndexedDB error |
| `bergamotEngineFailed` | The offline translation engine failed. | none; detail: the engine message |

## Measurements

Both runs below translated three English email sentences to Simplified Chinese and one German sentence to Simplified Chinese through English, on Windows 11 x64.

| Step | Node 24 | Thunderbird 156.0.1 (headless) |
| --- | --- | --- |
| Model list (114 pairs) | 253 ms (Mozilla) | 144 ms (local copy) |
| Install `en → zh-Hans`, 34.5 MiB | 1.2 s (Mozilla CDN) | 6.6 s (local server) |
| First translation: wasm start, model load, translation | 1.0 s | 1.2 s |
| Same texts again | 141 ms | 53 ms |
| `de → en → zh-Hans`, loading `de → en` | 645 ms | 755 ms |
| Wasm heap with both pairs loaded | 395 MiB | 395 MiB |

In Thunderbird the worker stopped after the idle time (shortened to 4 s for the test) and the next call started a new one in 1.1 s. With both pairs loaded, all Thunderbird processes of the test profile together peaked at 1.04 GiB working set. Installation took five times longer in Thunderbird than in Node although the files came from a local server; the time goes into hashing, decompressing for verification and writing to IndexedDB, and was not broken down further.

Sample output (`en → zh-Hans`):

> The meeting has been moved to Thursday at 10 a.m. → 会议已移至周四上午10点。

## Known limitations

- Translation quality is below the online services, especially for idioms and informal greetings. The model writes ASCII commas in some Chinese sentences (`嗨,安娜`).
- One engine call blocks the worker until it finishes. A long email is translated in one batch, and other translations wait for it.
- Detection on short texts falls back to the caller's source language. When the caller passes none, short texts with `src = "auto"` fail with `bergamotDetectFailed`.
- The engine build is single-threaded (`cpu-threads: 0`, no wasm threads in the glue), as in Firefox. A long email uses one CPU core.
- Two loaded pairs take about 400 MiB in the worker until the idle timeout.
