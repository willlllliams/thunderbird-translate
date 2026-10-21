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

The AI services need the reviewer's own API key; nothing else in the extension depends on them. The same holds for the summary and the four machine translators with an account of their own, described below.

### Since 2.3.0: machine translators with the user's own key

DeepL, Baidu Translate, Youdao and Caiyun are machine translators of tier 2. Each needs a key of the user's own account, entered on the settings page; without a key the preset is not added and sends nothing. The key is stored in `storage.local` and sent only to its own service, like the keys of the AI services. The requests go to fixed hosts of the manifest:

| Host | Service | Request |
| --- | --- | --- |
| `api.deepl.com`, `api-free.deepl.com` | DeepL API (Pro keys, and the keys of the free plan, which end in `:fx`) | `POST /v2/translate` with `Authorization: DeepL-Auth-Key <key>`; "Test connection" reads `GET /v2/usage` (`src/background/translators/deepl.ts`) |
| `fanyi-api.baidu.com` | Baidu Translate | `POST /api/trans/vip/translate`, signed with MD5 of app ID, text, salt and key (`baidu.ts`) |
| `openapi.youdao.com` | Youdao | `POST /v2/api`, signed with SHA-256 through Web Crypto (`youdao.ts`) |
| `api.interpreter.caiyunai.com` | Caiyun | `POST /v1/translator` with `X-Authorization: token <token>` (`caiyun.ts`) |

Web Crypto has no MD5, so `src/shared/md5.ts` is a plain implementation of RFC 1321 (48 lines, not minified in the source archive, tested with the test suite of the RFC). It signs Baidu requests and is used for nothing else. The extension calls DeepL from its background script with the host permission and changes no request header; no `webRequest` permission is involved.

### Since 2.3.0: summary and to-dos

"Summary and to-dos" in the popup sends the displayed message (its text up to 20,000 characters, with sender, date and subject from `messageDisplay.getDisplayedMessage()`) to the AI service of the summary, which is the AI tier unless the user chose another AI service for it. It uses the consent of the translation: before the service first receives message text, the panel above the message asks, and the background script refuses the request without it (`src/background/service.ts`, `summarize()`). The answer is a JSON object; the panel (`src/content/summary.ts`) builds it with `createElement` and text nodes only. "Copy as Markdown" writes the summary to the clipboard with `navigator.clipboard.writeText()` from the click of the user, falling back to `document.execCommand("copy")`; no clipboard permission is requested. The command `summarize` of the manifest has no default key.

To test it with an AI key of your own: choose an AI service for tier 3 in the settings, open the German message of step 2, click "Summary and to-dos" in the popup and allow the service in the panel. The panel above the message lists the summary, the to-dos, the questions to answer and the dates.

### Since 2.4.0: text in images

With precise translation on, an AI service can read the text in the images of the displayed message; the result is text under each image (a table of the original and its translation). Nothing is drawn on an image and no image is generated.

- Which images: the images of the body (`cid:` and `data:`) and the image attachments Thunderbird shows under the body. Remote images are never read or sent; the content script skips every `http:`/`https:` image. It also skips tracking pixels, images under the size limits of the settings and images in a signature (`src/shared/image.ts`).
- How the bytes are read: the background script reads the part with `messages.getAttachmentFile(messageId, partName)` (`src/background/subject.ts`, `messagePart()`), the part name taken from the address Thunderbird gives the image, and the id of the displayed message from `messageDisplay.getDisplayedMessage()`. Both need only `messagesRead`, which the extension has since 2.1. It reads image parts only: the parts of the images that pass the filters of the content script, when the translation of a message starts, to look up cached results and to check size and animation on the computer; a part whose file is not an image is dropped. No other attachment is read.
- When an image is sent: in the default mode "Ask under each image" after a click on "Translate image text" under that image; in the mode "On" by itself, at most five per message by default. The image is decoded with `createImageBitmap()`, scaled to at most 1568 px and encoded again as JPEG with `OffscreenCanvas` in the background page, which drops its file name and metadata (`src/background/images.ts`), and sent to the vision service (the AI service of tier 3 unless the user chose another) through the AI SDK.
- Consent: images have their own list, `imageConsent`, apart from the consent for text. Before the first image goes to a service, a panel under the image names the service, its host, what is sent and the stated data policy of Anthropic, Gemini or OpenAI; the background script refuses an image request for a service without consent (`ImageService.request()`). The settings page lists and revokes the services allowed for images.
- No new permission and no new host: the vision services are the AI presets, whose default endpoints are already in the manifest.

To test it without an AI key (the consent panel and that nothing is sent before it):

1. In the settings, choose OpenAI for tier 3 (no key needed to choose it) and turn on "Precise translation". "Image translation" under it shows "Ask under each image".
2. Send yourself a message with an image of at least 200 × 200 pixels in the body or attached, open it and press Alt+A.
3. A "Translate image text" button appears under the image. Click it: a panel under the image asks before the image goes to OpenAI. "Cancel" brings the button back; "Allow and translate image" sends the request, which without a key ends with "OpenAI: API key is required" under the image.

