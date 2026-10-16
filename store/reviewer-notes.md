# Notes to reviewers

The text below, from "Notes to reviewers" to the end, goes into the "Notes to Reviewers" field of the submission on addons.thunderbird.net. A Simplified Chinese version for the developer is in [reviewer-notes.zh-CN.md](reviewer-notes.zh-CN.md).

---

## Notes to reviewers: Multi Translate for Thunderbird

Multi Translate for Thunderbird translates the body of the displayed message in place. Up to version 1.13 it was distributed on GitHub as "Thunderbird Translate"; the add-on id is unchanged.

### Testing (no account or key needed)

1. Install the xpi in a test profile. The setup guide opens in a tab; "Exit guide" closes it, and the defaults work.
2. Open a message that is not in English, for example one with this German text: "Könnten wir die Abnahme auf Donnerstag, 15 Uhr, verschieben? Am Mittwoch bin ich auf einer Messe in Hamburg."
3. Press Alt+A, or click "Translate message" in the message header toolbar and then "Translate this message". A panel above the message asks before the text goes to Google Translate (the default service). Click "Allow and translate": the English translation appears under each paragraph.
4. Alt+S switches to translation only; Alt+A again restores the original message. The popup of the toolbar button shows the same switches. The subject of the message appears translated in a line above the body.
5. Subjects of a folder: click "Translated subjects" in the main toolbar while a folder is shown. The page lists the messages with their translated subjects; a click on a row selects the message in the mail tab.
6. Offline translation: in the settings ("Options" in the Add-ons Manager), choose "Dictionary (offline)" for tier 1 and download the pack German → English under Dictionaries (2.0 MB from the GitHub releases of the project), then translate again. The dictionary result appears first and is replaced by Google's.

The AI services need the reviewer's own API key; nothing else in the extension depends on them.

### Source code and build

The xpi contains bundles made with esbuild (minified), so the source code archive is attached. `SOURCE-BUILD.md` in the archive gives the steps: Node.js 24.21.0 and npm 11.19.0 (Ubuntu 24.04 or Windows), `npm ci`, `npm run build`. The result is `web-ext-artifacts/thunderbird-translate-<version>.xpi`; it is identical byte for byte to the submitted xpi, which `sha256sum` confirms. After `npm ci` the build needs no network: the Bergamot engine is part of the archive and is checked against pinned sha256 hashes. The archive leaves out the tests, the documentation, the code of the end-to-end test build (`src/e2e/`) and the code of the experimental build (`src/experiments/`, published on GitHub only with its own add-on id), none of which the regular build reads; the build stops if a file of either directory or an `experiment_apis` entry gets into it.

### Permissions

| Permission | Why |
| --- | --- |
| `messagesRead` | subjects: `messageDisplay.getDisplayedMessage()` (`src/background/subject.ts`) reads the subject of the displayed message for the translated line above the body, since the content script runs inside the body and cannot see the header. The page of translated subjects (`src/subjects/`, the popup of `browser_action`) lists the messages of the mail tab with `mailTabs.getListedMessages()`, `messages.continueList()` and `messages.abortList()`, and reads the list again on `messages.onNewMailReceived`, `onDeleted` and `onMoved`. Only sender, date and subject are shown; no message body is read this way, nothing is stored. |
| `accountsRead` | the page of translated subjects only: Thunderbird requires it for `mailTabs.setSelectedMessages()` (a click on a row shows that message in the mail tab), for `mailTabs.onDisplayedFolderChanged` (the page follows the folder) and for the three `messages` events above. No account or folder data is read. |
| `messagesModify` | `messageDisplayScripts.register()` (background, `src/background/content-scripts.ts`) shows the translations inside the displayed message, and `tabs.executeScript()`/`insertCSS()` add the same script to a message already open when the extension starts. Thunderbird allows both only with this permission (without it `messenger.messageDisplayScripts` is undefined; tested in Thunderbird 156). No stored message is changed. |
| `sensitiveDataUpload` | the text of the displayed message goes to the translation services the user chose; before the first transfer to each online service the user confirms it in a panel above the message |
| `storage` | settings, translation cache and the state of the setup guide in `storage.local` (through the wrapper in `src/shared/ext.ts`, which is why the linter does not see the calls) |
| `unlimitedStorage` | the offline dictionary packs (0.3 to 3.6 MB each) and Bergamot models (13 to 48 MB per direction) in IndexedDB, which must not be evicted |
| host permissions | only the fixed addresses of the services: Google Translate, the two Microsoft Translator addresses, the default endpoints of 18 AI presets, Mozilla Remote Settings and its attachment CDN (Bergamot models), and GitHub with its two release download hosts (dictionary packs). The list is in `src/shared/hosts.ts`; a unit test keeps it equal to the manifest and to the presets. |
| optional `http://*/*`, `https://*/*` | an endpoint the user types (Ollama, LM Studio, DeepLX, Azure, a custom OpenAI-compatible service). The settings page asks for the single host with `permissions.request()` when the user clicks "Allow access" or "Test connection"; the background script refuses to send to a host without permission. |

