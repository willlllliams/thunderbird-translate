# Notes to reviewers

The text below, from "Notes to reviewers" to the end, goes into the "Notes to Reviewers" field of the submission on addons.thunderbird.net. A Simplified Chinese version for the developer is in [reviewer-notes.zh-CN.md](reviewer-notes.zh-CN.md).

---

## Notes to reviewers: Multi Translate for Thunderbird

Multi Translate for Thunderbird translates the body of the displayed message in place. Up to version 1.13 it was distributed on GitHub as "Thunderbird Translate"; the add-on id is unchanged.

### Testing (no account or key needed)

1. Install the xpi in a test profile. The setup guide opens in a tab; "Exit guide" closes it, and the defaults work.
2. Open a message that is not in English, for example one with this German text: "Könnten wir die Abnahme auf Donnerstag, 15 Uhr, verschieben? Am Mittwoch bin ich auf einer Messe in Hamburg."
3. Press Alt+A, or click "Translate message" in the message header toolbar and then "Translate this message". A panel above the message asks before the text goes to Google Translate (the default service). Click "Allow and translate": the English translation appears under each paragraph.
4. Alt+S switches to translation only; Alt+A again restores the original message. The popup of the toolbar button shows the same switches.
5. Offline translation: in the settings ("Options" in the Add-ons Manager), choose "Dictionary (offline)" for tier 1 and download the pack German → English under Dictionaries (2.0 MB from the GitHub releases of the project), then translate again. The dictionary result appears first and is replaced by Google's.

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

### Since 3.0.0: automatic summary, and one request for analysis and summary

"Automatic summary" in the Summary and to-dos section of the settings page is off by default. "When the message is translated" opens the summary when a translation of the message starts; "For every opened message" opens it for every displayed message with text. It goes through the same path as a click (`src/content/client.ts`, `autoSummary()`), once per message: the consent panel asks before the service first receives message text, and "Cancel" holds for that message.

With precise translation, a message whose paragraphs do not fit into one request gets an analysis first (summary, glossary, tone). When the summary uses the same AI service and model as tier 3, and that service is allowed to receive message text, one request writes the analysis and the summary together (`src/background/summary.ts`, `buildCombinedSystem()`; `src/background/service.ts`, `analysisWithSummary()`). The request goes to the same host with the same data as the two separate requests, the message text and its sender, date and subject, and the consent is checked again when it leaves the queue. No new permission or host.

### Since 3.0.0: removed

Subject translation is removed: the translated subject above the body, its setting, and the page of translated subjects with its `browser_action` button in the main toolbar. With it the permission `accountsRead` is removed. The experimental build with its experiment API is no longer built or published.

### Since 3.0.0: text in images

With precise translation on, an AI service can read the text in the images of the displayed message; the result is text under each image (a table of the original and its translation). Nothing is drawn on an image and no image is generated.

- Which images: the images of the body (`cid:` and `data:`) and the image attachments Thunderbird shows under the body. Up to 3.0 remote images were never read; since 3.1.0 a remote image that Thunderbird already shows takes part, see the next section. The content script also skips tracking pixels, images under the size limits of the settings and images in a signature (`src/shared/image.ts`).
- How the bytes are read: the background script reads the part with `messages.getAttachmentFile(messageId, partName)` (`src/background/displayed.ts`, `messagePart()`), the part name taken from the address Thunderbird gives the image, and the id of the displayed message from `messageDisplay.getDisplayedMessage()`. Both need only `messagesRead`, which the extension has since 2.1. It reads image parts only: the parts of the first images that pass the filters of the content script, when the translation of a message starts, to look up cached results and to check size, animation and pixel count on the computer; a part whose file is not an image, or whose file name differs from the one in the address of the image, is dropped. It reads only from the message that was displayed when the content script connected, while the tab still displays it. No other attachment is read.
- When an image is sent: in the default mode "Ask under each image" after a click on "Translate image text" under that image; in the mode "On" by itself, at most five per message by default. The image is decoded with `createImageBitmap()`, scaled to at most 1568 px and encoded again as JPEG with `OffscreenCanvas` in the background page, which drops its file name and metadata (`src/background/images.ts`), and sent to the vision service (the AI service of tier 3 unless the user chose another) through the AI SDK.
- Consent: images have their own list, `imageConsent`, apart from the consent for text. Before the first image goes to a service, a panel under the image names the service, its host, what is sent and the stated data policy of Anthropic, Gemini or OpenAI; the background script refuses an image request for a service without consent (`ImageService.request()`), and checks the consent, the mode and the service again when the request leaves its queue, so an image waiting there is not sent after a revocation; a content script that goes away aborts what it still waits for. The glossary of precise translation goes with an image only to the AI tier or to a service also allowed to receive message text. The settings page lists and revokes the services allowed for images.
- No new permission and no new host: the vision services are the AI presets, whose default endpoints are already in the manifest.

