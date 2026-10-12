# Settings and behavior reference

This page describes every setting of Thunderbird Translate and how the extension behaves in detail. The README covers installation and everyday use; this page is the reference behind it.

## Contents

- [What is translated](#what-is-translated)
- [Settings page](#settings-page)
- [Setup guide](#setup-guide)
- [Popup](#popup)
- [Adding and removing services](#adding-and-removing-services)
- [Translation tiers](#translation-tiers)
- [Source language](#source-language)
- [Interface language](#interface-language)
- [Prompts](#prompts)
- [Prompt presets](#prompt-presets)
- [Precise translation](#precise-translation)
- [Request batching and timeouts](#request-batching-and-timeouts)
- [Offline services](#offline-services)
- [Offline lists](#offline-lists)
- [Download common languages](#download-common-languages)
- [Missing offline data](#missing-offline-data)
- [Retranslate and the cache](#retranslate-and-the-cache)
- [Translation style](#translation-style)
- [Settings from older versions](#settings-from-older-versions)
- [Privacy details](#privacy-details)
- [Known limitations](#known-limitations)

## What is translated

The content script looks for paragraph-level content in the message body:

- paragraphs, list items, table cells, headings and block quotes of HTML mail;
- divs that contain only text;
- blank-line separated paragraphs of plain-text mail, with hard-wrapped lines joined.

Code, paragraphs already in the target language, numbers, bare links and whitespace are skipped. Bilingual mode inserts a translation block under the original. Translation-only mode replaces the original with the translation; the original is kept in memory and put back when translation is turned off.

## Settings page

Open the settings page with the "Options" button of this extension in the Add-ons Manager. Settings are saved automatically. "Saved" appears in the top right corner once they are written. When a save fails, the error appears in its place and the change goes with the next save. The "Setup guide" button next to it opens the setup guide.

| Section | Contents |
| --- | --- |
| General | Interface language, source language, target language, default display mode, the switch "Automatically translate messages not in the target language" |
| Translation tiers | The service of each tier or "Not used", with the mark of an offline service that lacks data; precise translation; the muted notices about missing offline data, with "Remind me again" |
| Translation services | Services in two groups, "Added" and "Available to add", filtered by tier; endpoint, API key, model, temperature and thinking mode of each service; "Test connection", "Add", "Use this service" and "Remove" buttons |
| Dictionaries | Every pack of the release with size, license and attribution, those of the recommended languages first; filter; "Download common languages"; download and delete; release tag of the packs (advanced) |
| Offline translation models (Bergamot) | Every direction of the Bergamot models with size and version, those of the recommended languages first; filter; "Download common languages"; download, update, cancel and delete; the directions the current languages need |
| Prompts (AI tier) | The preset library; the prompts for bilingual display, translation-only display and precise translation, each with "Restore built-in prompt" |
| Request batching | Collection window, maximum characters and paragraphs per request, concurrency, retries, request timeout, whether to merge AI requests |
| Translation style | Left border, dashed left border, highlight or plain; accent color, text opacity, font size ratio; live preview |
| Cache | Cache on or off, maximum cached paragraphs, current number of entries, clear cache |

"Test connection" sends one test sentence with the values currently in the input fields. On success it shows the translation. On failure it shows the error returned by the service, for example an invalid key or an unknown model name.

The endpoints, default models and thinking parameters of every service are listed in [providers.md](providers.md).

## Setup guide

After a new installation Thunderbird opens the setup guide in a tab. Updates of the extension or of Thunderbird do not open it. The guide is also available later from the "Setup guide" link in the popup and the "Setup guide" button at the top of the settings page.

Each step asks for one decision and saves it at once. "Back", "Next" and "Skip this step" move between steps. The numbered list under the progress bar jumps to any step, and "Exit guide" closes the tab at any time. The next visit starts at the step where the guide was left; after "Finish" it starts from the beginning. The guide stays open with the error when its settings cannot be saved on leaving or finishing.

| Step | Contents | Shown when |
| --- | --- | --- |
| 1 Languages | interface language, source language ("Detect automatically" by default), target language | always |
| 2 Display | bilingual or translation only, with a preview of a sample message in the current translation style | always |
| 3 Translation tiers | speed, quality, privacy and cost of the dictionary, machine translation and AI tiers; the service of each tier or "Not used", at least one tier with a service | always |
| 4 Offline translation | every dictionary pack and Bergamot direction with size, license and attribution, those of your languages first and ticked; "Download selected" with progress, or "Download common languages" | the dictionary tier is used or the machine tier uses Bergamot |
| 5 Online machine translation | the fields of the machine translator: nothing to fill in for Google, free or Azure key mode for Microsoft, endpoint and token for DeepLX; "Test connection" | the machine tier uses Google, Microsoft or DeepLX |
| 6 AI translation | the AI provider, its API key, model, temperature and thinking mode, "Test connection", and the precise translation switch; a note that thinking mode and precise translation make translation slower and more expensive | the AI tier is used |
| 7 Prompts | the three prompts and the preset library | the AI tier is used |
| 8 Done | how to translate (toolbar button, Alt+A, Alt+S), the switch "Automatically translate messages not in the target language", and "Translate the sample message" | always |

A step that the earlier choices do not need stays in the list, struck through, and the navigation passes over it. Choosing an AI service in step 3, for example, brings steps 6 and 7 back.

Step 4 lists every direction of both catalogs, in the order described under [Offline lists](#offline-lists). What is ticked depends on the source language:

- A fixed source language: the directions the pair needs. For Japanese → Simplified Chinese these are the dictionary pack Japanese → Chinese when the release has it, otherwise Japanese → English and English → Chinese, and the Bergamot directions ja → en and en → zh-Hans, since every Bergamot model has English on one side.
- "Detect automatically": the directions of the recommended languages in both directions with English. A note explains the route: a message in another language goes into English with "language → English" and from there with "English → target language".

"Download selected" is disabled while nothing is ticked, and the line next to it then says "Tick the items to download first.". During the download it shows "Downloading N items…", at the end "Downloads finished." or the number of failed downloads. Each failed row shows its reason. The guide downloads two directions at a time.

"Translate the sample message" in step 8 renders a short email in the page and translates it with the current settings. The email is in the source language when that is English or German, otherwise in English, or in German when the target language is English. The page uses the paragraph detection and rendering of the content script and sends the requests to the background script over the same connection as a displayed message. The result therefore shows what a real message will look like, including the tiers in use.

The guide uses the same components as the settings page: the service fields and connection test, the dictionary and Bergamot lists, and the prompt editor with its presets.

## Popup

The "Translate message" button in the message header toolbar opens the popup.

- "Translate this message" starts translating. While a translation is running or shown, the button reads "Show original" and restores the original when clicked.
- "Retranslate" appears next to "Show original" while the message is translated, see [Retranslate and the cache](#retranslate-and-the-cache).
- Display switches between bilingual and translation-only. The change applies to the current message immediately.
- Source language and target language: after a change of either, a message being translated is translated again. A note appears when both are the same language.
- Translation tiers: one list per tier (1 dictionary, 2 machine translation, 3 AI translation), each with "Not used", the added services of that tier and, as last entry, "+ Add translation service…". That entry opens the settings page at the translation services of the tier and leaves the list at its value. At least one tier needs a service; choosing "Not used" for the last one is refused with a note.
- Precise translation is shown while the AI tier has a service.
- "Automatically translate messages not in the target language": when checked, a message whose body is not in the target language is translated as soon as it is opened.
- "Setup guide" opens the setup guide in a new tab.

The popup shows the progress, for example "Translated 8 of 12". Paragraphs that still show a provisional translation of a lower tier are counted separately, for example "Translated 7 of 9 (2 provisional)". When every tier fails for a paragraph, a red "Translation failed, click to retry" appears after it. Hovering shows the error, and clicking retries that paragraph.

Changing the display mode or the target language while a message is translated re-renders the page without reopening the message. In translation-only mode, hovering over a translation shows the original text in a tooltip.

The shortcuts Alt+A, Alt+S and Alt+R can be changed under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager. Alt+A pressed while the setup guide is the active tab translates or restores its sample message.

## Adding and removing services

The side list of the translation services section has two groups. "Added" holds the services that appear in the service lists of the popup and of the settings page. "Available to add" holds all others. Selecting a service shows its configuration and buttons:

- A service that is not added has an "Add" button. Typing an API key (for DeepLX, the endpoint) adds the service as well.
- An added service has "Use this service", which puts it into its tier, and "Remove". Removing takes the service out of the lists and keeps its configuration, so adding it again restores the key and the model.
- A service that a tier uses cannot be removed. The "Remove" button is then disabled and a line below it names the tier. Services in use carry an "In use" tag in the side list.

A fresh installation starts with Google Translate and Microsoft Translator added. The dictionary and Bergamot need data that you download, so they are added by hand.

## Translation tiers

| Tier | Services | What it gives |
| --- | --- | --- |
| 1 Dictionary | Dictionary (offline) | a word-by-word gloss from the installed dictionary packs, available at once and without network |
| 2 Machine translation | Google Translate, Microsoft Translator, DeepLX, Bergamot (offline) | a full translation within a second or two |
| 3 AI translation | the 22 AI providers | the best translation, following the prompt of the display mode |

Each tier has one service or "Not used", and at least one tier has a service. The default is Google Translate in tier 2 and nothing else.

Every paragraph goes to all tiers in use at the same time. Each tier uses the normal batching and cache. What the message shows follows one rule: the highest tier that has answered wins.

| Case | What the message shows |
| --- | --- |
| A lower tier answers first | its translation, in italics with a tag naming its tier ("Dictionary", "Machine translation"); hovering says which tier is still running. A higher tier replaces it when it arrives |
| The highest tier in use answers | its translation, without a tag: the final translation. Lower tiers that answer later are ignored |
| The highest tier fails | the best lower translation stays, marked "AI translation failed" (or the name of the highest tier); hovering shows the reason, clicking retries only the failed tiers |
| Every tier fails | the red "Translation failed, click to retry" marker |
| The highest tier's translation is already cached | that translation at once; the lower tiers are not asked |

Switching the display mode re-renders the dictionary and machine translations as they are. The AI tier uses one prompt per display mode, so it is asked again with the prompt of the new mode. A translation already cached for that prompt comes back without a request. The popup counts final translations as translated and lower-tier translations as provisional.

## Source language

The source language is "Detect automatically" by default, or one of the 20 languages of the target language list. How each service receives it is listed in [providers.md](providers.md#source-language-in-requests).

Paragraphs detected as the target language are skipped. Chinese, Japanese, Korean and similar scripts are judged by character class. Latin- and Cyrillic-script languages first use `i18n.detectLanguage` of the extension API. When that API is unavailable or its result is unreliable, only English is detected reliably, and paragraphs in other Latin-script languages are sent for translation as usual.

With a fixed source language, paragraphs whose language cannot be detected reliably count as that language. Cache keys and batches contain the source language, so changing it never returns translations made for the old setting.

With Chinese as the target language, a paragraph also has to be written in the target's standard. A Simplified Chinese paragraph is translated when the target is Traditional Chinese, and the other way round. Characters that exist in one standard only (们/們, 这/這, 说/說…) decide. The table holds 83 frequent characters; a paragraph without any of them reads the same in both standards and is skipped.

The dictionary and Bergamot do not translate between Simplified and Traditional Chinese. Both would go through English and return English glosses in Chinese word order, for example 我们明天开会 as 我們明天持有一個會議. A paragraph in the other Chinese standard therefore fails in these two tiers with "This service does not translate between Simplified and Traditional Chinese.", shows no provisional translation from them, and is translated by the machine and AI tiers. The setup guide recommends no dictionary packs for this pair.

## Interface language

The "Interface language" option in the General section has two kinds of values:

- "Follow Thunderbird" (default): the extension uses the supported language closest to Thunderbird's own interface language. The option label shows the language currently chosen, for example "Follow Thunderbird (Deutsch)".
- One of the 12 supported languages: the extension uses that language regardless of Thunderbird's language.

The choice applies to the popup, the settings page, the labels inside messages ("Translating…", "Translation failed, click to retry"), error messages, the connection test result and the toolbar button tooltip. An open settings page or popup switches its text immediately. Labels inside a message that is already translated change the next time they are drawn.

A few texts are read by Thunderbird itself from the extension manifest and always follow Thunderbird's interface language: the extension name and description in the Add-ons Manager, and the shortcut descriptions under "Manage Extension Shortcuts". The settings page states this under the option.

"Follow Thunderbird" maps Thunderbird's language as follows:

| Thunderbird language | Interface language used |
| --- | --- |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` | Traditional Chinese |
| other `zh-*` | Simplified Chinese |
| `pt-*` | Portuguese (Brazil) |
| `en-*`, `ja`, `ko`, `fr-*`, `de-*`, `es-*`, `ru`, `tr`, `vi` | the language with the same primary subtag |
| any other language | English |

The 12 interface languages are English, Simplified Chinese, Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese (Brazil), Russian, Turkish and Vietnamese. The target language list is separate and contains 20 languages, including Italian, Ukrainian, Polish, Dutch, Thai, Indonesian, Arabic and Hindi. It shows each language name in the interface language followed by the language's own name, for example "Japanese (日本語)".

On first installation the target language is set from the interface language: a Japanese Thunderbird starts with Japanese as the target language, an English Thunderbird with English. An existing target language is never overwritten.

Error messages produced by the extension are translated. Error texts returned by a translation service or by the AI SDK, for example the body of an HTTP 401 response, are shown as received, usually in English.

## Prompts

The AI tier has three system prompts. Each can be edited on the settings page and restored with "Restore built-in prompt".

| Prompt | Used for | Built-in prompt asks for |
| --- | --- | --- |
| Bilingual display | the AI tier in bilingual mode | a translation close to the original, sentence by sentence in the same order, adding and dropping nothing, since the reader compares it with the original |
| Translation-only display | the AI tier in translation-only mode | fluent text that reads as an email written in the target language; clauses may be reordered and sentences split or joined, with the complete meaning kept |
| Precise translation | the AI tier while precise translation is on, in both display modes | consistent terms, names and forms of address across the message, using the glossary, the summary and the neighbouring paragraphs |

The settings store only prompts you changed. An unchanged prompt is stored as empty and stands for the built-in text, which the box shows, so a later version of the extension brings its improved built-in prompts to you. "Restore built-in prompt" and a box whose text equals the built-in prompt both store empty. Copies of a built-in prompt saved by earlier versions are recognised and cleared when the settings are read, and the settings are written back in this form at once.

`{{to}}` is replaced by the English name of the target language. The extension adds the source language and the batch format to every request itself.

Cache keys and batch keys contain the kind of prompt and a hash of its text. Editing a prompt therefore never returns translations made with the old text.

## Prompt presets

The preset library sits above the three prompts on the settings page and in step 7 of the setup guide. Choose a preset, a variant where the preset has variants, and the prompt to add it to, then click "Apply preset". The line "Example" shows a source sentence and the expected result of the chosen preset.

| Preset | Variants | Rule added to the prompt |
| --- | --- | --- |
| Plain (no added rules), the first entry | none | none: applying it removes every block that a preset added to the prompt and keeps the text you wrote; a prompt that is then the built-in one is stored as empty again |
| Dialect or regional usage | by target language: Cantonese (Hong Kong) and Sichuanese for Simplified Chinese; Cantonese (Hong Kong) and Taiwan usage for Traditional Chinese; British and American English; Brazilian and European Portuguese; Mexican Spanish and Spanish of Spain; Canadian French (Quebec); Swiss Standard German | write in that variety, with its spelling, vocabulary and forms of address |
| Difficult words with the original | none | translate normally and put the original term in parentheses after each difficult word or technical term, once per paragraph, for example 尽职调查（due diligence） |
| Explanations of difficult words | none | translate the paragraph, then explain its difficult words in the target language at the end of the same paragraph in one bracket: 〔Note: term: explanation; …〕 |
| Writing style | formal business, casual, plain language for learners, literary | use that register and keep the complete meaning |

The variant list follows the target language. A target language without varieties, such as Japanese, does not offer the dialect preset.

A preset adds a block of English rules to the end of the prompt, after a blank line. The block starts with a heading such as `Style (this rule takes precedence over the rules above):`, so it overrides general rules of the built-in prompt such as "Do not add explanations". Applying the same preset again replaces its block; different presets add up. The prompt box shows the combined text and stays editable, and "Restore built-in prompt" removes every addition.

The presets keep one translation per paragraph. The explanations of difficult words stay inside the translation of their paragraph, and the block forbids returning them as a separate paragraph or array element. A batch therefore still comes back as a JSON array (or numbered segments) with exactly one entry per paragraph.

The presets are instructions to the model. How closely a dialect or style is followed depends on the model; small models mix regional varieties more often.

## Precise translation

Precise translation applies to the AI tier and sends the message as context with every AI request. It is turned on in the popup or in the "Translation tiers" section of the settings page.

When translation starts, the content script joins the paragraphs it found into the plain text of the message and registers it with the background script once. The text sent as context is cut after 20,000 characters, with a note that the text continues. The message is identified by a hash of its full text, because the content script has no access to the message ID. Two copies of the same text share their translations and their analysis.

The flow depends on the size of the paragraphs to translate:

1. If they fit into one request (within "Max characters per request" and "Max paragraphs per request"), one request translates all of them. The request itself carries the whole message.
2. Otherwise one extra request first analyzes the whole message. It returns a summary of two to three sentences, a glossary of names, products and other proper nouns with the translation to use, and the tone and form of address.
3. Every request then starts with the same prefix: the system prompt, the analysis and, for messages up to about 8,000 characters, the full text. After the prefix come the paragraphs of the batch, each with the paragraph before and after it as reference that is not translated.

If the analysis answer cannot be read, translation goes on without it, and the message is not analyzed again. If the analysis request fails (network error, timeout, HTTP error), translation also goes on without it, and the next translation of the message asks again.

The prefix is identical, character for character, for every request of one message, so providers that cache repeated prompt prefixes can serve it from their cache. For Anthropic the prefix is marked with `cacheControl: { type: "ephemeral" }`. Prompt caching is up to the provider: Anthropic caches only prefixes above a minimum length that depends on the model, and shorter prefixes are sent and billed normally.

The analysis is cached like translations. Its key contains the provider, model, source and target language, the hash of the request configuration (endpoint, prompt, thinking switch, temperature) and the hash of the message text. Batches of one message wait for the same analysis request.

Translations made in precise mode are cached under a key that contains the message hash, and batches never mix paragraphs of different messages. The same sentence in another message is therefore translated again, with that message as context. The analysis request and the longer prompts make precise translation more expensive than normal translation.

## Request batching and timeouts

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Collection window (ms) | 50 | 0–2000 | how long paragraphs of one group accumulate before a batch is sent |
| Max characters per request | 3000 | 200–50000 | a batch is sent before the next paragraph would exceed it; longer paragraphs are split |
| Max paragraphs per request | 30 | 1–200 | a batch is sent when it holds this many paragraphs |
| Concurrent requests | 4 | 1–20 | concurrent requests per service |
| Retries (429 / 5xx / network / timeout) | 3 | 0–10 | retries with exponential backoff |
| Request timeout (seconds) | 60 | 5–600 | time for the complete answer; three times as long for Ollama, LM Studio and any model with thinking mode on |
| Merge paragraphs into one AI request | on | | off sends one paragraph per AI request |

[batching.md](batching.md) describes the batch queue, how each service merges paragraphs, what happens after a timeout, and the cost estimate.

## Offline services

The dictionary and Bergamot translate on your computer. Their data is downloaded once and stored in the IndexedDB of the extension.

The dictionary translates word by word with dictionary packs from a GitHub release of this repository, by default `dicts-v1`. The release tag can be changed under "Release tag of the dictionary packs (advanced)" in the Dictionaries section. The packs cover English, Simplified and Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Turkish and Vietnamese; between two languages other than English the text goes through English. The result is a gloss: words in the source order, without grammar or inflection, and words outside the packs stay untranslated. Download, verification and lookup are described in [dictionary-packs.md](dictionary-packs.md#扩展中的下载与查词).

Bergamot translates with the engine and the models of Firefox Translations, published by Mozilla under MPL-2.0. The engine ships with the extension. Each translation direction is downloaded once from Mozilla, 13 to 48 MB. The catalog has 114 direction pairs among 58 languages, and every model has English on one side, so Japanese to Chinese uses Japanese → English and English → Chinese. A loaded direction takes about 200 MB of memory and is released after five minutes without use. An installed pair with a newer version offered by Mozilla shows "Update". Deleting a pair that the current languages need asks for confirmation. [bergamot.md](bergamot.md) describes model selection, verification, storage and the engine.

Both lists fail after 30 seconds without an answer. A download that receives no data for 30 seconds stops with an error; a slow download that keeps receiving data has no time limit. Downloads show their progress and can be cancelled. If a list cannot be loaded, the section says why, and installed packs and models can still be deleted.

## Offline lists

The dictionary list and the Bergamot list, on the settings page and in step 4 of the setup guide, show every direction of their catalog and the installed ones. A filter field takes language names or directions such as `ja>en`; several terms are separated by commas.

The directions of the recommended languages come first. A recommended language comes from one or more of these sources, in this order of importance:

1. the target language;
2. the source language, when it is fixed;
3. the interface language of the extension ("Follow Thunderbird" counts as Thunderbird's language);
4. Thunderbird's interface language;
5. the system languages (`i18n.getPreferredSystemLanguages()`; when it is missing, fails or answers nothing, the locale of the `Intl` formats stands in).

For every recommended language X other than English, the directions X → English and English → X are recommended. For the dictionary, the direct packs between X and the target language are recommended as well when the release has them. Each recommended row carries its sources as labels, plus "Direct" for a direction into the target language and "Via English" for one into English that serves the route through English. The other directions follow by name.

## Download common languages

"Download common languages" in both lists downloads the directions to and from English of eight fixed languages: Simplified Chinese, Spanish, French, German, Japanese, Portuguese, Russian and Korean, as far as the catalog has them. Before downloading it lists the directions and their total size; installed directions are left out. When all are installed, the button is disabled and says "The common languages are all installed.".

## Missing offline data

The rule for what a language pair needs is the same everywhere:

| Service | Pair with English on one side | Pair without English |
| --- | --- | --- |
| Dictionary | the direct pack | the direct pack when the release has it, otherwise source → English and English → target |
| Bergamot | the direct direction | source → English and English → target |

Simplified ↔ Traditional Chinese and pairs whose directions the catalog does not offer are unsupported. There is nothing to download, and the paragraphs go to the other tiers.

When the dictionary tier or Bergamot in the machine tier fails for paragraphs of a message because a pack or model is missing, a notice appears above the message once the first translation round has finished. It appears once per message and only for the offline tiers in use. It lists one line per service and language pair, for example "Dictionary: Japanese → Simplified Chinese, missing Japanese → English and English → Simplified Chinese", and has three controls:

- "Download in settings" opens the settings page with both offline lists filtered to the missing directions.
- "Don't remind me for these languages" mutes the listed entries, per service and language pair. The muted entries are listed under "Translation tiers" on the settings page, and "Remind me again" brings them back.
- "Close" removes the notice.

Paragraphs whose language was only guessed, network errors and unsupported pairs do not count. The paragraphs still get the translations of the other tiers; with only offline tiers in use they stay failed.

Whether a pack or model can be downloaded is known only from the list of its service. Until that list has been read, nothing counts as missing: no notice appears, nothing is marked in red, and the error under the paragraph names no directions to download. When the lists are read is described under [Privacy details](#privacy-details).

In the popup and on the settings page, a selected dictionary or Bergamot that lacks what the current languages need reads "Dictionary (local model not downloaded)" or "Bergamot (local model not downloaded)" in red. A line under the tier lists names the missing directions with a "Download" link to the filtered lists. With automatic detection the direction from English into the target language counts; for English as target, at least one direction into English. An unsupported pair is named on that line without red. The marks follow installations and deletions made on other pages.

## Retranslate and the cache

"Retranslate" in the popup and the shortcut Alt+R translate the current message again in the current display mode. They do nothing while the message is not translated.

- Every tier is asked anew: neither the cache nor a request still running answers.
- The new results replace the cached ones.
- Precise translation analyses the message again, and the new analysis replaces the cached one.
- Lower tiers show provisional translations as usual.
- The notice about missing offline data keeps its once-per-message rule.
- Translations of other messages stay in the cache.

"Show original" followed by "Translate this message" translates from what the page remembers and sends no request.

The Cache section turns the cache on or off (on by default), sets the maximum number of cached paragraphs (5000 by default, 0–100000), shows the current number of entries and clears the cache. The cache is stored in `storage.local` of the Thunderbird profile and evicts the least recently used entries.

## Translation style

The Translation style section sets how translations look in the message:

- Style: left border (default), dashed left border, highlight or plain.
- Accent color: `#4c8bf5` by default.
- Text opacity: 0.85 by default, 0.3–1.
- Font size ratio: 1 by default, 0.7–1.5.

A live preview shows a sample paragraph with its translation. The bilingual block stays readable in dark themes.

## Settings from older versions

Settings saved by older versions are converted once when they are read.

When settings from version 1.1 or earlier are loaded, a service counts as added in these cases:

| Service | Counts as added when |
| --- | --- |
| Google Translate, Microsoft Translator | always |
| DeepLX | an endpoint is filled in |
| AI services that need a key | an API key is saved |
| Ollama, LM Studio, custom OpenAI-compatible | the endpoint, model or temperature was changed |
| the services of the tiers | always |

Settings saved by version 1.3 and earlier have no tiers. An AI service as current service becomes tier 3, together with the fast service of race translation as tier 2 when race translation was on. Any other current service becomes tier 2. The dictionary tier starts unused. A custom system prompt saved by version 1.3 or earlier becomes the prompt of both display modes; the precise prompt starts with its built-in text.

## Privacy details

- API keys are stored only in `storage.local` of the current Thunderbird profile and are sent only with requests to the endpoint of the matching provider.
- The content script runs inside the message page. The settings it receives from the background script contain neither keys nor endpoints, since an endpoint can hold a token.
- Error messages mask what may be a secret, and the masked parts read `***`:
  - the API key or token of the service, wherever it appears;
  - URL path segments that look like a token (20 or more characters with letters and digits);
  - user names and passwords in URLs;
  - URL parameters whose names contain key, token, auth, secret, sig, pass, credential or session.
- Message text is sent only to the services of the tiers in use. The dictionary and Bergamot translate on your computer and send no text anywhere.
- Two lists come from the network, without any message text: the list of dictionary packs from this repository's GitHub releases and the list of Bergamot models from Mozilla. The settings page and the setup guide read them to show the offline lists.
- While the dictionary or Bergamot is the service of a tier, the background script also reads its list: when Thunderbird starts, when the settings change, and when the popup or the settings page asks what is missing. It reads the dictionary list once per release tag, and after a failed read again 10 minutes later at the earliest. It reads the Bergamot list again once the copy in memory is older than 6 hours. Translating a message reads neither list, also when a pack or model is missing.
- The packs and models themselves are downloaded only when you click "Download" or one of the download buttons. The extension collects no statistics and contacts no other network address.
- The translation cache is stored locally and can be turned off or cleared on the settings page.

## Known limitations

- Translations are plain text. Links, bold text and other inline formatting of the original are not kept in the translation. In bilingual mode the original stays fully usable; in translation-only mode you can hover to see the original or switch back to bilingual.
- The free Google and Microsoft endpoints are undocumented and may change or be rate-limited.
- Language detection of Latin-script languages other than English depends on `i18n.detectLanguage`, see [Source language](#source-language).
- The content script is registered through `messageDisplayScripts` and reaches only messages opened after registration. On startup the extension tries to inject it into messages already open; if that fails, selecting the message again is enough.
- Error texts returned by a service are shown as received, usually in English.
- The extension name, its description in the Add-ons Manager and the shortcut descriptions follow Thunderbird's interface language, not the interface language option.
- Precise translation identifies a message by a hash of its body text. Two copies of the same text share their translations and their analysis.
- Prompt caching is up to the provider, see [Precise translation](#precise-translation).
- The thinking switch works by matching model names, see [providers.md](providers.md#thinking-mode).
- Every tier in use sends its own requests. With the AI tier and the machine tier both in use, each message also costs requests to the machine translator.
- Dictionary translation is a word-by-word gloss: it keeps the word order of the source and does not inflect. Words outside the packs stay untranslated.
- The sample message of the setup guide is in English, or in German when the target language is English. With a fixed source language other than these two, the trial still sends that source language with the English text.
- Alt+A pressed while the setup guide is the active tab translates or restores the sample message; the label of the trial button then does not follow.
- With automatic detection, Bergamot gives a paragraph too short for the detector (fewer than 12 letters) the most frequent language of its batch. A short paragraph in another language than its neighbours is therefore translated as theirs.
- Simplified and Traditional Chinese are told apart by a table of 83 frequent characters. A paragraph that uses none of them counts as already in either Chinese target.
- The dictionary and Bergamot do not convert between Simplified and Traditional Chinese. With one of them as the only tier in use, a paragraph in the other standard stays untranslated.