Version 2.0 had removed `messagesRead` together with `tabs` and `<all_urls>`; 2.1 needs `messagesRead` again for the subjects, and `accountsRead` for the page of translated subjects. `tabs` and `<all_urls>` stay removed.

### Third-party code

- npm packages bundled into the scripts: the Vercel AI SDK (`ai` and the `@ai-sdk/*` providers), `zod` and `fzstd`, with their dependencies. `THIRD-PARTY-NOTICES.txt` in the xpi lists every bundled package with version, license and copyright; the build makes that list from the files esbuild read and stops when a package is missing from it.
- `bergamot-translator.js` and `bergamot-translator.wasm.zst`: Mozilla's Bergamot translation engine, the files Firefox and Thunderbird ship, unmodified (MPL-2.0). `VENDOR.md` in the source archive declares both:

| File | Source | sha256 |
| --- | --- | --- |
| `bergamot-translator.js` | https://raw.githubusercontent.com/mozilla-firefox/firefox/48d55cf7ec80093903e2ef7f58b61a84a22ef716/toolkit/components/translations/bergamot-translator/bergamot-translator.js | `faff1ef6285b0d26f01787776fd49299dfb756ecb9688aa990c250e66797b47d` |
| `bergamot-translator.wasm.zst` | https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-wasm-v2/a76f9efe-b185-4a7f-9c3b-5f5d216d12e6.zst (Remote Settings collection `main/translations-wasm-v2`, `bergamot-translator` 4.0, release v0.6.0, built from mozilla/translations at revision `1de4a085d3a7afb625c51a60aabb5ad298e4059f`) | `327fcfc7b7e9d95f6fa0844ebf899cfc05469872ef02d3aef5783182839a6255`; decompressed `f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926` |

The content security policy adds `'wasm-unsafe-eval'` only to compile this bundled engine in its worker; no script uses `eval` or `new Function`.

### Downloads at run time are data

The extension downloads no code. On request of the user it downloads:

- dictionary packs: gzip-compressed tab-separated word lists from the GitHub releases of this project, checked against the sha256 in the release index before they are stored;
- Bergamot models: Marian model, vocabulary and shortlist files from Mozilla Remote Settings, the files Firefox Translations uses, checked against the sha256 of their Remote Settings records before they are stored.

Both are read as data by the dictionary lookup and by the bundled engine.

### The http://localhost presets

Ollama and LM Studio are AI servers that run on the user's own computer. Their presets point to `http://localhost:11434/v1` and `http://localhost:1234/v1`, the loopback address: these requests do not leave the computer, and the endpoint field says so. They still need the optional host permission, granted by the user. Every other `http://` address is one the user typed.

### webext-linter

Run of thunderbird/webext-linter 2.3.2 on the xpi of 2.1.0 with `--sca-root` on the unpacked source archive (review schemas of Thunderbird 158.0.1). It traces `messagesRead` and `accountsRead` to their calls (`messageDisplay.getDisplayedMessage`, `mailTabs.getListedMessages`, `mailTabs.setSelectedMessages`, `mailTabs.onDisplayedFolderChanged`, `messages.continueList`, `messages.abortList` and the three `messages` events) and passes both. The remaining items are those of 2.0.0:

- sync-xhr (`bergamot-translator.js` lines 63 and 70): two synchronous `XMLHttpRequest`s in Emscripten's file loader of the unmodified Mozilla glue. The add-on never reaches them: the worker reads the wasm itself and hands it to `loadBergamot()` as `wasmBinary` (`src/offline/bergamot/worker.ts`, `worker-core.ts`), and the glue then skips its loader. The file is declared in `VENDOR.md`; in a source code review the linter reads vendoring from the archive only, so it scans the shipped copy as if it were authored.
- vendor source not auditable (info): the glue is not published on npm; its source is the Firefox repository at a fixed commit, and the sha256 matches.
- localized names (de, es, fr, pt_BR, ru, vi): "für", "para", "pour", "para", "для" and "cho" mean "for"; every name has the form "<name> for Thunderbird".
- possibly unused permissions `sensitiveDataUpload`, `storage`, `unlimitedStorage`: see Permissions above.
- possibly unused files: `bergamot-translator.js` is loaded with `importScripts()` and `bergamot-translator.wasm.zst` with `fetch()` in `bergamot-worker.js`; `welcome.html` (with `welcome.css`) is the setup guide, opened with `tabs.create()` after installation and from the popup and the settings page.
- user-data exfiltration sweeps on `fetch()` calls: `src/offline/bergamot/manager.ts` (model list and model files from Mozilla) and `src/offline/bergamot/index.ts` (the fetch it uses) send no user data; `src/offline/bergamot/worker.ts` and `src/shared/i18n-ext.ts` read files of the extension; `scripts/fetch-bergamot.mjs` is part of the build and downloads the engine only when the vendored copy is missing. Message text goes only to the translation services, after the consent panel.
- build process review: `npm ci` and `npm run build`, nothing else; `package.json` has no lifecycle scripts.