To test it without an AI key (the consent panel and that nothing is sent before it):

1. In the settings, choose OpenAI for tier 3 (no key needed to choose it). The image settings under "Precise translation" are greyed out with the button "Turn on precise translation"; click it. "Image translation" then shows "Ask under each image".
2. Send yourself a message with an image of at least 200 × 200 pixels in the body or attached, open it and press Alt+A.
3. A "Translate image text" button appears under the image. Click it: a panel under the image asks before the image goes to OpenAI. "Cancel" brings the button back; "Allow and translate image" sends the request, which without a key ends with "OpenAI: API key is required" under the image.

With an AI key of your own the result appears as a table under the image; "Test image" under the vision model on the settings page sends a built-in image that reads "TEST 42".

### Since 3.1.0: remote images that Thunderbird already shows

Newsletters carry their text in remote images, and 3.0 skipped them without a word. Since 3.1.0 image translation also takes a remote image (`http:`/`https:`), under these conditions:

- Only an image Thunderbird already shows: the content script takes an `<img>` with an http(s) address only when `complete` is true and `naturalWidth` is above 0, that is when the user allowed remote content for the message or its sender and the image loaded (`src/content/images.ts`, `consider()`). A blocked or broken remote image is never requested; a notice above the message counts it and says that remote content has to be shown.
- The bytes: the pixels of the displayed `<img>` cannot be read from the content script. Gecko marks a canvas write-only once an image of another origin is drawn on it (`CanvasUtils::DoDrawImageSecurityCheck`); the exception for extensions covers only an image whose principal is the extension's own, while an image of the message has the principal of its remote server. So the background script requests the image again with `fetch()` (`src/background/remote-images.ts`, `fetchRemoteImage()`): `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `cache: "default"`, a timeout of 20 s, and at most 15 MB, checked by Content-Length before reading and while reading the stream (`readBody()` of `src/shared/download.ts`). Only http and https, no address with a user name or password. An answer typed `application/octet-stream` or untyped counts only when its first bytes are PNG, GIF, JPEG or WebP.
- Public hosts only: an address on this computer or in the local network is never requested (`isPublicHost()` in `src/shared/hosts.ts`: names without a dot, `localhost`, `.local`, `.internal`, `.home.arpa` and similar, the private, loopback, link-local, CGNAT and reserved IPv4 ranges, and their IPv6 counterparts, IPv4-mapped, NAT64 and 6to4 addresses included; the URL parser has already normalized decimal, hex, octal and short IPv4 forms). `fetch()` follows redirects; an extension sees neither the hops nor their `Location` (`redirect: "manual"` gives an opaque response), so the final address `response.url` is checked as well, and an answer that ends on such a host is dropped unread. The intermediate request still goes out, without cookies; nothing of its answer reaches the extension or a service. A name that the DNS resolves to a private address is not caught: the extension has no `dns` permission. The e2e build alone reads its mock server on 127.0.0.1, through `localImageOrigin` of `src/hooks/servers.ts`, which is undefined in every other build.
- When it is requested: in the mode "On" when the translation of the message starts, for the first images up to twice the limit per message; in the mode "Ask under each image" only after a click on its button. A peek in mode "Ask" reads nothing from the network: it finds an earlier result only through a cache entry that ties the address within the same message to the SHA-256 of the bytes translated last.
- Bound to the displayed message: the address must appear in an image (`src`, `srcset`) of the HTML of the message the content script was opened for, read with `messages.getFull()` (`messagesRead`) and parsed with `DOMParser` without loading anything (`displayed.ts`, `messageImageAddresses()`), and the tab must still show that message. `srcset` is split by the parsing rules of HTML, so an address with commas (an image CDN with transform parameters) stays whole. A content script cannot make the extension read another address; a redirect can, within public hosts only (see above).
- Permission: this uses the optional host permissions `http://*/*` and `https://*/*` that the manifest of 3.0 already declares. The extension asks for them only from a click of the user: "Allow reading remote images" in the popup of the message header button, or on the settings page under the image settings. A content script has no permissions API, so the button under an image and the notice above the message have the background script open the popup with `messageDisplayAction.openPopup()` (Thunderbird 113 and later need no user action for it), where the user clicks. Without the permission the background script answers an image request with "access" and reads nothing (`ImageService.request()`, `mayRead()`). "Remove access" on the settings page calls `permissions.remove()`.
- Everything else is as for the other images: the filters, the consent per service and host, the limits per message, the scaling and the JPEG encoding, the cache (key: SHA-256 of the bytes), and the abort when the content script goes away.