With an AI key of your own the result appears as a table under the image; "Test image" under the vision model on the settings page sends a built-in image that reads "TEST 42".

### Source code and build

The xpi contains bundles made with esbuild (minified), so the source code archive is attached. `SOURCE-BUILD.md` in the archive gives the steps: Node.js 24.21.0 and npm 11.19.0 (Ubuntu 24.04 or Windows), `npm ci`, `npm run build`. The result is `web-ext-artifacts/thunderbird-translate-<version>.xpi`; it is identical byte for byte to the submitted xpi, which `sha256sum` confirms. After `npm ci` the build needs no network: the Bergamot engine is part of the archive and is checked against pinned sha256 hashes. The archive leaves out the tests, the documentation, the code of the end-to-end test build (`src/e2e/`) and the code of the experimental build (`src/experiments/`, published on GitHub only with its own add-on id), none of which the regular build reads; the build stops if a file of either directory or an `experiment_apis` entry gets into it.

### Permissions

| Permission | Why |
| --- | --- |
| `messagesRead` | subjects: `messageDisplay.getDisplayedMessage()` (`src/background/subject.ts`) reads the subject of the displayed message for the translated line above the body, and its sender and date for the summary the user asks for, since the content script runs inside the body and cannot see the header. The page of translated subjects (`src/subjects/`, the popup of `browser_action`) lists the messages of the mail tab with `mailTabs.getListedMessages()`, `messages.continueList()` and `messages.abortList()`, and reads the list again on `messages.onNewMailReceived`, `onDeleted` and `onMoved`. Only sender, date and subject are shown; no message body is read this way, nothing is stored. Since 2.4.0, image translation reads the image parts of the displayed message with `messages.getAttachmentFile()` (`subject.ts`, `messagePart()`), see above: images of the body and image attachments only, never another attachment. |
| `accountsRead` | the page of translated subjects only: Thunderbird requires it for `mailTabs.setSelectedMessages()` (a click on a row shows that message in the mail tab), for `mailTabs.onDisplayedFolderChanged` (the page follows the folder) and for the three `messages` events above. No account or folder data is read. |
| `messagesModify` | `messageDisplayScripts.register()` (background, `src/background/content-scripts.ts`) shows the translations inside the displayed message, and `tabs.executeScript()`/`insertCSS()` add the same script to a message already open when the extension starts. Thunderbird allows both only with this permission (without it `messenger.messageDisplayScripts` is undefined; tested in Thunderbird 156). No stored message is changed. |
| `sensitiveDataUpload` | the text of the displayed message goes to the translation services the user chose; before the first transfer to each online service the user confirms it in a panel above the message. Images of the message go to the vision service the user chose, after a consent of their own in a panel under the image |
| `storage` | settings, translation cache and the state of the setup guide in `storage.local` (through the wrapper in `src/shared/ext.ts`, which is why the linter does not see the calls) |
| `unlimitedStorage` | the offline dictionary packs (0.3 to 3.6 MB each) and Bergamot models (13 to 48 MB per direction) in IndexedDB, which must not be evicted |
| host permissions | only the fixed addresses of the services: Google Translate, the two Microsoft Translator addresses, the two DeepL addresses, Baidu Translate, Youdao and Caiyun (machine translators with the user's key, see above), the default endpoints of 18 AI presets, Mozilla Remote Settings and its attachment CDN (Bergamot models), and GitHub with its two release download hosts (dictionary packs). The list is in `src/shared/hosts.ts`; a unit test keeps it equal to the manifest and to the presets. |
| optional `http://*/*`, `https://*/*` | an endpoint the user types (Ollama, LM Studio, DeepLX, Azure, a custom OpenAI-compatible service). The settings page asks for the single host with `permissions.request()` when the user clicks "Allow access" or "Test connection"; the background script refuses to send to a host without permission. |

Version 2.0 had removed `messagesRead` together with `tabs` and `<all_urls>`; 2.1 needs `messagesRead` again for the subjects, and `accountsRead` for the page of translated subjects. `tabs` and `<all_urls>` stay removed.

### Third-party code

- npm packages bundled into the scripts: the Vercel AI SDK (`ai` and the `@ai-sdk/*` providers), `zod` and `fzstd`, with their dependencies. `THIRD-PARTY-NOTICES.txt` in the xpi lists every bundled package with version, license and copyright; the build makes that list from the files esbuild read and stops when a package is missing from it.
- `bergamot-translator.js` and `bergamot-translator.wasm.zst`: Mozilla's Bergamot translation engine, the files Firefox and Thunderbird ship, unmodified (MPL-2.0). `VENDOR.md` in the source archive declares both:

| File | Source | sha256 |
| --- | --- | --- |
| `bergamot-translator.js` | https://raw.githubusercontent.com/mozilla-firefox/firefox/48d55cf7ec80093903e2ef7f58b61a84a22ef716/toolkit/components/translations/bergamot-translator/bergamot-translator.js | `faff1ef6285b0d26f01787776fd49299dfb756ecb9688aa990c250e66797b47d` |
| `bergamot-translator.wasm.zst` | https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-wasm-v2/a76f9efe-b185-4a7f-9c3b-5f5d216d12e6.zst (Remote Settings collection `main/translations-wasm-v2`, `bergamot-translator` 4.0, release v0.6.0, built from mozilla/translations at revision `1de4a085d3a7afb625c51a60aabb5ad298e4059f`) | `327fcfc7b7e9d95f6fa0844ebf899cfc05469872ef02d3aef5783182839a6255`; decompressed `f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926` |

The content security policy adds `'wasm-unsafe-eval'` only to compile this bundled engine in its worker. No script of the extension calls `eval` or the `Function` constructor. The bundled zod library (in `chunks/llm-*.js`, loaded with the AI SDK) contains code that builds functions with the `Function` constructor: a feature probe, an optional compiler for object schemas, and `z.compile()`, which nothing calls. The extension sets `z.config({ jitless: true })` before any schema is created (`src/background/translators/zod-config.ts`), so none of it runs; the content security policy, which has no `'unsafe-eval'`, would block it as well.

Since 2.2.0 the Markdown of AI translations is shown formatted. `src/shared/markdown.ts` builds it with `createElement`, `createTextNode` and `setAttribute` and never assigns a translation to `innerHTML`; the elements are `strong`, `em`, `code`, `del`, `a`, `ul`, `ol`, `li` and `br`, and a link gets an address only when it starts with `http:`, `https:` or `mailto:`. Since 2.4.0 the answers about images add `p`, `table`, `thead`, `tbody`, `tr`, `th` and `td`, built the same way; a cell gets at most the class `tt-align-center` or `tt-align-right`.

### Downloads at run time are data

The extension downloads no code. On request of the user it downloads:

- dictionary packs: gzip-compressed tab-separated word lists from the GitHub releases of this project, checked against the sha256 in the release index before they are stored;
- Bergamot models: Marian model, vocabulary and shortlist files from Mozilla Remote Settings, the files Firefox Translations uses, checked against the sha256 of their Remote Settings records before they are stored.

Both are read as data by the dictionary lookup and by the bundled engine.

### The http://localhost presets

Ollama and LM Studio are AI servers that run on the user's own computer. Their presets point to `http://localhost:11434/v1` and `http://localhost:1234/v1`, the loopback address: these requests do not leave the computer, and the endpoint field says so. They still need the optional host permission, granted by the user. Every other `http://` address is one the user typed.

### webext-linter

Run of thunderbird/webext-linter 2.3.2 on the xpi of 2.2.0 with `--sca-root` on the unpacked source archive (review schemas of Thunderbird 158.0.2). Its findings are those of 2.1.0, run the same way: the unsafe-html check reports nothing, the Markdown rendering of 2.2.0 included. It traces `messagesRead` and `accountsRead` to their calls (`messageDisplay.getDisplayedMessage`, `mailTabs.getListedMessages`, `mailTabs.setSelectedMessages`, `mailTabs.onDisplayedFolderChanged`, `messages.continueList`, `messages.abortList` and the three `messages` events) and passes both. The remaining items are those of 2.0.0:

- sync-xhr (`bergamot-translator.js` lines 63 and 70): two synchronous `XMLHttpRequest`s in Emscripten's file loader of the unmodified Mozilla glue. The add-on never reaches them: the worker reads the wasm itself and hands it to `loadBergamot()` as `wasmBinary` (`src/offline/bergamot/worker.ts`, `worker-core.ts`), and the glue then skips its loader. The file is declared in `VENDOR.md`; in a source code review the linter reads vendoring from the archive only, so it scans the shipped copy as if it were authored.
- vendor source not auditable (info): the glue is not published on npm; its source is the Firefox repository at a fixed commit, and the sha256 matches.
- localized names (de, es, fr, pt_BR, ru, vi): "für", "para", "pour", "para", "для" and "cho" mean "for"; every name has the form "<name> for Thunderbird".
- possibly unused permissions `sensitiveDataUpload`, `storage`, `unlimitedStorage`: see Permissions above.
- possibly unused files: `bergamot-translator.js` is loaded with `importScripts()` and `bergamot-translator.wasm.zst` with `fetch()` in `bergamot-worker.js`; `welcome.html` (with `welcome.css`) is the setup guide, opened with `tabs.create()` after installation and from the popup and the settings page.
- user-data exfiltration sweeps on `fetch()` calls: `src/offline/bergamot/manager.ts` (model list and model files from Mozilla) and `src/offline/bergamot/index.ts` (the fetch it uses) send no user data; `src/offline/bergamot/worker.ts` and `src/shared/i18n-ext.ts` read files of the extension; `scripts/fetch-bergamot.mjs` is part of the build and downloads the engine only when the vendored copy is missing. Message text goes only to the translation services, after the consent panel.
- build process review: `npm ci` and `npm run build`, nothing else; `package.json` has no lifecycle scripts.
