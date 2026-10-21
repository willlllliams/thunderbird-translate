# Changelog

All notable changes to this project are documented in this file, with the date of each version. It lists what users of the extension notice. The record up to 1.12.0 with the internal changes is kept in [docs/archive/CHANGELOG-full.md](docs/archive/CHANGELOG-full.md). Versions follow [Semantic Versioning](https://semver.org/).

## 2.4.0 - 2026-10-21

Version 2.4 translates the text in the images of a message. With precise translation on, an AI service reads an image and the text appears under it: the original and its translation side by side. The extension draws nothing on an image and generates no image.

### Text in images

- "Image translation" has three modes: Off, Ask under each image (the default) and On. They apply while precise translation is on and the vision model reads images.
- Ask under each image: a "Translate image text" button appears under every image that passes the filters; a click sends that image only.
- On: when you translate a message, its first images go to the service by themselves, five per message by default, in the order of the message; the images after them get the button. The limit counts for the message on screen, also when a setting changes or the translation is turned off and on; Alt+R counts anew. Copies of one image count once.
- A result already in the cache appears at once, without a button.
- The popup switches the mode while precise translation is on. The message on screen follows at once, without loading it again and without translating the paragraphs again.
- Alt+R also forgets the image results of the message: "Ask" shows the buttons again, "On" sends the images again.
- Only the images of the body and the image attachments Thunderbird shows under it. Remote images are never translated. Tracking pixels, icons and small logos, divider lines, logos in the signature, files under 4 KB and animated images are left out; the size limits can be changed.
- The result is a collapsible block under the image with a table of the original and its translation; its title names the service and the tokens of the request. Of a chart only the labels are translated, without describing its trends. Text the model cannot read is marked [?]. An image without text shows nothing.
- The answer can also be a short summary of the image, or both; an image without text can get one sentence instead of nothing.
- Each image goes in a request of its own, scaled to at most 1568 pixels on its longer side and encoded again as JPEG, without its file name and metadata.

### Consent for images

- Before the first image goes to a service, a panel under the image asks, apart from the consent for text. It says what is sent and where to, how many images "On" sends, whether the glossary of the message goes along, and for Anthropic, Google Gemini and OpenAI what the service states about the data.
- The glossary of precise translation goes with an image only to the service of tier 3 or to a service also allowed to receive the text of messages.
- "Ask again for every message" asks for every message instead of once per service.
- The settings page lists the services allowed to receive text and those allowed to receive images in two columns, each with "Revoke".

### Settings

- The settings page has the image settings under precise translation: the mode, the vision service and model, a line that names a model that does not accept images together with one that does, an estimate of the tokens of one image, and "Test image", which sends a built-in test image.
- "Advanced image settings" holds the sources, the size and file limits, animated images, the upload size, format and quality, the limits per image and per message, the image detail, the answer, the length limit, the timeout, the concurrent requests, and how the result opens.
- The image prompt can be edited and restored in the Prompts section.
- The AI step of the setup guide offers the three modes under precise translation, and names a model of the AI service that reads no images.

### Connection check of the free routes

- The settings page and the setup guide check whether Google Translate (free) and Microsoft Translator (free) can be reached from your network when they show one of them as added: once per page, with the test sentence of "Test connection", never with message text. A line says "Reachable" with the time of the answer, or "Not reachable" with the reason.
- When the route reaches no server, the reason names the services that work without it: the other free route, the offline models and the dictionary, and with your own key DeepL, Baidu, Youdao and Caiyun. For Google it adds that the service is not available in mainland China. A failed translation of a message on one of these routes says the same.

### Changed

- Translation-only display keeps the images of a paragraph: copies of them follow its translation. Before, an image inside a translated paragraph disappeared until the original was shown again. Remote images are not copied.

### Permissions

- No new permission and no new address. The extension reads the image parts of the displayed message with the permission "Read your email messages" it already has.

### Fixed

- When the consent panel of the translation was open and you asked for the summary, or the other way round, allowing recorded a service the panel had not named. The panel now lists the services of both questions and says when the whole message goes to the summary.
- A consent is now recorded with the address of the service; changing the address of an allowed service asks again. Consents of earlier versions apply to the address the service has after the update.
- Revoking the consent of a service, turning image translation off or leaving a message no longer lets what already waits in a queue go to the service; a request still on its way for images is aborted.
- With the source language "Automatic", Baidu translated the paragraphs of a mixed-language message, such as a Japanese message with an English signature, as if all were in one language. Each detected language now goes in a request of its own.
- Paragraphs of a message you have already left are no longer translated, at your cost, before those of the message on screen.
- A server that asks to wait more than 30 seconds (a spent daily quota) now makes the request fail at once with its message, instead of each attempt waiting 30 seconds.
- An endpoint without `https://`, such as `localhost:1188/translate`, now says that it is not a valid address, instead of being retried as a network failure.
- An error answer whose body stalled could hold a request slot of a service until Thunderbird was restarted; the timeout now covers it.
- A summary with a model that reasons first, such as gpt-5-mini, often came back empty or cut off: the reasoning counted within the length limit. Such models now get room for it, and an answer cut at the limit says so.
- The summary resolved "tomorrow" against the date of the message in UTC, a day off for readers far from it; it now uses your time zone.
- Instructions hidden in a message could make the summary list invented to-dos. The model is now told to ignore them, and a to-do whose quote is not in the message is marked "not found in the message".
- "Copy as Markdown" said "Copied" also when the copy failed; it now says "Copying failed" and keeps the focus.
- After you corrected a key or an app ID, the failed paragraphs of the message on screen stayed failed; they are now asked again, without asking the tiers that succeeded.
- A paragraph that no tier answered kept its spinner for good; it now fails with a retry marker.
- A number with a fraction in the settings, such as 850.5 tokens, made every summary or image request fail; counts and sizes are now whole numbers.
- While a download ran, the offline lists took the keyboard focus away four times a second; the focus now stays on its control.
- The services of the settings page can now be selected with the keyboard, and the retry marker of a failed paragraph can be pressed with Enter or Space.
- After an update of the extension, a message that was translated on screen showed every translation twice, or in translation-only display could not show its original again. The new version now restores such a message first.
- Translations into Arabic and other right-to-left languages have their line and spacing on the side where the text starts.
- German, French, Spanish and Portuguese interfaces write megabytes with their own decimal mark, lists of languages are joined as the interface language joins them, and counts no longer read "1 items".
- Experimental build: a change of the settings while the folder list was read could leave subjects untranslated in the column until the next change.
- The result of an image no longer breaks a table or a list of the message: in a table cell or a list item it goes inside it.
- An image with more than 40 megapixels is no longer decoded: its size is read from its file first, and the images of a message are decoded one at a time.
- An image request of a message you were leaving could read the image parts of the next message. A content script now reads only from the message it was started for.
- A change of how the image results show (collapsed, tokens) no longer starts the images over; an image on its way is sent once.
- Revoking the image consent, or turning on "Ask again for every message", now makes the panel ask again in the message on screen.
- When a translation starts, only the first images, twice the limit per message, are read to look up cached results; the others are read when you click their button.

## 2.3.0 - 2026-10-21

Version 2.3 adds four machine translators that work with an account of your own, and a summary of the message with its to-dos written by an AI service.

### Machine translators with your own key

- DeepL API, 百度翻译 (Baidu Translate), 有道智云 (Youdao) and 彩云小译 (Caiyun) are new services of tier 2. Each counts as added once its key is filled in, and each asks once before the text of a message first goes to it.
- DeepL: a key of the free plan (ending in ":fx") goes to api-free.deepl.com, any other key to api.deepl.com. The panel sets the formality and whether English is written American or British and Portuguese Brazilian or European. "Test connection" shows the characters used in the billing period and costs nothing.
- Baidu: app ID, secret key and the edition of the account. The standard edition sends at most one request per second with 1000 characters; Ukrainian, Turkish, Indonesian and Hindi need the premium edition, and the panel says so.
- Youdao: app ID and app secret. A paragraph that Youdao cannot translate fails alone; the other paragraphs of the request keep their translations.
- Caiyun: a token. It translates between Chinese and English, Japanese and Korean both ways, and eight more languages into Chinese; for any other pair it sends nothing and says so.
- A refused key, a used-up quota, a refused time stamp and a blocked IP address are named as such, in the interface language.

### Summary and to-dos

- "Summary and to-dos" in the popup shows, above the message, a summary in one to three sentences, who has to do what by when, the questions you are asked and the dates and meetings. Hovering over a to-do shows the words of the message it rests on.
- The panel has "Copy as Markdown", "Regenerate" and "Close". Turning the translation off leaves it on screen.
- The summary is written by the AI service of tier 3 or by another AI service chosen for it on the settings page, in the target language. The service receives the whole message with its sender, date and subject; before it first receives a message, the consent panel asks.
- The section "Summary and to-dos" of the settings page chooses the service and model, the parts to include, the length limit and whether the panel opens collapsed. "Show a “Summary” button above a translated message" adds a button to every translated message; it is off by default.
- The summary prompt can be edited in the Prompts section and restored there.
- The command "Summary and to-dos of the message" has no default key; set one under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager.

### Permissions

- Thunderbird asks to access five more addresses: api.deepl.com, api-free.deepl.com, fanyi-api.baidu.com, openapi.youdao.com and api.interpreter.caiyunai.com. They are used only by the services of the same name, once you add one.

## 2.2.1 - 2026-10-21

### Fixed

- A translation with many unclosed `[](` took time that grew with the square of its length to format: about 1.5 seconds for 80 KB, during which the message pane did not respond. Formatting now takes time proportional to the length. As a consequence, a Markdown link stays text when its address is longer than 2048 characters or nests parentheses deeper than 32 levels.
- A Markdown link whose address names a user name or password before the host, such as `https://bank.example@evil.example/`, stays text. Such addresses show one host in the text and lead to another.
- After the extension was updated or reloaded, translating in a message pane that was already open stayed in progress for good. Each paragraph now shows the error at once; opening the message again translates it.
- The first AI translation no longer logs a blocked use of the `Function` constructor in the console of the background page. The AI SDK checks its data with the zod library, which now runs without generating code.
- On the page of translated subjects in a window 800 pixels wide, an English date with time such as "10/12/26, 11:40 AM" was cut off. The date column is now as wide as such a date.
- Experimental build: the column "Translated subject" keeps the translations of the 2000 subjects listed last, in the background page and in Thunderbird. Before, both kept every subject ever listed until Thunderbird was closed. A subject that appears again is filled from the cache.
- Experimental build: when reading the message list failed, Thunderbird kept the list open; it is now closed in that case too.

## 2.2.0 - 2026-10-21

Version 2.2 shows the Markdown of AI translations formatted. AI services often answer with `**bold**`, `- ` in front of list items and links in Markdown; these now appear as bold text, lists and links instead of their characters.

### Markdown in AI translations

- The final translation of the AI tier shows bold, italics, code, strikethrough, links, bulleted and numbered lists and line breaks formatted, in both display modes and with precise translation. The text color, opacity and font size of the translation style apply to them.
- Dictionary and machine translations, and the provisional results of the lower tiers, stay as they are: an asterisk that Google Translate keeps from the original stays an asterisk.
- Only addresses that start with `http:`, `https:` or `mailto:` become links, and Thunderbird opens them like any other link in a message: web addresses in the browser, after its check of link texts that name another host, and `mailto:` in a new message. A link to any other address stays as text, and so do headings, tables, images and HTML. The extension builds the formatting element by element and never reads a translation as HTML.
- Asterisks and underscores follow the rules of CommonMark, so `snake_case`, `file_name.txt` and `2*3*4` stay as they are, and bold text between Chinese, Japanese or Korean characters needs no spaces.
- The subject line above the body, the page of translated subjects and the column of the experimental build show the AI translation of a subject as plain text without the marks.
- "Render Markdown in AI translations" under the translation style on the settings page turns this off. It is on by default; switching it redraws the message on screen without asking the service again, since the cache keeps the translations as the service returned them.

## 2.1.0 - 2026-10-14

Version 2.1 translates subjects: of the message you read, and of a whole folder on a page of its own. An experimental build, published on GitHub only, also shows them in a column of the message list.

### Subjects

- The subject of a message is translated with its body and shown in a line above the body: the subject with its translation under it in bilingual display, the translation alone in translation-only display. It goes through the same tiers as a paragraph, with a provisional result first.
- Reply and forward prefixes such as "Re:" and "Fwd:" stay as they are, and a subject already in the target language is left alone.
- "Translate the subject as well" on the settings page and in the last step of the setup guide turns this off. It is on by default.

### Page of translated subjects

- The "Translated subjects" button in the main toolbar lists the messages of the folder shown in the mail tab: sender, date, subject and the translated subject, the first 100 messages and 100 more with "Show more".
- A click on a row shows that message in the mail tab. The page follows the mail tab to another folder and reads the list again when messages arrive, are deleted or are moved.
- "Open in a window" keeps the list open beside the main window.
- The subjects are batched into few requests and taken from the cache when they were translated before. With only the dictionary and Bergamot, nothing leaves the computer; before subjects first go to an online service, the page asks with the same consent panel as a message.

### Experimental build

- `multi-translate-experimental-2.1.0.xpi`, attached to the release on GitHub, adds a column "Translated subject" to the message list, filled for the first 100 messages of the folder on screen. It needs the table view of the message list.
- The column uses an internal interface of Thunderbird through a WebExtension Experiment and may stop working with a later Thunderbird version. The build has its own add-on id and is not on addons.thunderbird.net; install either it or the regular build, not both. [docs/experimental.md](docs/experimental.md) describes installation, differences and risks.

### Permissions

- "Read your email messages" (`messagesRead`) is back: the extension reads the subject of the message on screen, and the sender, date and subject of the messages listed in a folder for the page of translated subjects. It reads no message body this way and stores none of it.
- "See your mail accounts and their folders" (`accountsRead`) is new: Thunderbird requires it to select a message from the page and to tell the page that the mail tab shows another folder. The extension reads no account settings.

## 2.0.0 - 2026-10-13

Version 2.0 brings together everything the extension has gained since 1.0 and renames it to Multi Translate for Thunderbird, the name it has on addons.thunderbird.net. Updating from 1.x keeps your settings, the downloaded dictionary packs and offline models, and the translation cache. It requires Thunderbird 128 or later. The first translation through an online service asks once for your consent, and an endpoint you typed yourself needs your permission once.

### Translating a message

- Translates the message you are reading in place: paragraphs, list items, table cells, headings and quotes of HTML mail, and the paragraphs of plain-text mail.
- Shows the translation under each paragraph (bilingual) or instead of it (translation only); turning translation off restores the original message.
- Optional automatic translation of every message that is not in the target language.
- Three tiers, dictionary, machine translation and AI, are asked at the same time. The fastest result appears first as a provisional translation, the highest tier replaces it, and a tier that failed can be retried with a click on its mark.
- The source language is detected per paragraph or fixed in the settings; Simplified and Traditional Chinese are told apart.
- Alt+A translates or restores the message, Alt+S switches the display, Alt+R and "Retranslate" in the popup translate again past the cache.

### Translation services

- Google Translate and Microsoft Translator without an account; Microsoft Translator also with your own Azure Translator key; your DeepLX server.
- 22 AI presets, among them OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, local Ollama and LM Studio, and any OpenAI-compatible endpoint.
- Thinking mode and temperature for each AI service, and "Test connection" with the values on screen.

### Offline translation

- Dictionary packs adapted from Wiktionary and ECDICT, and Mozilla's Bergamot models, the engine of Firefox Translations.
- Downloads run in the background and go on when the settings page or the setup guide is closed, two at a time per service. Every open page shows the same progress, any of them can cancel a download, and a pack or model is used as soon as it is stored.
- "Download common languages" fetches the directions between English and eight widely used languages.
- A notice above a message names the packs or models a translation lacked, with a link to the downloads and a switch that mutes it for those languages; the tier selectors mark an offline service whose data is missing.

### AI translation quality

- Three prompts, for bilingual display, translation only and precise translation, with presets for regional varieties, the original after difficult words, explanations of difficult words, writing styles, and a plain preset that removes them.
- Precise translation gives the AI service the whole message as context, so names and terms stay consistent.
- Long paragraphs are split at line breaks or between sentences, paragraphs are batched into few requests, and translations are cached.

### Reliability

- Requests time out after 60 seconds by default, adjustable from 5 to 600 seconds, longer for local models and thinking mode.
- Failed requests are retried automatically; an AI request that timed out is not, since every attempt is charged.
- Error messages are in the interface language and suggest what to change.

### Interface

- 12 interface languages: English, Simplified and Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese (Brazil), Russian, Turkish and Vietnamese.
- An eight-step setup guide with a demo and a tour of the tiers and a trial translation of a sample message.
- Translation style: border, dashed border, highlight or plain, accent color, text color, opacity and font size.
- A short description appears when the mouse rests on any control.

### Privacy

- API keys stay in your Thunderbird profile and go only to their own service. The extension collects no statistics.
- Message text goes only to the services you chose. Before it first goes to an online service, a panel above the message names the service and its address and asks; the settings page lists the allowed services and takes them back.
- The extension connects only to the addresses of its services and of the offline downloads. An endpoint you typed, such as a local Ollama server, needs your permission once ("Allow access" or "Test connection").
- With only the dictionary and Bergamot in use, no message text leaves your computer.
- The licenses of all bundled third-party code are listed in THIRD-PARTY-NOTICES.txt inside the extension.

## 1.13.0 - 2026-10-12

### Fixed

- A dictionary pack downloaded on the settings page or in the setup guide stayed unused when the page was closed before all of its downloads had ended and a translation had already found the pack missing: the background script heard of new packs only at the end of the downloads, and the translation kept its answer. The background script now downloads and stores the packs itself, and translations use a pack as soon as it is stored.
- A failure of the dictionary storage reads "Could not save or read the dictionaries in the extension storage." in the interface language, like a failure of the offline model storage.

### Changed

- Closing the settings page or the setup guide no longer stops the downloads of dictionary packs and offline models, also those still waiting for their turn. The background script keeps them in its queue and downloads two directions of each service at a time.
- Every open page shows the same progress of every download, also of a download another page started. A page opened later shows the downloads still running or waiting, and any of these pages can cancel a download.
- The dictionary list comes from the background script, which keeps the index of each release tag for 6 hours, like the Bergamot list. "Reload list" in the Dictionaries section reads it again at once, and a release tag typed on the page is listed before it is saved.
- A displayed message forgets the results it keeps once a set of downloads has ended, instead of after every pack.

## 1.12.0 - 2026-10-12

### Added

- Hover texts. Every control of the popup, the settings page and the setup guide shows one short sentence about what it is or what it does when the mouse rests on it: buttons, lists, switches, sliders, color fields, input fields such as the API key, endpoint, model, temperature and timeout, the tier selectors, the service list, the rows and buttons of both offline lists, the prompt editor and its presets, the style controls, the demo and the tour of the tiers. The texts state the facts that matter, for example that a key stays in this profile and goes only to its service. They are written in all 12 interface languages and follow a change of the interface language at once.
- Inside a message, the buttons and the check box of the notice about missing offline data have hover texts, and the label of a lower translation kept after the highest tier failed adds to the reason that a click retries the failed tiers.
- A label passes its hover text to its control, which takes it as its accessible description; the filter fields and the release tag of the dictionary packs keep an accessible name of their own.

## 1.11.0 - 2026-10-12

### Fixed

- The background script read the index of the dictionary packs once per release and kept it for as long as Thunderbird ran. The popup, the tier selectors of the settings page and the notice about missing offline data name downloadable packs from this index, so packs published later were not offered until Thunderbird restarted. The index is now read again once it is 6 hours old, as the Bergamot model list already was. After a failed read it is asked for again 10 minutes later at the earliest, and the index read before keeps answering meanwhile.

## 1.10.0 - 2026-10-12

No user-visible changes.

## 1.9.1 - 2026-10-12

### Fixed

- Offline lists of the settings page and the setup guide: a dictionary pack or offline model waiting for its turn in a download of several still offered "Download". Clicking it downloaded the direction a second time, and the queue could not be cancelled. A queued direction now reads "Waiting…" with a "Cancel" that takes it off the queue. "Download common languages" and its confirmation leave out queued and running directions, and in the setup guide their check boxes are disabled. A direction taken off the queue or installed in the meantime is skipped when its turn comes.
- Retranslation: when a request for the same paragraph started before "Retranslate" answered after it, its older result replaced the new one in the cache, and the next display of the message showed the old translation. Only the request that started last for a paragraph now writes the cache, and the same holds for the analysis of precise translation. A request that starts during a retranslation shares its result instead of asking again.
- "Retranslate" removed a notice about missing offline data that was on screen, and the notice did not come back. A notice on screen now appears again once the new round has finished, if data is still missing; a closed notice stays away as before.
- Bergamot: after a failed read of Mozilla's model list, every settings change and every check of the popup or the settings page asked Mozilla again. A failed read is now repeated 10 minutes later at the earliest, as for the dictionary index; until then the copy saved by an earlier read answers, if there is one. "Reload list" still asks at once.

### Changed

- The tier demo in step 3 of the setup guide labels a provisional result with the name of its tier, such as "Machine translation", as a translated message does. The line under the paragraph still names the tier and the service.
- README, all 12 languages: "Don't remind me for these languages" in the notice about missing offline data is a check box, not a button. The Simplified Chinese and Korean READMEs quote the interface text of the locale files, "这些语言不再提醒我" and "이 언어들은 다시 알리지 않기".

## 1.9.0 - 2026-10-12

### Added

- Text color of the translations, in the Translation style section of the settings page. By default the translation keeps the color of the message text, and the field shows the color of the page text next to "Same as the message text"; "Restore default" returns to it. The accent color stays separate and still colors the border or the highlight. A provisional translation keeps its italics, fainter text and label in any text color. Settings saved by earlier versions have no text color and look as before.
- Step 2 of the setup guide has every control of the translation style: style, accent color, text color, text opacity and font size ratio. The settings page and the guide build them with the same function (`src/options/style-controls.ts`), and the sample message of the step shows each change at once.
- Step 3 of the setup guide plays a sample paragraph through the tiers in use with the content script's renderer: the dictionary's word-by-word result at once, machine translation after 0.3 s and the AI translation 1.5 s later. Lower results carry the provisional mark with the name of their service, such as "Bergamot (offline)", and a line under the paragraph names the tier and service shown. Every change of a tier selector and "Replay" play it again; tiers that are not used do not appear. The sentence and its three translations come from the interface language, and nothing is requested. With `prefers-reduced-motion: reduce` the final result appears at once.
- The first visit of step 3 starts a tour of the three tier selectors: a ring and a shade mark one selector, and a tip explains its tier, with "Next" and "Skip". Choosing a service in the marked selector also moves on; Enter moves on and Esc skips. The tour opens by itself once; the guide stores that it was closed together with its progress, and "Show the tour of the tiers again" under the demo starts it again.

### Fixed

- Simplified Chinese and Korean: the button of the notice about missing offline data spoke of one language ("这个语言" / "이 언어"), while the notice is about a language pair and the other languages say "these languages". Both now use the plural.

## 1.8.2 - 2026-10-12

### Changed

- Documentation only; the extension behaves as in 1.8.1.
- README, all 12 languages: rewritten for users and cut from about 600 lines to 143. Every README opens with a contents list that links to its sections, and all 12 have the same sections in the same order: features, install, quick start, usage with the shortcut table, the three translation tiers, translation services with the links to get an API key, prompts, privacy, known limitations, documentation, acknowledgements and license. Quoted interface text matches `locales/<language>.json`. The privacy section states when the dictionary index and the Bergamot model records are read.
- The reference and developer material of the old README moved to English documents in `docs/`:
  - `docs/settings.md`: every setting, the setup guide, the popup, tiers, source and interface language, the three prompts and the presets, precise translation, batching settings and timeouts, offline services and lists, "Download common languages", missing offline data and muting, retranslation and the cache, translation style, settings from older versions, privacy details and the complete list of known limitations.
  - `docs/providers.md`: endpoints, SDK packages, default models and key links of every service, provider notes, the thinking parameters and how each service receives the source language.
  - `docs/batching.md`: the batch flow, long paragraphs, request queues, retries and timeouts, how each service merges paragraphs, and the cost estimate.
  - `docs/development.md`: building from source, npm scripts, unit tests and coverage thresholds, the end-to-end runs locally and in CI, project structure, translating the interface, and the release process (CI, nightly, versions).

## 1.8.1 - 2026-10-12

### Fixed

- A paragraph whose dictionary pack or Bergamot model was missing waited for the network. Before naming what to download, the translation read the index of the dictionary release from GitHub, or Mozilla's model list once the copy in memory was older than 6 hours. A list that did not answer held back the whole batch, including the paragraphs whose packs or models were installed, and a failed read of the dictionary index was repeated for every following batch. Translations now decide what is missing from the lists already read and never wait for the network. The background script reads the list of each offline service in use when it starts and when the settings change; a dictionary index that could not be read is asked for again after 10 minutes at the earliest.
- Without the list of a service, for example with no network since Thunderbird started, every direction counted as downloadable: the notice above the message, the red marks and the "Download" link named directions that the service might not offer. Until the list has been read, nothing counts as missing.
- "Download common languages" and "Download selected" in the setup guide started every download at once and read the list again after each one. They now download two directions at a time and read the list once at the end; the dictionary list tells the background script once.
- The line under the tier selectors turned red as a whole when one service lacked data, including the statement that another service does not support the languages. Each statement is now an element of its own, and only the statements about missing data are red.
- With automatic detection, the offline lists labelled and the setup guide ticked a direct dictionary pack between two recommended languages even when neither of them was the target language, which contradicted the rule in the README. A direct pack between two languages other than English is now recommended only when one of them is the target language.
- When `i18n.getPreferredSystemLanguages()` failed or answered nothing, the offline lists had no system language. The locale of the `Intl` formats now stands in, as in Thunderbird versions without the function. A POSIX locale such as `en-US-posix` counts as English.

### Changed

- README, all 12 languages: the privacy section names when the background script reads the dictionary index and the Bergamot model list (never while translating a message), the section on missing offline data says that nothing counts as missing before the list of the service has been read, and the project structure no longer mentions the demo GIF removed in 1.7.0.

## 1.8.0 - 2026-10-12

### Added

- Retranslate. While a message is translated, the popup shows "Retranslate" next to "Show original", and the new shortcut Alt+R does the same (the command `retranslate`; it does nothing while the message is not translated). The message is translated again in the current display mode, and every tier is asked anew: the page forgets the results it kept for the message, the background script reads no cache entry and joins no request still running for the same paragraph, and the new results replace the cached ones. In precise translation the message is analysed again and the new analysis replaces the cached one. Lower tiers show provisional translations as usual, failures are handled as before, the notice about missing offline data keeps its once-per-message rule, and the cached translations of other messages are untouched. The command description and the button are translated into all 12 interface languages, and the shortcut hint of the popup names Alt+R.

## 1.7.0 - 2026-10-11

### Added

- Notice about missing offline data. When the dictionary tier or Bergamot in the machine tier cannot translate paragraphs of a message because a pack or model for the detected language pair is not installed, a notice appears above the message after the first translation round, once per message. It lists one line per service and language pair with the directions to download (for example "Dictionary: Japanese → Simplified Chinese, missing Japanese → English and English → Simplified Chinese"), opens the settings page with both offline lists filtered to these directions, and offers "Don't remind me for these languages", stored per service and language pair (`offlineMutedPairs`). The settings page lists the muted entries under the tiers and brings them back with "Remind me again". Only the offline tiers in use count, only missing packs or models count (network errors, pairs without anything to download and paragraphs whose language was guessed do not), and the paragraphs still get the translations of the other tiers.
- The tier selectors of the popup and the settings page mark a selected dictionary or Bergamot service that lacks what the current languages need: the entry reads "Dictionary (local model not downloaded)" or "Bergamot (local model not downloaded)" in red, and a line under the selectors names the missing directions with a "Download" link to the filtered lists. With automatic detection the direction from English into the target language counts; into English, at least one direction into English. A pair the service does not offer is named as unsupported, without red. The marks follow installations and deletions made on other pages.
- Both offline lists, on the settings page and in the setup guide, show every direction of the catalog. The directions of the recommended languages come first, labelled with their source: target language, fixed source language, add-on interface language, Thunderbird language, system language (`i18n.getPreferredSystemLanguages()`, or the locale of the `Intl` formats in Thunderbird versions without it); a direction into the target language is labelled "Direct", one into English "Via English". A filter takes language names or directions such as `ja>en`, several separated by commas.
- "Download common languages" in both lists downloads the directions to and from English of eight fixed languages (Simplified Chinese, Spanish, French, German, Japanese, Portuguese, Russian, Korean) as far as the catalog has them. It first lists what it would download with the total size; installed directions are left out, and when all are installed the button is disabled and says so.
- Prompt presets: "Plain (no added rules)" is the first entry of the preset list. Applied to a prompt it removes every rule block that a preset added and keeps the text the user wrote; a prompt that is then the built-in one is stored as empty again.
- The tier selectors of the popup and the settings page end with "+ Add translation service…". It opens the service list of the settings page filtered to the services of that tier and leaves the selector at its value. The service list has a filter by tier.

### Fixed

- Setup guide, offline step, with automatic detection of the source language: the step only looked for English → target. With English as target language, the default for a Thunderbird in English, both lists were empty ("No dictionary pack covers these languages"), and languages changed in the popup while the step was open were not taken over. "Download selected" then had nothing ticked, returned at once and showed nothing. The step now lists every direction, ticks those of the recommended languages (with a fixed source language, those the pair needs), explains the route through English, follows language changes made elsewhere, keeps "Download selected" disabled with "Tick the items to download first." while nothing is ticked, and reports "Downloading N items…", then success or the number of failed downloads.

### Changed

- The "+ Add translation service" link of the popup is replaced by the last entry of each tier selector.

### Removed

- The demo animation `docs/demo.gif` (5.2 MB) and the image line that showed it at the top of README.md and of the 11 translated READMEs.

## 1.6.2 - 2026-10-11

### Changed

- Internal simplification: dictionary packs and offline models share one download routine with the idle timeout, the source language of a paragraph is named by one function, and the tests share their stand-ins. Behavior is unchanged.

## 1.6.1 - 2026-10-11

### Fixed

- A slow local model or a model in thinking mode failed in the default configuration and was asked four times, each attempt charged: AI requests that timed out were retried like network errors, up to about 4 minutes in total. AI requests, including the analysis of precise translation and "Test connection", are no longer retried after a timeout, and Ollama, LM Studio and models with thinking mode on get three times the request timeout (180 seconds by default). Google, Microsoft and DeepLX retry a timed-out request once. The error names the time actually waited, for example "no answer within 120 s" after two attempts of 60 seconds.
- A timeout while the body of an answer was still arriving surfaced as an untranslated `TimeoutError` of the browser. It is now reported like any other timeout, in the interface language, and follows the same retry rule.
- A paragraph longer than one request with several lines, such as a quoted reply of 60 lines and 3,900 characters, was sent one line per piece. A piece now takes whole lines, line breaks included, as long as they fit, and ends at its last line break; only a single line longer than a request is cut between sentences. The quoted reply goes out as two pieces.
- A long paragraph that started with a line break sent an empty first piece for translation. The whitespace at the start is now kept aside and put back in front of the translation.
- The dictionary and Bergamot "translated" between Simplified and Traditional Chinese through English, word by word: 我们明天开会 became 我們明天持有一個會議. Both now refuse this pair with "This service does not translate between Simplified and Traditional Chinese."; the paragraph shows no provisional translation from them and is translated by the machine and AI tiers. The setup guide recommends no dictionary packs for this pair.
- After a failed save, the settings page and the setup guide no longer counted the change as unsaved, so a later flush wrote nothing; leaving or finishing the setup guide closed the tab even when its settings could not be saved. A failed save now keeps the changes pending for the next save, and the setup guide stays open with the error.
- A failed analysis request of precise translation was remembered as "no analysis" until the background script restarted. A failed request (network error, timeout, HTTP error) is now forgotten, so the next translation of the message asks again; an answer that cannot be used is still kept.
- Downloads of dictionary packs and offline models, and the lists of both, had no timeout and could hang for good. The lists fail after 30 seconds without an answer; a download that receives no data for 30 seconds stops with an error, while a slow download that keeps receiving data has no time limit. Dictionary downloads on the settings page and in the setup guide can be cancelled.
- A change made in another page while a field had the focus was never drawn into that field. The field now shows it once it loses the focus. An edit made while a save was running that restored the stored value (a switch turned on and off again) was overwritten by the save; such edits now survive and are saved.
- The analysis of precise translation was shared between configurations: changing the endpoint, the thinking switch, the temperature or the source language reused the old analysis. Its cache key now contains the same configuration hash as the translations. The cache key of Bergamot translations now contains the installed model versions, and the content script forgets the results it keeps for the displayed message when dictionary packs or offline models are installed or removed.
- The dictionary named the source language of a paragraph with other thresholds than Bergamot (any reliable answer of the browser's detector, also for very short text). Both now use the same rule: the detector from 12 letters on and an answer covering at least 60 % of the text.
- When the messages of an interface language could not be read once, content scripts received English for that language until the background script restarted. English in place of another language is no longer kept.
- A Bergamot worker that did not answer made every following offline request wait its own 2 minutes, and loading a large model had the same timeout as a translation. Loading a model now has 5 minutes; after two timeouts in a row, offline translations fail at once for one minute with a message saying so.
- Copies of a built-in prompt in stored settings were cleared when the settings were read but written back only with the next change. The background script now writes migrated settings back at once.

## 1.6.0 - 2026-10-11

### Added

- Request timeout, 60 seconds by default, under "Request batching" on the settings page (5 to 600 seconds). Online services and AI requests that do not answer in time are cancelled, retried like network errors and then reported as "no answer within N s" with a hint to raise the timeout. A Bergamot worker that does not answer within 2 minutes is terminated and replaced with the next request.
- A paragraph longer than the character limit of one request is split at sentence boundaries (`Intl.Segmenter`, a cut by length for a single overlong sentence, always at a line break), translated in pieces and joined in order: no space for Chinese and Japanese, a space otherwise, line breaks as in the original. Every tier does this; the cache holds the whole paragraph.

### Fixed

- One request queue served all tiers, so AI requests could take every slot and hold back the dictionary and machine translation: with 20 paragraphs and AI merging off, no machine result arrived before the AI answers. Every service now has its own queue with its own concurrency limit.
- A request without an answer kept its paragraph spinning for good, and turning translation off and on again joined the same pending request. Requests now end with the timeout, and a failed or timed-out request is no longer shared with later ones.
- One paragraph the dictionary could not translate (no pack for its language) failed the whole batch. The dictionary and Bergamot now report every paragraph on its own.
- A merged AI answer with an empty translation counted as a result and the paragraph showed nothing. An empty translation now sends the batch paragraph by paragraph, as an empty single answer already failed; text without letters or digits may still translate to nothing.
- Bergamot detected one source language for a whole batch. It now detects every paragraph, translates each language in its own request and keeps the order; a language without models fails for its paragraphs only.
- The DeepLX token could appear in error texts (the "Request URL" line, tooltips of the page and the popup), and the endpoint was part of the settings sent to the content script. Error texts now mask the key or token of the service, token-like URL path segments, user info and credential parameters; the content script receives a hash of the endpoint.
- The cache key did not contain the endpoint, the thinking switch, the temperature or the installed dictionary packs, so changing them returned old translations. They are part of the key now, which stays compact (one hash for all of them); installing or deleting a dictionary pack changes it.
- With a Traditional Chinese target, Simplified Chinese paragraphs were skipped as already translated, and the other way round. The two standards are told apart by characters that exist in one of them only.
- The built-in prompts were written into the settings at installation, so improved prompts of a new version never reached anyone. Unchanged prompts are stored as empty; stored copies of the current built-in prompts, or of the one of 1.3 and earlier, are cleared when the settings are read, prompts written by the user stay. The prompt boxes show the built-in text.
- After one failed save, the settings page and the setup guide saved nothing more, and the setup guide's navigation could stop. A failed save is now shown in place of "Saved" and the next change is saved as usual.
- An unknown target language in the settings became Simplified Chinese; it now becomes the default target of the interface language.
- When Google's batch answer had an unexpected shape, the paragraph-by-paragraph requests bypassed the request queue, its concurrency limit and retries, and one failing paragraph failed all. They now go through the queue and fail one by one.
- A failed read of the stored cache let the next write replace every stored entry with the few of the session. The read is now tried again, and nothing is written before it succeeded.
- Changes from the popup and the keyboard shortcut could overwrite each other. They are now written one after the other and merged like the edits of the settings page.

### Changed

- Language detection has one implementation (`src/shared/lang-detect.ts`); the offline engine's own detector is gone.

## 1.5.2 - 2026-10-11

### Fixed

- Starting the download of an offline model that was already downloading (from the settings page and the setup guide at the same time) replaced the running entry: both pages showed 0 % and "Cancel" stopped nothing. The second request now waits for the running download, shares its progress and is cancelled with it.

### Changed

- The background script is an ES module, and the AI SDK is a chunk of its own that loads once the AI tier is in use. The script Thunderbird runs at start shrank from 1640 KiB to 54 KiB (plus a 47 KiB shared chunk); in the e2e runs on Thunderbird 156 the background script ran 47 ms after its page started instead of 186 ms, with unchanged times to the first dictionary, Google and AI results.
- Internal clean-up without change in behaviour: one mapping of language codes to Chinese script tags, one IndexedDB helper, one download reader and SHA-256 for dictionary packs and offline models, the offline engine's errors are plain `LocalizedError`s, the forwarding functions of the offline module are gone, and the popup, settings page and setup guide share the tier selectors.
- Documentation: the size of an offline model direction is 13 to 48 MB (was given as 24 to 48 MB); the README now says that the settings page reads the lists of dictionary packs and offline models when it opens, and that switching the display mode asks the AI tier again.

## 1.5.1 - 2026-10-11

### Fixed

- After a restart of Thunderbird with a message on screen, nothing was translated: the background script waited for `messageDisplayAction.setTitle()` before it sent the settings to the content script, and in this situation the call stayed pending. The title is now set without waiting for it.
- Quotes of plain-text messages were split into one paragraph per line. Thunderbird puts a `<span class="moz-txt-citetags">` before every quoted line, and a line break followed by such an element ended the paragraph. A single line break no longer ends a paragraph when the line continues with an element.
- In a plain-text message with a quote block inside its `<pre>`, the paragraphs after the quote came before the quoted ones. Paragraphs are now in document order, which the neighbouring paragraphs of precise translation rely on.
- `Retry-After` given as an HTTP date was ignored, and so was the `Retry-After` of AI services, whose errors come from the AI SDK. Both now set the wait before the retry (at most 30 seconds, as before).
- Clearing a number field on the settings page, or typing an invalid number, saved the field's minimum (for example a cache of 0 entries). The field now shows the stored value again and nothing is saved.

## 1.5.0 - 2026-10-11

### Added

- Setup guide (`welcome.html`, `src/welcome/`). The background script opens it in a tab when `runtime.onInstalled` reports `reason: "install"`; updates of the extension or of Thunderbird do not open it. The popup has a "Setup guide" link and the settings page a "Setup guide" button. Eight steps, one decision each: languages (interface, source, target), display mode with a preview drawn by the content script's renderer in the current style, the three tiers with a comparison of speed, quality, privacy and cost and a service (or "Not used") for each tier, offline downloads, online machine translation, AI translation (provider, key, model, temperature, thinking mode, connection test, precise translation, with a note on the extra requests and cost), prompts, and a last step with the shortcuts, the switch "Automatically translate messages not in the target language" and a trial. A progress bar and a numbered step list sit at the top; "Back", "Next", "Skip this step" and "Exit guide" are always available. Steps the earlier choices do not need (offline downloads without an offline service, online translator settings without Google, Microsoft or DeepLX, AI and prompts without the AI tier) are struck through and skipped. Every choice is saved at once; the current step is stored under `welcome` in `storage.local`, so the guide continues there next time, and starts from the beginning after "Finish". The page follows the light and dark theme, adapts to narrow windows, works with the keyboard and sets `<html lang dir>` from the interface language.
- The offline step lists the dictionary packs and Bergamot directions the chosen languages need, with size, license and attribution, each with a check box, and downloads the ticked ones with progress through "Download selected". For ja → zh-CN it recommends the direct dictionary pack when the release has it, otherwise ja → en and en → zh-Hans, and the Bergamot directions ja → en and en → zh-Hans.
- The trial in the last step renders a sample email in the page and translates it with the current settings. The page runs a `TranslationController` connected to the background script over the content script Port (`src/content/client.ts`, now shared with the content script), so the paragraph detection, the tiers and the rendering are those of a real message.
- Prompt presets (`src/shared/prompt-presets.ts`): dialect or regional usage (Cantonese (Hong Kong), Taiwan usage, Sichuanese, British and American English, Brazilian and European Portuguese, Mexican Spanish, Spanish of Spain, Canadian French, Swiss Standard German, offered by target language), difficult words with the original in parentheses, explanations of difficult words at the end of the same paragraph in 〔Note: …〕, and writing style (formal business, casual, plain language for learners, literary). A preset appends a block of English rules under its own heading to the bilingual, translation-only or precise prompt; applying it again replaces the block, different presets add up, and "Restore built-in prompt" removes them. The preset library is part of the prompt editor shared by the settings page and the guide, with the name, description and an example of each preset and variant in the interface language.
- Interface texts for these features in all 12 languages.

### Changed

- README in all languages: the switch that translates messages when they are opened is no longer called "automatic translation", which in several languages is the name of the machine translation tier ("Tradução automática" in Portuguese, "Traducción automática" in Spanish, "Traduction automatique" in French, 自動翻訳 in Japanese, "автоматический перевод" in Russian). The feature lists say "translate on opening", and the settings tables quote the label of the switch.

## 1.4.0 - 2026-10-11

### Added

- Three translation tiers replace the current service and race translation. The settings hold `tiers: { dictionary, machine, ai }`, each a service id or `null` ("Not used"); at least one tier has a service. Every paragraph is requested from all tiers in use at once, each tier with its own batching and cache. The background script reports every tier's result over the content script's Port (`tier` messages, then `done`). The message shows the highest tier that has answered: a lower tier in italics with a tag naming its tier, the highest tier in use as the final translation. A lower result that arrives after a higher one is ignored. When the highest tier fails, the best lower result stays, marked "<tier> failed" with the reason; a click retries only the failed tiers. Only when every tier fails is the paragraph marked as failed. A cached result of the highest tier answers at once without asking the lower tiers. The popup has one list per tier with "Not used" and the added services of that tier; the settings page has a "Translation tiers" section. Both refuse to leave every tier empty and say so. A service used by a tier cannot be removed.
- Dictionary translation (service `dictionary`, tier 1). Packs `dict-<src>-<tgt>.tsv.gz` (gzip TSV with `#dict` header, `w` entries and `f` inflected forms) and the index `dict-index.json` come from the GitHub release `dicts-v1` of this repository; the tag can be changed in the settings. The new "Dictionaries" section lists the packs with size, license and attribution, downloads them with a progress display, checks the SHA-256 checksum and the header, and stores them in the IndexedDB database `tt-dictionary`; it can delete them, and it explains why the index could not be loaded. Translation splits words with `Intl.Segmenter`, prefers the longest phrase of up to three words, looks words up through their lemma, keeps unknown words, punctuation and numbers, joins Chinese and Japanese output without spaces, and goes through English between two other languages. A missing pack is reported with the language pair and where to download it. Packs are read into memory on first use and released after five minutes without dictionary translations. Data: Wiktionary (CC BY-SA 4.0, via wiktextract and kaikki.org) and ECDICT (MIT).
- Offline translation with Bergamot (service `bergamot`, tier 2), using the engine module in `src/offline/bergamot/`. With source language "auto" the engine gets a fallback language from the script and English stop words. The background script handles the new messages `bergamotList`, `bergamotInstall`, `bergamotProgress`, `bergamotCancel`, `bergamotRemove` and `bergamotRequired`. The settings page section "Offline translation models (Bergamot)" lists the direction pairs with size and version, filters them by language, shows the directions the current languages need first, downloads with progress and cancel, offers updates, and asks before deleting a direction the current languages need. Models: Mozilla, MPL-2.0.
- Source language (`sourceLang`, "auto" by default) in the popup and in the General section, with a note when it equals the target language. It goes to Google (`sl`), Microsoft and Azure (`from`, left out for "auto"), DeepLX (`source_lang`), the AI request ("Translate … from <language>" or "Detect the source language …"), the dictionary and Bergamot. With a fixed source language, paragraphs whose language cannot be detected reliably count as that language. Cache keys and batch keys contain it.
- Three prompts for the AI tier (`prompts: { bilingual, translationOnly, precise }`), each with its own built-in text and a "Restore built-in prompt" button. The AI tier uses the prompt of the display mode, and the precise prompt while precise translation is on. Cache keys and batch keys contain the kind of prompt and a hash of its text. Switching the display mode asks the AI tier again with the other prompt (answered from the cache when possible) and only re-renders the other tiers. `src/shared/prompt-presets.ts` is the interface for a library of ready-made prompts, still empty.
- Interface texts for these features in all 12 languages.

### Changed

- Settings of 1.3 and earlier are converted: an AI service as current service becomes the AI tier, with the fast service of race translation as machine tier when race translation was on; any other current service becomes the machine tier. A custom system prompt becomes the prompt of both display modes. `activeProviderId`, `race` and `systemPrompt` are removed.
- Microsoft Translator in free mode calls only `edge.microsoft.com/translate/translatetext`. The token route through `edge.microsoft.com/translate/auth`, which Microsoft retired in July 2026, is removed, so no failed token request is sent every hour.

## 1.3.1 - 2026-10-11

### Fixed

- Turning the translation off, or changing the target language or service, while the extension was still checking which paragraphs are already in the target language could let the interrupted run continue: it sent translation requests for the old run, could leave a loading marker in the message and reported a wrong paragraph count to the popup.
- Clearing the cache while the stored cache was still being read brought the old entries back once the read finished.

### Changed

- Internal cleanup: unused messages, exports, members and build options removed; duplicated code in the translators, the settings, the error descriptions, the popup and settings page, and the tests merged.
- Settings pushed to a message are applied in the order they arrive. The display-mode shortcut changes the stored settings instead of the background script's copy.

## 1.3.0 - 2026-10-11

### Added

- Microsoft Translator can use your own Azure Translator key. The service panel has a switch between "Default interface (free)", which keeps the Edge token route with the direct fallback, and "Use my key (Azure Translator)". In key mode the extension calls the official Translator v3 `translate` method (`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=<language>`) with the headers `Ocp-Apim-Subscription-Key` and, when a region is entered, `Ocp-Apim-Subscription-Region`; the region can stay empty for a global resource. The panel shows the endpoint (for resources with a custom domain), the key (with the show and hide button) and the region only in key mode. The settings keep the mode as `mode` ("free" or "key") in the provider configuration, next to `apiKey`, `region` and the endpoint (`baseURL`). The connection test works in both modes.
- Batches for Azure follow the documented limits of one translate request: 1,000 array elements and 50,000 characters. The free route keeps its caps of 100 paragraphs and 5,000 characters. Your own batch settings still apply on top.
- A wrong Azure key or region (HTTP 401 and 403) gets its own advice: use the key of a Translator or multi-service resource, enter the region shown under Keys and Endpoint, and a 403 can also mean the free quota is used up. After a 404 in key mode the default endpoint is named.
- Interface texts for these features in all 12 languages.

### Fixed

- A change made in the popup while the settings page was open (current service, target language, display mode, automatic translation, race and precise switches) was overwritten by the next save of the settings page. The page now saves only what the user changed there, on top of the settings in storage, and shows changes made elsewhere right away. A field being edited is not touched. The popup shows changes of the display mode and of automatic translation made on the settings page as well.

## 1.2.0 - 2026-10-11

### Added

- Added services. Every provider has an `enabled` flag. The popup's service list and the settings page's "Current service" list show added services only; a "+ Add translation service" button under the popup list opens `options.html#providers`. The provider side list of the settings page has two groups, "Added" and "Available to add", with "Add" and "Remove" buttons. Typing an API key (for DeepLX, the endpoint) adds the service. The current service, and the fast service while race translation is on, cannot be removed; the disabled button comes with the reason.
- Race translation (`race: { enabled, fastProviderId }`, off by default, fast service Google Translate). With an AI service as current service, every paragraph is also translated by the fast service (Google, Microsoft or DeepLX). The background script pushes a `provisional` message over the content script's Port when the fast answer comes first and a `result` message with the final answer. Provisional translations are shown in italics with a "Provisional" tag; a failed AI request keeps the fast translation, marked "AI translation failed" with the reason as tooltip and a click to retry. A cached AI translation is answered without asking the fast service. The popup counts provisional paragraphs separately, for example "Translated 7 of 9 (2 provisional)".
- Precise translation (`precise: { enabled }`, off by default, AI services only). The content script registers the message text (paragraphs in order, cut at 20,000 characters) once per translation. Paragraphs that fit into one request are translated in that request. Longer messages get one analysis request that returns a summary, a glossary and the tone as JSON; it is parsed tolerantly, cached by provider, model, target language and message hash, shared by concurrent batches, and skipped when it fails. Every request of one message starts with the same system prefix (system prompt, analysis, and the full text up to about 8,000 characters), and each batch carries the neighbouring paragraphs as reference. For Anthropic the prefix is marked with `cacheControl: { type: "ephemeral" }`. Cache keys and batch keys contain the message hash.
- Thinking mode switch for each AI provider (`thinking`, off by default). `src/background/providers/thinking.ts` maps it to each provider's options by model name, for example `deepseek.thinking.type`, `anthropic.thinking.type`, `google.thinkingConfig`, `openai.reasoningEffort`, `alibaba.enableThinking` or `zhipu.thinking.type`; the README lists every value with its source. Perplexity, LM Studio and custom services have no thinking parameter; their switch is disabled with an explanation. While thinking is on, no temperature is sent.
- Interface texts for these features in all 12 languages.

### Changed

- DeepSeek: `deepseek-flash` thinks by default, which also made the API ignore the temperature. Requests now send `thinking: { type: "disabled" }` unless thinking mode is turned on, so the preset temperature 1.3 applies again.
- Settings saved by 1.1 and earlier are migrated: Google and Microsoft count as added, DeepLX with an endpoint, AI services with a saved key, keyless services (Ollama, LM Studio, custom) whose configuration was changed, and always the current service.
- The "Configured" tag in the provider list was replaced by the two groups.

## 1.1.1 - 2026-10-11

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

## 1.1.0 - 2026-10-11

### Added

- Interface in 12 languages: English, Simplified Chinese, Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese (Brazil), Russian, Turkish and Vietnamese.
- "Interface language" option on the settings page. The default follows Thunderbird's language; any of the 12 languages can be chosen explicitly. Open settings pages and popups switch immediately, labels inside messages switch the next time they are drawn.
- Target language names are shown in the interface language with the language's own name, for example "Japanese (日本語)", using `Intl.DisplayNames`. Prompts for AI services still use English language names.
- Error messages of the extension (missing endpoint, key or model, unexpected responses, HTTP failures) and the connection test result are shown in the interface language.
- The toolbar button tooltip and the "translation on" badge follow the interface language.
- README in 12 languages under `readmes/`.

### Changed

- On first installation the target language is taken from the interface language (for example Japanese for a Japanese Thunderbird, English for an English one) instead of always Simplified Chinese. Existing settings are kept.
- Provider names keep their brand names untranslated; suffixes such as "(free)" and "(local)" are translated.
- `README.md` is now the English main document; the Chinese version moved to `readmes/README.zh-CN.md`, and `README.en.md` was removed.

## 1.0.0 - 2026-10-11

- First release: in-place translation of the message body (bilingual or translation-only), free Google and Microsoft translators, DeepLX, 22 AI provider presets, request batching with cache, settings page and popup in English and Simplified Chinese.