To test it without an AI key:

1. As above, choose OpenAI for tier 3 and turn on precise translation; leave "Image translation" at "Ask under each image".
2. Open a message with remote images of at least 200 × 200 pixels (a newsletter), and click "Show remote content" (or the setting for the sender) in the bar Thunderbird shows above it. Press Alt+A.
3. A "Translate image text" button appears under each remote image that passes the filters, and a notice above the message counts the remote images that wait for the access. Click a button: the popup of the message header button opens with "Allow reading remote images". Click it: Thunderbird asks for access to the data of all websites.
4. After "Allow" the image is read again, and the consent panel under the image asks before it goes to OpenAI; "Allow and translate image" ends with "OpenAI: API key is required" without a key.
5. Open a message whose remote content Thunderbird blocks and press Alt+A: no request is made for its images, and the notice above the message says how many remote images are not loaded.

### Since 3.0.0: connection check of the free routes

The free routes of Google Translate and Microsoft Translator are blocked on some networks (Google Translate in mainland China). When the settings page shows one of them as an added service, or the setup guide shows it at its machine translation step, the page sends the fixed sentence of "Test connection" to it once (the `testProvider` request of the background script, 0.6 s after the service was shown, nothing while `navigator.onLine` is false) and shows whether it answered. The request carries no message text and needs no consent; both hosts are in the manifest (`src/options/provider-panel.ts`, `reachLine()`).

### Source code and build

The xpi contains bundles made with esbuild (minified), so the source code archive is attached. `SOURCE-BUILD.md` in the archive gives the steps: Node.js 24.21.0 and npm 11.19.0 (Ubuntu 24.04 or Windows), `npm ci`, `npm run build`. The result is `web-ext-artifacts/thunderbird-translate-<version>.xpi`; it is identical byte for byte to the submitted xpi, which `sha256sum` confirms. After `npm ci` the build needs no network: the Bergamot engine is part of the archive and is checked against pinned sha256 hashes. The archive leaves out the tests, the documentation, and the code of the end-to-end test build (`src/e2e/`), none of which the regular build reads; the build stops if a file of `src/e2e/` or an `experiment_apis` entry gets into it.

### Permissions

