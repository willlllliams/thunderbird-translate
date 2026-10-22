# Settings and behavior reference

This page describes every setting of Multi Translate for Thunderbird and how the extension behaves in detail. The README covers installation and everyday use; this page is the reference behind it.

## Contents

- [What is translated](#what-is-translated)
- [Settings page](#settings-page)
- [Setup guide](#setup-guide)
  - [Demo and tour of the tiers](#demo-and-tour-of-the-tiers)
  - [Trial](#trial)
- [Popup](#popup)
- [Adding and removing services](#adding-and-removing-services)
  - [Connection check of the free routes](#connection-check-of-the-free-routes)
- [Translation tiers](#translation-tiers)
- [Consent before online translation](#consent-before-online-translation)
- [Source language](#source-language)
- [Interface language](#interface-language)
- [Prompts](#prompts)
- [Prompt presets](#prompt-presets)
- [Precise translation](#precise-translation)
- [Summary and to-dos](#summary-and-to-dos)
- [Image translation](#image-translation)
- [Request batching and timeouts](#request-batching-and-timeouts)
- [Offline services](#offline-services)
- [Offline lists](#offline-lists)
- [Download common languages](#download-common-languages)
- [Missing offline data](#missing-offline-data)
- [Retranslate and the cache](#retranslate-and-the-cache)
- [Translation style](#translation-style)
- [Markdown in AI translations](#markdown-in-ai-translations)
- [Settings from older versions](#settings-from-older-versions)
- [Permissions](#permissions)
- [Privacy details](#privacy-details)
- [Known limitations](#known-limitations)

## What is translated

The content script looks for paragraph-level content in the message body:

- paragraphs, list items, table cells, headings and block quotes of HTML mail;
- divs that contain only text;
- blank-line separated paragraphs of plain-text mail, with hard-wrapped lines joined.

Code, paragraphs already in the target language, numbers, bare links and whitespace are skipped. Bilingual mode inserts a translation block under the original. Translation-only mode replaces the original with the translation; the original stays in the message, hidden, and comes back when translation is turned off. After an update of the extension the new version puts such an original back first; a message shown in translation-only mode by 2.3 or earlier keeps its translation as text until it is opened again, since those versions kept the original in memory only.

## Settings page

Open the settings page with the "Options" button of this extension in the Add-ons Manager. Settings are saved automatically. "Saved" appears in the top right corner once they are written. When a save fails, the error appears in its place and the change goes with the next save. The "Setup guide" button next to it opens the setup guide.

Resting the mouse on any control of the settings page, the popup or the setup guide shows one short sentence about what it is or what it does; the buttons of the notice above a message have one too.

| Section | Contents |
| --- | --- |
| General | Interface language, source language, target language, default display mode, the switch "Automatically translate messages not in the target language" |
| Translation tiers | The service of each tier or "Not used", with the mark of an offline service that lacks data; precise translation with the image settings under it; the muted notices about missing offline data, with "Remind me again"; the online services allowed to receive message text, each with "Revoke" |
| Translation services | Services in two groups, "Added" and "Available to add", filtered by tier; endpoint, API key, model, temperature and thinking mode of each service, the app ID and account edition of Baidu, the app ID of Youdao, formality and target variants of DeepL; "Test connection", "Add", "Use this service" and "Remove" buttons |
| Dictionaries | Every pack of the release with size, license and attribution, those of the recommended languages first; filter; "Download common languages"; download and delete; release tag of the packs (advanced) |
| Offline translation models (Bergamot) | Every direction of the Bergamot models with size and version, those of the recommended languages first; filter; "Download common languages"; download, update, cancel and delete; the directions the current languages need |
| Prompts (AI tier) | The preset library; the prompts for bilingual display, translation-only display, precise translation and the summary, each with "Restore built-in prompt" |
| Summary and to-dos | The service and model of the summary, the answer length limit, whether the panel opens expanded, automatic summary, the parts to include, and the "Summary" button above a translated message |
| Request batching | Collection window, maximum characters and paragraphs per request, concurrency, retries, request timeout, whether to merge AI requests |
| Translation style | Left border, dashed left border, highlight or plain; accent color, text color, text opacity, font size ratio; live preview; the switch "Render Markdown in AI translations" |
| Cache | Cache on or off, maximum cached paragraphs, current number of entries, clear cache |

"Test connection" sends one test sentence with the values currently in the input fields; for DeepL it reads the characters used instead, which costs nothing. On success it shows the translation, or for DeepL the characters used and the limit of the billing period. On failure it shows the error returned by the service, for example an invalid key or an unknown model name.

The endpoints, default models and thinking parameters of every service are listed in [providers.md](providers.md).

## Setup guide

After a new installation Thunderbird opens the setup guide in a tab. Updates of the extension or of Thunderbird do not open it. The guide is also available later from the "Setup guide" link in the popup and the "Setup guide" button at the top of the settings page.

Each step asks for one decision and saves it at once. "Back", "Next" and "Skip this step" move between steps. The numbered list under the progress bar jumps to any step, and "Exit guide" closes the tab at any time. The next visit starts at the step where the guide was left; after "Finish" it starts from the beginning. The guide stays open with the error when its settings cannot be saved on leaving or finishing.

| Step | Contents | Shown when |
| --- | --- | --- |
| 1 Languages | interface language, source language ("Detect automatically" by default), target language | always |
| 2 Display | bilingual or translation only, and the controls of the translation style, with a preview of a sample message in the current mode and style | always |
| 3 Translation tiers | speed, quality, privacy and cost of the dictionary, machine translation and AI tiers; the service of each tier or "Not used", at least one tier with a service; a note that the first online translation asks once per service; a demo of the chosen tiers on a sample paragraph and a tour of the three selectors | always |
| 4 Offline translation | every dictionary pack and Bergamot direction with size, license and attribution, those of your languages first and ticked; "Download selected" with progress, or "Download common languages" | the dictionary tier is used or the machine tier uses Bergamot |
| 5 Online machine translation | the fields of the machine translator: nothing to fill in for Google, free or Azure key mode for Microsoft, endpoint and token for DeepLX, the key of DeepL, Baidu, Youdao or Caiyun; "Test connection" | the machine tier uses an online service |
| 6 AI translation | the AI provider, its API key, model, temperature and thinking mode, "Test connection", the precise translation switch and under it the mode of image translation (Off, Ask under each image, On; greyed out while precise translation is off) with a note on its cost and consent; a note that thinking mode and precise translation make translation slower and more expensive | the AI tier is used |
| 7 Prompts | the three prompts and the preset library | the AI tier is used |
| 8 Done | how to translate (toolbar button, Alt+A, Alt+S), the switch "Automatically translate messages not in the target language", and "Translate the sample message" | always |

A step that the earlier choices do not need stays in the list, struck through, and the navigation passes over it. Choosing an AI service in step 3, for example, brings steps 6 and 7 back.

The guide uses the same components as the settings page: the translation style controls, the service fields and connection test, the dictionary and Bergamot lists, and the prompt editor with its presets.

Step 2 holds the same style controls as the Translation style section of the settings page, described under [Translation style](#translation-style), except the switch "Render Markdown in AI translations", which only the settings page has. Every change redraws the sample message at once and is saved like any other setting.

Step 4 lists every direction of both catalogs, in the order described under [Offline lists](#offline-lists). What is ticked depends on the source language:

- A fixed source language: the directions the pair needs. For Japanese → Simplified Chinese these are the dictionary pack Japanese → Chinese when the release has it, otherwise Japanese → English and English → Chinese, and the Bergamot directions ja → en and en → zh-Hans, since every Bergamot model has English on one side.
- "Detect automatically": the directions of the recommended languages in both directions with English. A note explains the route: a message in another language goes into English with "language → English" and from there with "English → target language".

"Download selected" is disabled while nothing is ticked, and the line next to it then says "Tick the items to download first.". During the download it shows "Downloading N items…", at the end "Downloads finished." or the number of failed downloads. Each failed row shows its reason. The guide downloads two directions at a time.

### Demo and tour of the tiers

Step 3 plays a sample paragraph through the tiers in use, as a real message would show it. The paragraph is an English email sentence. The three results come from the interface language: a rough word-by-word translation for the dictionary, a correct but stiff one for machine translation and a natural one for AI translation. The English interface shows German results. The demo runs inside the page and sends no request.

The content script's renderer draws the demo in the current display mode and translation style:

1. A loading mark appears under the paragraph.
2. At once, the dictionary result appears.
3. After 0.3 s, the machine translation replaces it.
4. 1.5 s later, the AI translation replaces it.

Only the tiers in use take part, at the same times. Every result below the highest tier in use is provisional: it is in italics, slightly fainter, and carries a label with the name of its tier, such as "Machine translation", as in a translated message. The result of the highest tier is drawn as final. The line under the paragraph names the tier and service of the result shown, for example "Tier 3: AI translation · DeepSeek", and is announced by screen readers. When no tier has a service, the line says "At least one tier needs a service.".

The demo plays again from the start after every change of a tier selector and with "Replay". When the system asks for reduced motion (`prefers-reduced-motion: reduce`), the demo shows the final result at once, without the loading mark and the lower tiers. Leaving the step or closing the page stops the demo.

The first visit of step 3 starts a tour of the three tier selectors. A ring and a shade around the page mark one selector, and a tip under it explains the tier:

| Selector | Tip |
| --- | --- |
| Tier 1 | the fastest; a rough word-by-word translation from dictionaries, offline |
| Tier 2 | machine translation; free online services, or Bergamot offline |
| Tier 3 | AI translation; the best quality, and most services charge for it |

"Next" moves to the next selector, and on the last one "Close" ends the tour. Choosing a service in the marked selector also moves on. "Skip" ends the tour at once. The tip takes the keyboard focus when it opens: Enter moves on, Esc skips, and when the tour ends the focus goes back to where it was. Leaving the step also ends the tour; closing the tab while the tour is open does not, and the tour opens again on the next visit. Once ended, the tour does not open by itself again; the guide stores this in `storage.local` together with the step where it was left. The link "Show the tour of the tiers again" under the demo starts it again. With reduced motion the ring and the shade appear without a transition.

### Trial

"Translate the sample message" in step 8 renders a short email in the page and translates it with the current settings. The email is in the source language when that is English or German, otherwise in English, or in German when the target language is English. The page uses the paragraph detection and rendering of the content script and sends the requests to the background script over the same connection as a displayed message. The result therefore shows what a real message will look like, including the tiers in use.

## Popup

The "Translate message" button in the message header toolbar opens the popup.

- "Translate this message" starts translating. While a translation is running or shown, the button reads "Show original" and restores the original when clicked.
- "Retranslate" appears next to "Show original" while the message is translated, see [Retranslate and the cache](#retranslate-and-the-cache).
- Display switches between bilingual and translation-only. The change applies to the current message immediately.
- Source language and target language: after a change of either, a message being translated is translated again. A note appears when both are the same language.
- Translation tiers: one list per tier (1 dictionary, 2 machine translation, 3 AI translation), each with "Not used", the added services of that tier and, as last entry, "+ Add translation service…". That entry opens the settings page at the translation services of the tier and leaves the list at its value. At least one tier needs a service; choosing "Not used" for the last one is refused with a note.
- Precise translation is shown while the AI tier has a service.
- "Image translation" always shows its three modes, Off, Ask under each image and On, with a warning when the vision model does not accept images, see [Image translation](#image-translation). While precise translation is off, the modes are greyed out and cannot be chosen, and the note "Requires precise translation." follows them with the button "Turn on precise translation", which turns precise translation on with one click. Without a service in the AI tier the note says that precise translation needs a service in the "AI translation" tier, and there is no button.
- "Automatically translate messages not in the target language": when checked, a message whose body is not in the target language is translated as soon as it is opened.
- "Summary and to-dos" shows the summary of the message above it, see [Summary and to-dos](#summary-and-to-dos). It is disabled without an AI service for the summary.
- "Setup guide" opens the setup guide in a new tab.

The popup shows the progress, for example "Translated 8 of 12". Paragraphs that still show a provisional translation of a lower tier are counted separately, for example "Translated 7 of 9 (2 provisional)". When every tier fails for a paragraph, a red "Translation failed, click to retry" appears after it. Hovering shows the error, and clicking retries that paragraph.

Changing the display mode or the target language while a message is translated re-renders the page without reopening the message. In translation-only mode, hovering over a translation shows the original text in a tooltip.

The shortcuts Alt+A, Alt+S and Alt+R can be changed under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager, where the summary gets a shortcut of your choice. Alt+A pressed while the setup guide is the active tab translates or restores its sample message.

## Adding and removing services

The side list of the translation services section has two groups. "Added" holds the services that appear in the service lists of the popup and of the settings page. "Available to add" holds all others. Selecting a service shows its configuration and buttons:

- A service that is not added has an "Add" button. Typing an API key (for DeepLX, the endpoint) adds the service as well.
- An added service has "Use this service", which puts it into its tier, and "Remove". Removing takes the service out of the lists and keeps its configuration, so adding it again restores the key and the model.
- A service that a tier uses cannot be removed. The "Remove" button is then disabled and a line below it names the tier. Services in use carry an "In use" tag in the side list.

A fresh installation starts with Google Translate and Microsoft Translator added. The dictionary and Bergamot need data that you download, so they are added by hand.

Every service of the side list is a button, so the keyboard reaches it with Tab and selects it with Enter or Space; the focus stays on the selected service.

### Connection check of the free routes

The free routes of Google Translate and Microsoft Translator are blocked on some networks; Google Translate is not available in mainland China. When the settings page shows Google Translate (free) or Microsoft Translator (free) as an added service, or the setup guide shows it at its machine translation step, the page checks whether it answers, once per page and service, 0.6 seconds after the service was shown. The check sends the fixed sentence of "Test connection" to the target language, never the text of a message, so it asks for no consent; the service sees the IP address of the computer, as with any request. A line under the fields says "Reachable from this network (<n> ms)" or "Not reachable from this network" with the reason. When the request reached no server or got no answer in time, the reason names the services that work without the route: the other free route, the offline models and the dictionary, and with a key of your own DeepL, Baidu, Youdao and Caiyun; for Google it adds that the service is not available in mainland China. While Thunderbird is offline nothing is sent and the line says so. Microsoft Translator with an Azure key is not checked; its "Test connection" does that.

A translation of a message that fails in the same way on one of the two free routes carries the same names in its reason, which hovering over the failure marker shows.

## Translation tiers

| Tier | Services | What it gives |
| --- | --- | --- |
| 1 Dictionary | Dictionary (offline) | a word-by-word gloss from the installed dictionary packs, available at once and without network |
| 2 Machine translation | Google Translate, Microsoft Translator, DeepLX, DeepL API, Baidu Translate, Youdao, Caiyun, Bergamot (offline) | a full translation within a second or two |
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

## Consent before online translation

Before the text of a message first goes to an online service, the extension asks once per service and host: a service whose endpoint moves to another host asks again, also in a message already open. Each request is checked against the host it goes to when it leaves the queue, so a request made for the old host is not sent to it once only the new host is allowed. The panel records a service only for the host it named: a service whose endpoint changed while the panel was open is asked for again. Images have a consent of their own, see [Consent for images](#consent-for-images). The online services are Google Translate, Microsoft Translator, DeepLX, DeepL, Baidu, Youdao, Caiyun and every AI service; the dictionary and Bergamot translate on the computer and need no consent.

When a translation starts (the toolbar button, Alt+A, automatic translation, Retranslate) and a tier in use has an online service that is not allowed yet, a panel appears above the message instead of the translation:

- It names each such service with the host its requests go to, for example "Google Translate (free): translate.googleapis.com".
- It says that the paragraphs of the message go to these services, with precise translation also the whole message as context of the AI service, and that a saved API key goes only to its own service.
- "Allow and translate" records the services in the settings, each with the host the panel named, and translates the message. "Cancel" leaves the message as it is and sends nothing.
- Asked for the summary while the panel of the translation is open (or the other way round), the same panel lists the services of both and, when the summary is among them, says that the whole message goes to its service; one answer covers both, and only services the panel listed are recorded.

Until a service is allowed, no request reaches it: the background script refuses a request for it as well, also a request that already waits in its queue when the consent is revoked, and reports "<service> has not been allowed to receive message text yet. Translate the message again and choose “Allow and translate”.". A tier changed to a service not allowed yet, while a message is translated, makes the panel appear again.

The allowed services are listed in the Translation tiers section of the settings page, each with its host and "Revoke"; after a revocation the panel asks again, also in the message on screen, and the requests of the service still waiting in a queue are not sent. Settings saved before 3.0.0 hold the services alone; they count as allowed for the endpoint the service has when the settings are read. The sample message of the setup guide is built into the extension and is no mail of yours, so its trial translation asks nothing.

Settings of version 1.x hold no consent: after the update to 2.0 the first translation with an online service asks once.

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

The AI tier has three system prompts. Each can be edited on the settings page and restored with "Restore built-in prompt". The summary and image translation have a prompt each, in the same section, described under [Summary and to-dos](#summary-and-to-dos) and [The answer](#the-answer).

| Prompt | Used for | Built-in prompt asks for |
| --- | --- | --- |
| Bilingual display | the AI tier in bilingual mode | a translation close to the original, sentence by sentence in the same order, adding and dropping nothing, since the reader compares it with the original |
| Translation-only display | the AI tier in translation-only mode | fluent text that reads as an email written in the target language; clauses may be reordered and sentences split or joined, with the complete meaning kept |
| Precise translation | the AI tier while precise translation is on, in both display modes | consistent terms, names and forms of address across the message, using the glossary, the summary and the neighbouring paragraphs |

The settings store only prompts you changed. An unchanged prompt is stored as empty and stands for the built-in text, which the box shows, so a later version of the extension brings its improved built-in prompts to you. "Restore built-in prompt" and a box whose text equals the built-in prompt both store empty. Copies of a built-in prompt saved by earlier versions are recognised and cleared when the settings are read, and the settings are written back in this form at once.

`{{to}}` is replaced by the English name of the target language. The extension adds the source language and the batch format to every request itself.

The built-in prompts do not mention Markdown. The paragraphs reach the AI service as plain text: bold text and links of an HTML message arrive without their markup, so the only marks the model can carry over are those written in the text itself, and the rule "Keep line breaks and list markers" already covers them. An instruction naming Markdown syntax invites a model to add bold text where the original has none. [Markdown in AI translations](#markdown-in-ai-translations) describes what the extension renders from an answer.

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

If the analysis answer cannot be read, translation goes on without it, and the message is not analyzed again. If the analysis request fails (network error, timeout, HTTP error), translation also goes on without it, and the next batch of the same translation asks again. An analysis that waits in the queue is not sent once no page waits for any of the batches that asked for it, for example after you moved to the next message; the glossary for images only reuses an analysis and never asks for one.

The prefix is identical, character for character, for every request of one message, so providers that cache repeated prompt prefixes can serve it from their cache. For Anthropic the prefix is marked with `cacheControl: { type: "ephemeral" }`. Prompt caching is up to the provider: Anthropic caches only prefixes above a minimum length that depends on the model, and shorter prefixes are sent and billed normally.

The analysis is cached like translations. Its key contains the provider, model, source and target language, the hash of the request configuration (endpoint, prompt, thinking switch, temperature) and the hash of the message text. Batches of one message wait for the same analysis request.

Translations made in precise mode are cached under a key that contains the message hash, and batches never mix paragraphs of different messages. The same sentence in another message is therefore translated again, with that message as context. The analysis request and the longer prompts make precise translation more expensive than normal translation.

### Analysis and summary in one request

A message that needs an analysis and a summary would cost two requests that both carry the whole message. One request writes both when all of these hold:

- precise translation is on and the paragraphs to translate do not fit into one request, so the message needs an analysis;
- the summary uses the same AI service and the same model as the AI tier;
- that service is allowed to receive message text;
- a summary of the message is wanted, and its analysis is neither running nor cached.

The summary is wanted in two orders of events:

1. The summary is asked for first, by a click, the shortcut or [Automatic summary](#automatic-summary). The summary request starts the combined request, and the batches of the paragraphs wait for its analysis instead of asking for one of their own.
2. The analysis starts first, "Automatic summary" is not "Off", and no summary has been asked for that message yet. The background script then reads the sender, date and subject of the message through the tab of the content script and puts them into the request, as a summary request does.

The request carries the message and a system prompt with both tasks. The answer is one JSON object, `{"analysis": {...}, "digest": {...}}`, with the analysis first: an answer cut at the length limit then still holds the analysis whole. The length limit is the "Answer length limit (tokens)" of the summary plus 1500 tokens for the analysis; a model that reasons first gets the room for its reasoning on top, as a summary does.

Each part of the answer is read on its own:

| Part | Read | Not readable |
| --- | --- | --- |
| Analysis | cached under the key of the analysis, as if it came from a request of its own | translation goes on without it and does not ask for it again, as with an analysis of its own |
| Summary | kept under the key a summary request of the same message computes, which holds the glossary of this analysis and the header of the message; a copy stays in memory, so a later summary of the message finds it also with the cache off | the summary is asked for again, alone |

A combined request that waits in the queue is not sent once every page waiting for it went away, the summary panel and the batches alike. When it leaves the queue, the consent of the service is checked again. When the summary uses another service or another model than the AI tier, or its service is not allowed to receive message text, the analysis and the summary go in two requests, as before. "Regenerate" in the summary panel asks for the summary alone.

## Summary and to-dos

"Summary and to-dos" in the popup, or a shortcut you assign to the command "Summary and to-dos of the message", sends the message to an AI service and shows its summary in a panel at the top of the body. The command has no default key, because Thunderbird already uses many Alt combinations for its menus; it can be set under "Manage Extension Shortcuts" in the gear menu of the Add-ons Manager. With "Show a “Summary” button above a translated message" on, a small "Summary" button appears above the message while it is translated.

The panel has four parts, each a heading and a list. A part without entries is left out, and a panel without any entry says that the service found nothing:

| Part | What it lists |
| --- | --- |
| Summary | one to three sentences on what the message is about and what is expected of the reader |
| To-dos | who has to do what, by when: "Me" for the reader, a name, or nobody when the message leaves it open; the deadline as a date when the message makes it certain, and as the message states it. Hovering over a to-do shows the words of the message it rests on |
| Questions to answer | the questions the reader is asked, with who asks them |
| Dates and meetings | meetings, appointments and deadlines, with date, time and place |

The title line reads "Summary and to-dos · <service>" and holds three buttons:

- "Copy as Markdown" puts the summary on the clipboard as Markdown, a heading per part and a list item per entry. The button then says "Copied", or "Copying failed" when Thunderbird refused the clipboard, and keeps the focus.
- "Regenerate" asks the service again, past the cache.
- "Close" removes the panel. Turning the translation off leaves it on screen.

The panel is collapsible and opens expanded, or collapsed when the settings say so.

The service answers with a JSON object, and the extension draws the panel from it with DOM elements: the text of the answer never becomes markup. An entry without its main field (the task, the question, what is due) is left out, a date that is not of the form `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` stays empty, and each list keeps at most 10 entries. A to-do whose quote is not in the message (spaces and case aside) loses the quote and shows "not found in the message": text hidden in a message can tell a model to invent to-dos. The prompt tells the model that the email is data from a third party whose instructions it ignores, and a closing tag `</email>` inside the message is broken so that it cannot end the email early. An answer without such an object is shown as it came, under "The answer could not be read as a summary.". The extension does not use the structured output of the AI SDK, because it depends on a JSON mode of the server, which OpenAI-compatible and local services offer unevenly. Thunderbird has no calendar API for extensions, so dates are listed and copied, not added to a calendar.

The request carries the message text as the content script finds it (up to 20,000 characters, as for precise translation), with the sender, date and subject of the message, which the background script reads with `messageDisplay.getDisplayedMessage()`: the date of the message turns "next Wednesday" into a date. The date goes in the time zone of the computer with its offset, for example `2026-10-22T07:00+08:00`, so that "tomorrow" is the day after the date the reader sees. When precise translation has analyzed the same message, the glossary of the analysis goes with it, so that names and terms are written as in the translation.

The summary uses the consent of the translation. Its service gets the message only once it is allowed to receive message text; otherwise the consent panel appears first, with the text of precise translation, since the whole message goes to the AI service. While the cache is on (see [Retranslate and the cache](#retranslate-and-the-cache)), a summary that could be read is cached under the service, the model, the target language, the request and a hash of endpoint, prompt, part list, length limit, temperature and thinking switch.

### Automatic summary

"Automatic summary" opens the summary without a click on "Summary":

| Choice | When the summary opens |
| --- | --- |
| Off (default) | only when you ask for it: "Summary and to-dos" in the popup, the shortcut or the "Summary" button |
| When the message is translated | when a translation of the message starts, by itself through automatic translation or by your click |
| For every opened message | for every message on screen, also a message already in your language, which no translation starts for |

The summary opens by itself once per message, and not while its panel is already open. A message without readable text, for example one with only a picture or a date, gets no summary. When a translation starts, the content script asks for the summary right away, before the paragraphs leave, so that precise translation can write the analysis and the summary in one request ([Analysis and summary in one request](#analysis-and-summary-in-one-request)).

A summary that opens by itself asks for the consent of its service the first time, as a click on "Summary" does. "Cancel" holds for that message: the summary does not open by itself again while the message is on screen, and a click on "Summary" asks again. "For every opened message" costs one AI request for every message with text that you open.

### Summary settings

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Service | Same as the AI tier | the added AI services | without an AI tier and without a service of its own, the popup button is disabled |
| Model | empty | any model name | empty uses the model of the service |
| Answer length limit (tokens) | 800 | 200–4000 | the length of the summary, sent as `maxOutputTokens`; a model that reasons first (thinking on, or a model that reasons with thinking off, such as `gpt-5-mini`) gets 4096 more for its reasoning, which most services count within the limit; Anthropic's SDK adds it by itself. An answer cut at the limit fails with a message that names the limit |
| Panel | Expanded | Expanded, Collapsed | how the panel opens |
| Automatic summary | Off | Off, When the message is translated, For every opened message | see [Automatic summary](#automatic-summary) |
| Include | all four parts | Summary, To-dos, Questions to answer, Dates and meetings | the parts left out are asked as empty lists, which shortens the answer, and are not shown |
| Show a “Summary” button above a translated message | off | | a button on every message is in the way of readers who only want the translation |

The summary prompt is the fourth box of the Prompts section, with its own "Restore built-in prompt". `{{to}}` stands for the target language, in which the summary is written.

## Image translation

With precise translation on, an AI service can read the text in the images of a message. The result appears under each image as text: a table of the original and its translation. The extension draws nothing on an image and generates no image.

### Modes

"Image translation" has three modes:

| Mode | What happens |
| --- | --- |
| Off | nothing; no button appears under any image |
| Ask under each image (default) | a "Translate image text" button under every image that passes the filters below; a click sends that image only |
| On | when the translation starts, the images that pass the filters go to the service in the order of the message, up to "Images per message"; the images after them get the button. Copies of one image count once |

A mode takes effect only while the message is translated, with precise translation on (which needs a service in the AI tier) and with a vision model that is not known to refuse images ([providers.md](providers.md#image-translation)). An image whose result is in the cache shows the result at once, without a button, in both "Ask" and "On": showing it sends nothing and costs nothing. The buttons and results go when the translation is turned off.

"Ask" is the default for three reasons. Images often hold identity documents, contracts or screenshots of internal systems, so you decide per image. One image costs about as much as a dozen paragraphs of text. Most images of a mail are decoration, which "On" would pay for.

The popup always shows the three modes; the settings page has them under the switch of precise translation, and the setup guide on its AI step. While precise translation is off, the popup and the settings page show the modes greyed out with the note "Requires precise translation." and the button "Turn on precise translation", which turns it on with one click; on the settings page the note and the button stand above the image settings, which are greyed out as a whole. Without a service in the AI tier the note says that precise translation needs one in the "AI translation" tier, and the button is missing, since precise translation has nothing to work with. A new mode applies to the message on screen at once, as a new display mode does, without translating the paragraphs again:

- "Off" removes the buttons and results; the results stay in the cache.
- "Ask" shows the buttons, and the results this message already has.
- "On" shows those results and sends the other images.

Retranslate (Alt+R) forgets the image results of the message: "Ask" shows the buttons again, "On" sends the images again.

### Which images

| Source | In the message pane | Translated |
| --- | --- | --- |
| Inline images of the body (`cid:` references and `data:` addresses) | Thunderbird replaces a `cid:` reference with the address of the message part, with its part number in the parameter `part` | with "Translate inline images of the body", on by default |
| Image attachments | Thunderbird shows them under the body (`.moz-attached-image`) | with "Translate image attachments", on by default |
| Remote images (`http:`, `https:`) | blocked by Thunderbird unless you allow remote content for the message or its sender | once Thunderbird shows them, with "Translate inline images of the body" and the access to remote images, see [Remote images](#remote-images) |

The content script filters by the natural size of an image, not its displayed size, since mail templates often show large screenshots smaller:

| Rule | Default | Leaves out |
| --- | --- | --- |
| a side of 2 px or less | always | tracking pixels |
| the shorter side under "Shortest side (px)" | 100 px | icons, buttons, social media badges |
| the area under "Smallest area (px²)" | 40000 px² (200 × 200); 0 = no limit | small logos, avatars |
| the longer side over "Largest aspect ratio" times the shorter one | 8 | divider lines, banners |
| inside a signature (`.moz-signature`, `.moz-txt-sig`), with "Leave out images in signatures" | on | signature logos |
| not loaded yet | waits until it has loaded or failed | blocked or broken images; a remote one counts in the notice, see [Images left out](#images-left-out) |

The background script reads the bytes of an image that passes: an image of the body or an attachment with `messages.getAttachmentFile()` and the part number of its address, a `data:` image from its address, a remote image from the internet as described under [Remote images](#remote-images). It reads the parts of the message that was displayed when the content script of the message started, only while the tab still shows it, so a request of a message being replaced never reads the next one; a part whose file name differs from the one in its address, or that is not an image, counts as unreadable. Thunderbird 128 gives a part without `Content-Disposition`, such as an inline image of `multipart/related`, no file name; such a part is compared by its part number and type only. It then filters by the bytes:

| Rule | Default | Effect |
| --- | --- | --- |
| a file under "Smallest file (KB)" | 4 KB | left out: solid blocks, minimal icons |
| animated: a GIF with a second image, a WebP with the animation flag, a PNG with an `acTL` chunk (APNG), read from the content, not the name | "Leave out" | "Send the first frame" sends the first frame as a still image |
| more than 40 megapixels, from the header of the file (PNG, GIF, JPEG, WebP) or the natural size | always | "This image has more than 40 megapixels; it is not read.": nothing is decoded |
| the same image twice in one message (SHA-256 of the bytes) | | sent once; each copy shows the result |
| more images sent than "Images per message" | 5 | "This message has already sent 5 images, the limit per message." |
| more bytes sent than "Limit per message (MB)" | 6 MB | the image is not sent |

The two limits per message count what went out for the message on screen, whatever is drawn again meanwhile: a changed setting, the translation turned off and on. An image on its way when the images are drawn again is sent once. "Retranslate" counts again from zero, and what the earlier translation still waits for is not sent.

To find cached results and to apply these filters, the background script reads the images that pass the filters of the content script when a translation starts, in "Ask" mode too, up to twice "Images per message", two at a time; the images after them get their button at once and are read on a click. This happens on your computer; nothing is sent before a click or, in "On", before the consent.

### Remote images

A remote image takes part only when Thunderbird already shows it: the message may load remote content, because you clicked "Show remote content" in the bar above it or allowed its sender, and the image has loaded (`complete` with a natural width above 0). A remote image that Thunderbird blocks or fails to load is never requested by the extension. Whether a message may load remote content stays your decision in Thunderbird, and a blocked tracking pixel stays silent.

The content script cannot read the pixels of the image on screen. Gecko marks a canvas write-only as soon as an image of another origin is drawn on it, and the image in a message has the origin of its server. The background script therefore requests the image again:

- only at an http or https address without a user name or password, which an image (`src` or `srcset`) of the HTML of the message names; the background script reads that HTML with `messages.getFull()` on the computer, once per message, and checks that the tab still shows the message;
- without cookies and without a referrer, and with `cache: "force-cache"`, so that the HTTP cache of Thunderbird answers when it holds the image; otherwise the image server receives a second request, as when Thunderbird showed the image;
- with a timeout of 20 seconds and at most 15 MB: a larger Content-Length ends the request before anything is read, and the reading stops once the bytes pass the limit ("The image is larger than 15 MB and is not read.").

The bytes read to look up the cache are kept for the message until the image is sent, up to 16 MB per message, so an image is usually read once. Every other rule applies as for the other images: the filters on the bytes, the limits per message, the consent for images and the upload. The cache key is the SHA-256 of the bytes, so the same image at another address finds its result, and a changed image at the same address does not get an old one.

Reading remote images needs the access to remote images, the optional host permissions `http://*/*` and `https://*/*` of the manifest. Thunderbird grants a permission only from a click on a page of the extension, and asks you as "Access your data for all websites". Two places ask for it:

- the popup of the toolbar button, while the message on screen has remote images waiting for the access: "Remote images in this message: 3." with the button "Allow reading remote images";
- the settings page, under the image settings: a line that says whether the extension may read remote images, with "Allow reading remote images" or "Remove access".

Without the access, a remote image that passes the filters gets its button in both modes. Its click opens the popup with that line (the button under an image cannot ask for a permission itself); the settings page opens instead when the toolbar button is not in the toolbar. Once you allow the access, the images of the message are read again: "On" sends them within its limits, "Ask" shows the result of a cached image and sends the image whose button you clicked, after the consent panel if the service still needs it. The access also covers an endpoint you type for a service, which then needs no "Allow access" of its own. "Remove access", or removing the permission in the Add-ons Manager, ends the reading of remote images.

### Images left out

A notice above the message tells, once per message, what image translation leaves out and why:

| Line | Counts |
| --- | --- |
| "Remote images that can be translated once the extension may read them: 3." | remote images on screen that pass the filters while the access to remote images is missing; with the button "Allow reading remote images" |
| "Remote images not loaded: 2. Show the remote content of this message to translate their text." | remote images without pixels: blocked by Thunderbird, or failed to load; tracking pixels by their size attributes and images in a signature that the filter leaves out do not count |
| "Images whose address the extension cannot read: 1." | loaded images that pass the filters but come from neither the message nor the web, such as a `blob:` address |

The notice has a close button; once closed, it stays away for the message. It goes when the translation is turned off.

### Upload

The background page prepares each image before it is sent:

1. `createImageBitmap()` decodes the image, one image at a time; an animated image decodes to its first frame. An image that cannot be decoded (damaged, or a format such as TIFF) is left out with "This image cannot be read.".
2. An image whose longer side exceeds "Longest edge (px)" is scaled down to it, with `resizeQuality: "high"`.
3. The image is drawn on an `OffscreenCanvas`, for JPEG on a white ground, so transparent areas do not turn black.
4. `convertToBlob()` encodes it in the "Upload format" with the "Quality".
5. Above "Limit per image (KB)", the quality goes down to 0.7 and 0.55, then the size to 0.8 of the size before, up to three times. An image still above the limit is left out.
6. The images of one message together stay under "Limit per message (MB)".

Encoding the image again drops its file name and every metadata field, such as EXIF. The default longest edge, 1568 px, is the size Anthropic's standard resolution takes without scaling again; it stays under the limits of OpenAI and DeepSeek, and the body text of a mail screenshot stays legible at that size. JPEG is the default format because every service takes it; xAI and Zhipu take no WebP, and for them a WebP choice is sent as JPEG.

Each request carries one image. Image requests go through a request queue of their own per service, with "Concurrent requests" (2 by default) apart from the text, so slow image requests do not hold back the paragraphs. A 429 or 5xx answer is retried with the backoff of the other requests; a request that timed out is not retried, since every attempt is charged. The thinking mode is always off for images: reading text needs no reasoning, and reasoning tokens are charged as output.

### The answer

The image prompt (fifth box of the Prompts section, with "Restore built-in prompt") tells the model to sort the image into one of three kinds:

| Kind | Examples | Answer |
| --- | --- | --- |
| Chart | line and bar charts, flow diagrams | the title, axis titles, units, legend and series names, each with its translation; no trends, values or comparisons, which you read off the chart |
| Text | screenshots, scans, posters, slides, tables, receipts | every legible line in reading order with its translation; a table keeps its rows and columns |
| Other | photos, illustrations, decorations | nothing by default; one sentence with "Images without text: Describe in one sentence" |

Text the model cannot read with confidence is written as `[?]`; names, numbers, dates, addresses and codes stay unchanged. The extension adds the rules of the "Answer" setting after the prompt, so changing the answer keeps a prompt of your own:

| Answer | Rule added |
| --- | --- |
| Original and translation, with "Show the recognized original" | a table with the header "Original" and "Translation", one row per label, line or cell |
| Original and translation, without it | a list of the translations |
| Short summary | one or two sentences on what the image contains; of a chart only what its axes and series measure. At most 200 tokens are asked for |
| Both | a line "**Summary:**", then the table |

The text beside the image is "Image <n> of the email. Target language: <language>.". With "Use the message context" on and an analysis of the message by precise translation, its glossary follows, so that names in the image are written as in the translation. The glossary holds words of the message, so it goes only to the service of the AI tier or to a vision service allowed to receive message text; the consent panel then says that it goes along. No analysis is made for the images alone, and the whole message is not sent with them.

The result is a collapsible block after the image (after the container of an attachment, after the paragraph or link that holds the image); in a table cell, a list item or a caption it becomes their last child, so the table or the list keeps its layout. Its title reads "Image text · <service>" with the input and output tokens of the request while "Show the tokens of each image" is on, or "cached". It opens expanded, or collapsed with "Result: Collapsed"; changing this or the tokens switch draws the results again in place, without a request. The table shows its header in the interface language. An answer that reached "Answer length limit (tokens)" ends with a note that it may be incomplete. An image without text, after a click, shows "This image has no text to translate." for three seconds; in "On" it shows nothing.

The result is always rendered as Markdown with tables ([Markdown in AI translations](#markdown-in-ai-translations)), whatever the switch of AI translations says: a table is unreadable as its characters. Both display modes leave the image as it is; the result does not change with the display mode. In translation-only mode, an image that sits inside a paragraph stays as a copy after the translation of that paragraph.

### Consent for images

Images are allowed apart from the text of messages, per service, in `Settings.imageConsent`: a service allowed to receive message text is not allowed to receive images. Before the first image goes to a service, a panel appears in the place of the result, under the clicked image, or in "On" under the first image to be sent, which holds back the whole batch and says how many images it sends ("Send 3 images of this message to <service>?"). It names:

- what is sent: the image, scaled to at most the longest edge and encoded again as JPEG (or the format in use), without its file name and metadata, and the glossary of the message when it goes along;
- where to: the service and the host of its endpoint;
- the data policy of the service, for the services checked: Anthropic states that it does not train its models on images sent through its API; on the free tier of the Gemini API, Google may have people review the input and use it to improve its products; OpenAI does not train on API data by default and keeps abuse monitoring logs for up to 30 days. For any other service: it handles the image under its own privacy policy.

"Allow and translate image" records the service with its host and sends the image; "Cancel" sends nothing and brings the button back. The background script checks the consent again when an image request arrives and when it leaves the queue, together with the mode and the vision service of the settings, and refuses one without it: an image that waits in the queue is not sent once the consent is revoked, image translation is turned off or the content script went away. A consent revoked while the message is on screen, or "Ask again for every message" turned on, makes the panel ask again. With "Ask again for every message" on, the panel asks before the first image of every message and records nothing. The Translation tiers section of the settings page lists the services allowed to receive text and those allowed to receive images in two columns, each with "Revoke".

### Cache of images

While the cache is on, a result is cached under the service, the vision model, the target language, the SHA-256 of the original bytes, and a hash of the endpoint, the system prompt with its rules, the answer, images without text, "Show the recognized original", the longest edge, the format, the quality, the detail, the answer length and the temperature. With "Use the message context" on, the message is part of the key too, as for precise translation: the same image in another message is read again with that message's glossary. With it off, one result serves the image in every message. Results share the cache and its limit with the translations.

### Image settings

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Image translation | Ask under each image | Off, Ask under each image, On | see [Modes](#modes); greyed out with "Requires precise translation." and "Turn on precise translation" while precise translation is off, its value kept |
| Vision service | Same as the AI tier | the added AI services | another service needs its own consent and access to its endpoint |
| Model | empty | any model name | empty uses the model of the service; the line under it names a model that does not accept images, with one that does |
| Translate inline images of the body | on | | `cid:` and `data:` images |
| Translate image attachments | on | | remote images are not translated |
| Images per message | 5 | 1–20 | "On" sends the first ones; a click after them says the limit is reached |
| Shortest side (px) | 100 | 16–1000 | of the natural size |
| Smallest area (px²) | 40000 | 0–4000000 | 0 = no limit |
| Largest aspect ratio | 8 | 2–30 | longer and narrower images count as dividers |
| Smallest file (KB) | 4 | 0–200 | of the original bytes |
| Leave out images in signatures | on | | |
| Animated images | Leave out | Leave out, Send the first frame | |
| Longest edge (px) | 1568 | 512–2576 | |
| Upload format | JPEG | JPEG, WebP, PNG | JPEG for a service that does not take the format |
| Quality | 0.85 | 0.5–0.95 | JPEG and WebP |
| Limit per image (KB) | 1500 | 200–8000 | above it: lower quality, then a smaller size |
| Limit per message (MB) | 6 | 1–30 | all uploads of one message |
| Image detail | Automatic (not sent) | Automatic, Low, High | sent to OpenAI and DeepSeek only, see [providers.md](providers.md#image-translation) |
| Answer | Original and translation | Original and translation, Short summary, Both | |
| Images without text | Show nothing | Show nothing, Describe in one sentence | |
| Show the recognized original | on | | off: a list of the translations |
| Use the message context | on | | the glossary of precise translation goes with each image |
| Answer length limit (tokens) | 1024 | 128–4096 | sent as `maxOutputTokens`; at most 200 for a short summary |
| Request timeout (seconds) | 90 | 10–600 | three times as long for Ollama and LM Studio |
| Concurrent requests | 2 | 1–6 | image requests at once, in their own queue |
| Result | Expanded | Expanded, Collapsed | |
| Show the tokens of each image | on | | in the title of a result |
| Ask again for every message | off | | asks before the first image of every message |

The mode, the vision service and model, the estimate and "Test image" sit under the switch of precise translation; the other settings are in the collapsed "Advanced image settings".

The answer defaults to the table because you want to read the text in the image, and the table gives it directly; a summary repeats what you see, and "Both" costs about a fifth more output. Images without text are skipped because a description neither helps to understand the mail nor comes free. 1024 tokens cover a screenshot (about 600 tokens of table) and an A4 scan full of text (about 1000), and stop a model that does not end.

### Estimate and test image

Under the model, a line estimates the tokens of one image of 1024 × 768 pixels with the formula the service publishes for the model, and the tokens of the prompts from their length (about 4 characters per token). It names no price, since prices change often, and links to the price page of OpenAI, Anthropic and Gemini. For a model without a known formula it gives the tokens of the prompts only.

"Test image" sends a test image the extension draws itself, "TEST 42" in black on white at 160 × 48 pixels, with the configuration on the page, saved or not, and the image prompt. The test passes when the answer contains 42. It needs access to the endpoint of the service, which the click asks for first.

## Request batching and timeouts

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Collection window (ms) | 50 | 0–2000 | how long paragraphs of one group accumulate before a batch is sent |
| Max characters per request | 3000 | 200–50000 | a batch is sent before the next paragraph would exceed it; longer paragraphs are split |
| Max paragraphs per request | 30 | 1–200 | a batch is sent when it holds this many paragraphs |
| Concurrent requests | 4 | 1–20 | concurrent requests per service |
| Retries (429 / 5xx / network / timeout) | 3 | 0–10 | retries with exponential backoff; a timeout is retried at most once, and an AI request that timed out is not retried |
| Request timeout (seconds) | 60 | 5–600 | time for the complete answer; three times as long for Ollama, LM Studio and any model with thinking mode on |
| Merge paragraphs into one AI request | on | | off sends one paragraph per AI request |

The services other than AI cap a request regardless of these values; a request takes the smaller of the setting and the cap:

| Service | Paragraphs per request | Characters per request |
| --- | --- | --- |
| Dictionary | 100 | 50000 |
| Bergamot | 100 | 5000 |
| Google Translate | 100 | 5000 |
| Microsoft Translator, free | 100 | 5000 |
| Microsoft Translator, Azure key | 1000 | 50000 |
| DeepLX | 50 (sent one paragraph per request) | 5000 |
| DeepL API | 50 | 30000 |
| Baidu Translate, standard edition | 50 | 950, and at most one request per second |
| Baidu Translate, advanced and premium edition | 50 | 5950, and at most 10 requests per second in the advanced edition |
| Youdao | 50 | 5000 |
| Caiyun | 40 | 5000 |

The AI services follow the settings alone.

A request that gets no complete answer within the timeout counts as failed. The services other than AI retry it once, within the number of retries. An AI request is not retried after a timeout: a model that was too slow once is usually too slow again, and every attempt is charged. Other failures (HTTP 429, 5xx, network errors) are retried with exponential backoff up to the number of retries, for AI services too. A server that asks with `Retry-After` for a wait of up to 30 seconds gets it; one that asks for longer, as a spent daily quota does, fails at once with its status and message. An endpoint that is no `http://` or `https://` address, such as `localhost:1188/translate`, fails at once with "the endpoint is not a valid URL", without retries.

The fields of this section and the other counts and sizes of the settings page take whole numbers: a fraction is rounded when it is entered and when the settings are read. Only the quality, the aspect ratio and the megabytes of image translation keep a fraction.

A paragraph that no tier answered, for example because the background script could not read its settings, fails with a retry marker instead of loading for ever. After a change of a key, an app ID, a region or an edition, the tiers that failed on the message on screen are asked again; the other tiers keep their results. When the source language is "auto", Baidu gets the paragraphs of each language the extension detects in a request of their own, since Baidu detects one language for a whole request.

A translation that runs when its content script goes away (another message is shown, the tab is closed) is dropped before its request goes out, unless another page waits for the same paragraph.

[batching.md](batching.md) describes the batch queue, how each service merges paragraphs, what happens after a timeout, and the cost estimate.

## Offline services

The dictionary and Bergamot translate on your computer. Their data is downloaded once and stored in the IndexedDB of the extension.

The dictionary translates word by word with dictionary packs from a GitHub release of this repository, by default `dicts-v1`. The release tag can be changed under "Release tag of the dictionary packs (advanced)" in the Dictionaries section. The packs cover English, Simplified and Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Turkish and Vietnamese; between two languages other than English the text goes through English. The result is a gloss: words in the source order, without grammar or inflection, and words outside the packs stay untranslated. Download, verification and lookup are described in [dictionary-packs.md](dictionary-packs.md#扩展中的下载与查词).

Bergamot translates with the engine and the models of Firefox Translations, published by Mozilla under MPL-2.0. The engine ships with the extension. Each translation direction is downloaded once from Mozilla, 13 to 48 MB. The catalog has 114 direction pairs among 58 languages, and every model has English on one side, so Japanese to Chinese uses Japanese → English and English → Chinese. A loaded direction takes about 200 MB of memory and is released after five minutes without use. An installed pair with a newer version offered by Mozilla shows "Update". Deleting a pair that the current languages need asks for confirmation. [bergamot.md](bergamot.md) describes model selection, verification, storage and the engine.

Both lists fail after 30 seconds without an answer. A download that receives no data for 30 seconds stops with an error; a slow download that keeps receiving data has no time limit. If a list cannot be loaded, the section says why, and installed packs and models can still be deleted.

The background script downloads, checks and stores the packs and models, and the pages only ask for them. A download therefore goes on when the settings page or the setup guide is closed, and translations use a pack or model as soon as it is stored. Every open page shows the progress of every download, also of those another page started, and a page opened later shows the downloads that are still running or waiting. Each of these pages can cancel a download.

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

"Download common languages" in both lists downloads the directions to and from English of eight fixed languages: Simplified Chinese, Spanish, French, German, Japanese, Portuguese, Russian and Korean, as far as the catalog has them. Before downloading it lists the directions and their total size; installed directions and directions already queued or downloading are left out. When all are installed, the button is disabled and says "The common languages are all installed.".

The background script downloads two directions of each service at a time and keeps the others in its queue, also after the page that asked for them is closed. A direction waiting for its turn reads "Waiting…" and has a "Cancel" that takes it off the queue; it offers no second "Download", and in the setup guide its check box is disabled. A running download shows its progress and also has "Cancel". A direction that two pages ask for is downloaded once.

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
- The notice about missing offline data keeps its once-per-message rule: a notice still on screen appears again once the new round has finished, if data is still missing, and a closed notice stays away.
- Translations of other messages stay in the cache.

"Show original" followed by "Translate this message" translates from what the page remembers and sends no request.

The Cache section turns the cache on or off (on by default), sets the maximum number of cached paragraphs (5000 by default, 0–100000), shows the current number of entries and clears the cache. The cache is stored in `storage.local` of the Thunderbird profile and evicts the least recently used entries. Every write stores the whole list, so it goes to storage 5 seconds after a new result and then at most every 30 seconds while results keep coming, and once more after the last one.

## Translation style

The Translation style section sets how translations look in the message:

- Style: left border (default), dashed left border, highlight or plain.
- Accent color: `#4c8bf5` by default. It colors the border or the highlight.
- Text color: the color of the translated text. By default the translation keeps the color of the message text, and the field shows the color of the page text next to "Same as the message text". Picking a color applies it to every translation; "Restore default" returns to the color of the message. A provisional translation keeps its italics, fainter text and label in any text color.
- Text opacity: 0.85 by default, 0.3–1.
- Font size ratio: 1 by default, 0.7–1.5.

A live preview shows a sample paragraph with its translation. The bilingual block stays readable in dark themes.

## Markdown in AI translations

AI services often format their answers in Markdown: `**important**` for bold text, `- ` in front of the items of a list, `[text](address)` for a link. With "Render Markdown in AI translations" on (the default, in the Translation style section of the settings page), a translation of the AI tier shows this markup formatted. With the switch off, every translation shows the text exactly as the service returned it, as in version 2.1.

Only the final translation of the AI tier is rendered. The dictionary and machine translation return the characters of the original: an asterisk in the message that Google Translate keeps stays an asterisk, and `snake_case` in a translation by Bergamot stays as it is. A provisional translation comes from a lower tier and is therefore text too, and so is a lower result kept after the AI tier failed. This holds in both display modes and for precise translation.

The renderer reads this subset:

| Markup | Shown as |
| --- | --- |
| `**text**`, `__text__` | bold |
| `*text*`, `_text_` | italics |
| `` `text` `` | code; markup inside it is not read |
| `~~text~~` | struck through |
| `[text](https://…)` | a link, for addresses that start with `http:`, `https:` or `mailto:` |
| consecutive lines starting with `- `, `* ` or `+ ` | a bulleted list |
| consecutive lines starting with `1. `, `2. `… | a numbered list, starting at the first number |
| a single line break | a line break |
| a backslash before ASCII punctuation, such as `\*` | the character itself |

The asterisks, underscores and tildes open and close by the delimiter rules of CommonMark, with Unicode whitespace and Unicode punctuation. Some consequences:

- `这是**重要**的` shows 重要 in bold: Chinese, Japanese and Korean need no spaces around the marks.
- `snake_case` and `file_name.txt` stay as they are, since an underscore between two letters never opens or closes.
- `请**注意：**明天` stays as it is: after the full-width colon, a punctuation mark, the closing marks would need a space or another punctuation mark after them. `请**注意：** 明天` is bold.
- One rule goes beyond CommonMark: an asterisk with an ASCII letter or digit right before and right after it neither opens nor closes, so `2*3*4` stays arithmetic.
- A numbered list that follows a line of text without a blank line starts only at 1, so a line such as "3. October" inside a paragraph stays text.

Headings, tables, images, block quotes and HTML are not read; their characters stay in the translation, and so do unclosed or invalid marks such as a single `**`.

The answers about images ([Image translation](#image-translation)) are read with three more kinds of block:

- GFM pipe tables: a header row, a delimiter row of as many cells (`---`, `:--`, `:-:`, `--:`), then rows up to a blank line or a line without `|`. A row with fewer cells gets empty ones, a row with more loses the rest, and `\|` is a pipe inside a cell, whose content is read as inline markup. Alignment becomes the class `tt-align-center` or `tt-align-right`. A table has at most 20 columns and 300 rows: a header with more columns stays text, and rows after the 300th follow as text.
- A blank line ends a block: the lines of text between two blank lines, lists or tables become a paragraph, and the blank line itself adds no line break.
- A heading line (`#` to `######` and a space) becomes a paragraph of bold text. A heading element would break into the headings of the message around the answer and the outline screen readers navigate by.

These answers add the elements `p`, `table`, `thead`, `tbody`, `tr`, `th` and `td`, created the same way. Reading them still takes time proportional to the length: every line is split into cells at most twice, once as a possible header row and once as a possible delimiter row.

The rendered translation consists of text and these elements only: `strong`, `em`, `code`, `del`, `a`, `ul`, `ol` (with `start` for a list that does not start at 1), `li` and `br`. The extension creates each element with the DOM API and never parses the text of a translation as HTML, so `<script>` or `<img onerror=…>` in a translation stays visible text. A link carries only its address and `rel="noopener noreferrer"`. A link to any other address, such as `javascript:`, `data:` or a relative path, stays as its whole source text, and so does an image. The same holds for an address with a user name or password before the host (`https://bank.example@evil.example/` shows one host and leads to another), for a destination longer than 2048 characters, and for a destination whose parentheses nest deeper than 32 levels. Elements nest at most 16 levels deep; deeper markup keeps its text without the elements.

Thunderbird handles a click on such a link like a click on any other link in a message; the extension adds no handler of its own. In the message pane Thunderbird's link handler (`StrictLinkClickHandlerChild` for browsers of the group `mail-message`) stops the navigation of an `http:` or `https:` link and opens it in the default web browser, after the phishing check that asks when the text of a link names another host than its address. A `mailto:` link opens a new message to that address, since Thunderbird handles `mailto:` itself.

The rendered elements sit inside the translation block, so the style of the translations applies to them: text color, opacity and font size ratio. A link takes the text color of the translations when one is set, otherwise the link color of the system, and stays underlined; code uses a monospace font at 92 % of the translation's size.

The cache and the memory of the page keep each translation as the service returned it; the renderer formats it when it is shown. Turning the switch on or off therefore redraws the message on screen at once and sends no request, and the switch is part of no cache key.

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

Settings saved before version 1.9.0 have no text color; translations keep the color of the message text, as before. A text color that is not a hex color such as `#202124` is ignored in the same way.

Settings saved before version 2.2.0 have no switch for the Markdown of AI translations; it is on.

Settings saved before version 2.3.0 have no summary settings and no summary prompt: the summary uses the AI tier with the defaults of [Summary and to-dos](#summary-and-to-dos) and the built-in prompt. They have no app ID, Baidu edition or DeepL options either: Baidu starts as the standard edition, DeepL with default formality, American English and Brazilian Portuguese.

Settings saved before version 3.0.0 have no automatic summary: it starts as "Off". The setting "Translate the subject as well" of earlier versions is dropped when 3.0 reads the settings, and the settings are written back without it at once; every other setting keeps its value.

Settings saved before version 3.0.0 have no image settings, no image prompt and no service allowed to receive images: image translation starts in mode "Ask under each image" with the defaults of [Image settings](#image-settings), which takes effect once precise translation is on, and the first image asks before it is sent. A service in the list of services allowed for images that is not an online AI service is dropped when the settings are read.

## Permissions

| Permission | What the extension uses it for |
| --- | --- |
| `messagesModify` | showing translations inside the displayed message: Thunderbird runs the content script of `messageDisplayScripts` and injects it into a message already on screen only with this permission. The extension changes no stored message. |
| `messagesRead` | reading the header of the displayed message with `messageDisplay.getDisplayedMessage()`: its sender, date and subject go with the request of its summary. The extension reads no message body this way and stores no header. Image translation reads the id of the displayed message and, with `messages.getAttachmentFile()`, the image parts of that message whose images pass the filters of [Which images](#which-images): inline images of the body and image attachments, never another attachment. For a remote image it reads the HTML of that message with `messages.getFull()`, to check that the message names the address of the image. |
| `sensitiveDataUpload` | sending the paragraphs of a message to the online services of the tiers in use, the message to the AI service of its summary, and the images you ask to translate, or that mode "On" takes, to the vision service |
| `storage` | the settings, the translation cache and the state of the setup guide in `storage.local` |
| `unlimitedStorage` | the dictionary packs and Bergamot models in IndexedDB, 13 to 48 MB per direction, which the browser then neither evicts nor caps |
| host permissions | the fixed addresses the extension connects to, listed in `src/shared/hosts.ts`: Google Translate, both Microsoft Translator addresses, both DeepL addresses (free and Pro keys), Baidu Translate, Youdao, Caiyun, the default endpoint of every AI preset, Mozilla Remote Settings with its attachment CDN, and the GitHub releases with the two hosts GitHub redirects downloads to |

An address you type needs your permission once: the endpoint of Ollama, LM Studio, DeepLX, Azure OpenAI, a custom OpenAI-compatible service or Azure Translator, and a changed endpoint of any preset. The manifest declares these as optional host permissions (`http://*/*`, `https://*/*`), and the extension asks only for the host of the endpoint:

- While the permission is missing, a line under the endpoint field reads "The extension may not connect to <host> yet." with an "Allow access" button. Thunderbird then shows its own prompt.
- "Test connection" asks for the permission first, so testing a new endpoint grants it in one step.
- The permission covers the host with every port and path. The line disappears once it is granted, also when it was granted on another page.
- A translation through a service without the permission sends nothing and fails with "The extension may not connect to <host> yet. Open this service in the settings and click “Allow access”."
- The permissions granted this way are listed in the Add-ons Manager under the extension's permissions and can be removed there.

The same optional host permissions, both patterns at once, are the access to remote images of image translation, see [Remote images](#remote-images). The popup and the settings page ask for them only from a click on "Allow reading remote images", and the settings page removes them with "Remove access". While they are granted, every endpoint you type is allowed without a line of its own.

The endpoint field of a local service notes that `localhost` is this computer (the loopback address): requests to it do not leave the computer. Ollama and LM Studio use such an address by default.

## Privacy details

- API keys are stored only in `storage.local` of the current Thunderbird profile and are sent only with requests to the endpoint of the matching provider.
- The content script runs inside the message page. The settings it receives from the background script contain neither keys nor endpoints, since an endpoint can hold a token.
- Error messages mask what may be a secret, and the masked parts read `***`:
  - the API key or token of the service, wherever it appears;
  - URL path segments that look like a token (20 or more characters with letters and digits);
  - user names and passwords in URLs;
  - URL parameters whose names contain key, token, auth, secret, sig, pass, credential or session.
- Message text is sent only to the services of the tiers in use and, when you ask for a summary or "Automatic summary" opens one, to the AI service of the summary, and to an online service only after you allowed it, see [Consent before online translation](#consent-before-online-translation). The subject goes along only with the request of a summary, together with the sender and the date. The dictionary and Bergamot translate on your computer and send no text anywhere.
- An image goes to the vision service only with precise translation on, after a click on its button or, in mode "On", by itself, and only once the service is allowed to receive images, see [Consent for images](#consent-for-images). It goes scaled down and encoded again, without its file name and metadata. Remote images that Thunderbird does not show, and images under the filters of [Which images](#which-images), are never sent; images in signatures are left out by default, a filter the settings can turn off. To look up cached results, the first images that pass the filters are read on the computer when a translation starts.
- The extension connects only to the hosts of its manifest, to the endpoints you allowed, and, with the access to remote images, to the addresses of the remote images Thunderbird shows, see [Permissions](#permissions).
- The settings page and the setup guide send the fixed test sentence of "Test connection" to Google Translate (free) and Microsoft Translator (free) when they show the service as added, once per page, to tell whether it can be reached ([Connection check of the free routes](#connection-check-of-the-free-routes)). No message text goes with it; the service sees the IP address of the computer.
- Two lists come from the network, without any message text: the list of dictionary packs from this repository's GitHub releases and the list of Bergamot models from Mozilla. The background script reads them and keeps the copy it read; the settings page and the setup guide show the offline lists from that copy.
- The background script reads a list when a page shows it and, while the dictionary or Bergamot is the service of a tier, when Thunderbird starts, when the settings change, and when the popup or the settings page asks what is missing. It reads either list again once the copy in memory is older than 6 hours (the dictionary list per release tag). After a failed read, either list is read again 10 minutes later at the earliest; until then it answers with the copy in memory, and the Bergamot list also with the copy saved by an earlier session, if there is one. "Reload list" in either offline section of the settings page reads its list at once. Translating a message reads neither list, also when a pack or model is missing.
- The packs and models themselves are downloaded only when you click "Download" or one of the download buttons. The extension collects no statistics and contacts no other network address.
- The translation cache is stored locally and can be turned off or cleared on the settings page.

## Known limitations

- Links, bold text and other inline formatting of the original are not carried into the translation. Bold text, lists and links appear in a translation only when an AI service writes them as Markdown, see [Markdown in AI translations](#markdown-in-ai-translations); translations of the dictionary and of machine translation, and provisional translations, are plain text. In bilingual mode the original stays fully usable; in translation-only mode you can hover to see the original or switch back to bilingual.
- The free Google and Microsoft endpoints are undocumented and may change or be rate-limited.
- Language detection of Latin-script languages other than English depends on `i18n.detectLanguage`, see [Source language](#source-language).
- The content script is registered through `messageDisplayScripts` and reaches only messages opened after registration. On startup the extension tries to inject it into messages already open; if that fails, selecting the message again is enough.
- Error texts returned by a service are shown as received, usually in English.
- The extension name, its description in the Add-ons Manager and the shortcut descriptions follow Thunderbird's interface language, not the interface language option.
- Precise translation identifies a message by a hash of its body text. Two copies of the same text share their translations and their analysis.
- Prompt caching is up to the provider, see [Precise translation](#precise-translation).
- The thinking switch works by matching model names, see [providers.md](providers.md#thinking-mode). So does the line that says whether a vision model accepts images, see [providers.md](providers.md#image-translation); a model it does not know is sent images, and "Test image" tells whether it reads them.
- Remote images are not translated, see [Which images](#which-images).
- "Image detail" reaches OpenAI and DeepSeek only. The AI SDK puts the options of an OpenAI-compatible service beside the image part instead of into it, so Doubao and SiliconFlow, which read a detail, get none.
- Image translation takes the part number in the address of an image as the part name of `messages.getAttachmentFile()`. A part that does not turn out to be an image is reported as unreadable.
- Every tier in use sends its own requests. With the AI tier and the machine tier both in use, each message also costs requests to the machine translator.
- Dictionary translation is a word-by-word gloss: it keeps the word order of the source and does not inflect. Words outside the packs stay untranslated.
- The sample message of the setup guide exists in English and in German only, see [Trial](#trial). With a fixed source language other than these two, the message is in English (in German when the target language is English), and the trial still sends the fixed source language with it.
- Alt+A pressed while the setup guide is the active tab translates or restores the sample message; the label of the trial button then does not follow.
- With automatic detection, the dictionary and Bergamot ask the browser's detector only from 12 letters on. A shorter paragraph is named by its script (kana, Hangul, Chinese characters…) or, in Latin script, by English stop words. A short Latin-script paragraph that is not English therefore cannot be placed: Bergamot gives it the most frequent language of its batch, else English, and the dictionary treats it as English. A short paragraph in another language than its neighbours is then translated as theirs, and its error names no data to download.
- Simplified and Traditional Chinese are told apart by a table of 83 frequent characters. A paragraph that uses none of them counts as already in either Chinese target.
- The dictionary and Bergamot do not convert between Simplified and Traditional Chinese. With one of them as the only tier in use, a paragraph in the other standard stays untranslated.