| Permission | Why |
| --- | --- |
| `messagesRead` | the header of the displayed message: `messageDisplay.getDisplayedMessage()` (`src/background/displayed.ts`) reads its sender, date and subject for the summary, since the content script runs inside the body and cannot see the header; nothing is stored. Since 3.0.0, image translation reads the id of the displayed message the same way and its image parts with `messages.getAttachmentFile()` (`displayed.ts`, `messagePart()`), see above: images of the body and image attachments only, never another attachment. Since 3.1.0, for a remote image, `messages.getFull()` (`displayed.ts`, `messageImageAddresses()`) reads the HTML parts of the displayed message on the computer, only to check that the message names the address of the image; nothing of it is stored or sent. |
| `messagesModify` | `messageDisplayScripts.register()` (background, `src/background/content-scripts.ts`) shows the translations inside the displayed message, and `tabs.executeScript()`/`insertCSS()` add the same script to a message already open when the extension starts. Thunderbird allows both only with this permission (without it `messenger.messageDisplayScripts` is undefined; tested in Thunderbird 156). No stored message is changed. |
| `sensitiveDataUpload` | the text of the displayed message goes to the translation services the user chose, and, when the user asks for a summary or turned on the automatic summary, the whole message with its sender, date and subject goes to the AI service of the summary; before the first transfer to each online service the user confirms it in a panel above the message, recorded with the host of the service. Images of the message go to the vision service the user chose, after a consent of their own in a panel under the image |
| `storage` | settings, translation cache and the state of the setup guide in `storage.local` (through the wrapper in `src/shared/ext.ts`, which is why the linter does not see the calls) |
| `unlimitedStorage` | the offline dictionary packs (0.3 to 3.6 MB each) and Bergamot models (13 to 48 MB per direction) in IndexedDB, which must not be evicted |
| host permissions | only the addresses that work without an account: Google Translate, the free route of Microsoft Translator (`edge.microsoft.com`), Mozilla Remote Settings and its attachment CDN (Bergamot models), and GitHub with its release download host (dictionary packs). The list is `FIXED_HOSTS` in `src/shared/hosts.ts`; a unit test keeps it equal to the manifest. |
| optional, each by itself: the 24 default hosts of the services with a user key | Microsoft Translator with an Azure key, the two DeepL addresses, Baidu Translate, Youdao, Caiyun and the default endpoints of 18 AI presets (`KEYED_HOSTS` in `src/shared/hosts.ts`, kept equal to the manifest and the presets by a unit test). They were host permissions of the manifest up to 3.0.0. Such a service sends nothing before the user enters a key, so the host is asked for when the service is set up: "Allow access" under the service on the settings page and in the setup guide, "Test connection", or "Next" in the setup guide; a translation without it fails with "The extension may not connect to … yet. Open this service in the settings and click “Allow access”.". An update keeps a host permission that moved from `permissions` to `optional_permissions` granted (`ExtensionData.migratePermissions()` in Gecko, Firefox 75 and later, bug 1618500), so users of 3.0 keep their services. |
| optional `http://*/*`, `https://*/*` | an endpoint the user types (Ollama, LM Studio, DeepLX, Azure, a custom OpenAI-compatible service). The settings page asks for the single host with `permissions.request()` when the user clicks "Allow access" or "Test connection"; the background script refuses to send to a host without permission. Since 3.1.0 both patterns together, from a click on "Allow reading remote images" in the popup or on the settings page, to read again the remote images Thunderbird already shows (see above); never asked for without that click. |

Version 2.0 had removed `messagesRead` together with `tabs` and `<all_urls>`; 2.1 needed `messagesRead` again for the subjects, and `accountsRead` for the page of translated subjects. 3.0 removes subject translation and drops `accountsRead` again; `messagesRead` stays for the header of the summary and the images. `tabs` and `<all_urls>` stay removed.

### Third-party code

- npm packages bundled into the scripts: the Vercel AI SDK (`ai` and the `@ai-sdk/*` providers), `zod` and `fzstd`, with their dependencies. `THIRD-PARTY-NOTICES.txt` in the xpi lists every bundled package with version, license and copyright; the build makes that list from the files esbuild read and stops when a package is missing from it.
- `bergamot-translator.js` and `bergamot-translator.wasm.zst`: Mozilla's Bergamot translation engine, the files Firefox and Thunderbird ship, unmodified (MPL-2.0). `VENDOR.md` in the source archive declares both:

| File | Source | sha256 |
| --- | --- | --- |
| `bergamot-translator.js` | https://raw.githubusercontent.com/mozilla-firefox/firefox/48d55cf7ec80093903e2ef7f58b61a84a22ef716/toolkit/components/translations/bergamot-translator/bergamot-translator.js | `faff1ef6285b0d26f01787776fd49299dfb756ecb9688aa990c250e66797b47d` |
| `bergamot-translator.wasm.zst` | https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-wasm-v2/a76f9efe-b185-4a7f-9c3b-5f5d216d12e6.zst (Remote Settings collection `main/translations-wasm-v2`, `bergamot-translator` 4.0, release v0.6.0, built from mozilla/translations at revision `1de4a085d3a7afb625c51a60aabb5ad298e4059f`) | `327fcfc7b7e9d95f6fa0844ebf899cfc05469872ef02d3aef5783182839a6255`; decompressed `f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926` |

The content security policy adds `'wasm-unsafe-eval'` only to compile this bundled engine in its worker. No script of the extension calls `eval` or the `Function` constructor. The bundled zod library (in `chunks/llm-*.js`, loaded with the AI SDK) contains code that builds functions with the `Function` constructor: a feature probe, an optional compiler for object schemas, and `z.compile()`, which nothing calls. The extension sets `z.config({ jitless: true })` before any schema is created (`src/background/translators/zod-config.ts`), so none of it runs; the content security policy, which has no `'unsafe-eval'`, would block it as well.

Since 2.2.0 the Markdown of AI translations is shown formatted. `src/shared/markdown.ts` builds it with `createElement`, `createTextNode` and `setAttribute` and never assigns a translation to `innerHTML`; the elements are `strong`, `em`, `code`, `del`, `a`, `ul`, `ol`, `li` and `br`, and a link gets an address only when it starts with `http:`, `https:` or `mailto:`. Since 3.0.0 the answers about images add `p`, `table`, `thead`, `tbody`, `tr`, `th` and `td`, built the same way; a cell gets at most the class `tt-align-center` or `tt-align-right`.

### Downloads at run time are data

The extension downloads no code. On request of the user it downloads:

- dictionary packs: gzip-compressed tab-separated word lists from the GitHub releases of this project, checked against the sha256 in the release index before they are stored;
- Bergamot models: Marian model, vocabulary and shortlist files from Mozilla Remote Settings, the files Firefox Translations uses, checked against the sha256 of their Remote Settings records before they are stored.

Both are read as data by the dictionary lookup and by the bundled engine.

### The http://localhost presets

Ollama and LM Studio are AI servers that run on the user's own computer. Their presets point to `http://localhost:11434/v1` and `http://localhost:1234/v1`, the loopback address: these requests do not leave the computer, and the endpoint field says so. They still need the optional host permission, granted by the user. Every other `http://` address is one the user typed.

### webext-linter

Run of thunderbird/webext-linter 2.3.2 on the xpi of 3.1.1 with `--sca-root` on the unpacked source archive (review schemas release-mv2 of Thunderbird 158.0.2). The unsafe-html check reports nothing. It traces `messagesRead` to its four calls (`messageDisplay.getDisplayedMessage` twice, `messages.getAttachmentFile` and, new in 3.1.0, `messages.getFull`, all in `src/background/displayed.ts`) and passes it. Every API permission, the six host permissions and the optional ones (the 24 hosts of the key services and `http://*/*`, `https://*/*`) are known to the schema, and the six host permissions pass the check for broad hosts. The `fetch()` of the remote images (`src/background/remote-images.ts`) takes the fetch function as a parameter, so the user-data sweep does not list it: it sends a GET without cookies, referrer or body, only to an address the HTML of the displayed message names, on a public host, after the user allowed reading remote images. The other calls new since 2.2.0 need no permission of the schema: `messageDisplayAction.openPopup()` (the popup with "Allow reading remote images"), `permissions.request()` and `permissions.remove()` for the optional hosts, `navigator.clipboard.writeText()` for "Copy as Markdown". The remaining items are those of 2.0.0:

- sync-xhr (`bergamot-translator.js` lines 63 and 70): two synchronous `XMLHttpRequest`s in Emscripten's file loader of the unmodified Mozilla glue. The add-on never reaches them: the worker reads the wasm itself and hands it to `loadBergamot()` as `wasmBinary` (`src/offline/bergamot/worker.ts`, `worker-core.ts`), and the glue then skips its loader. The file is declared in `VENDOR.md`; in a source code review the linter reads vendoring from the archive only, so it scans the shipped copy as if it were authored.
- vendor source not auditable (info): the glue is not published on npm; its source is the Firefox repository at a fixed commit, and the sha256 matches.
- localized names (de, es, fr, pt_BR, ru, vi): "für", "para", "pour", "para", "для" and "cho" mean "for"; every name has the form "<name> for Thunderbird".
- possibly unused permissions `sensitiveDataUpload`, `storage`, `unlimitedStorage`: see Permissions above.
- possibly unused files: `bergamot-translator.js` is loaded with `importScripts()` and `bergamot-translator.wasm.zst` with `fetch()` in `bergamot-worker.js`; `welcome.html` (with `welcome.css`) is the setup guide, opened with `tabs.create()` after installation and from the popup and the settings page.
- user-data exfiltration sweeps on `fetch()` calls: `src/offline/bergamot/manager.ts` (model list and model files from Mozilla, two calls) and `src/offline/bergamot/index.ts` (the fetch it uses) send no user data; `src/offline/bergamot/worker.ts` and `src/shared/i18n-ext.ts` read files of the extension; `scripts/fetch-bergamot.mjs` is part of the build and downloads the engine only when the vendored copy is missing. Message text goes only to the translation services, after the consent panel.
- build process review and the build configuration of `package.json` (undeclared build source, unsure): `npm ci` and `npm run build`, nothing else; `package.json` has no lifecycle scripts.
