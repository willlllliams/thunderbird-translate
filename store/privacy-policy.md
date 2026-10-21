# Privacy policy

The text below, from "Multi Translate for Thunderbird: privacy policy" to the end, goes into the privacy policy field of the listing on addons.thunderbird.net. A Simplified Chinese version is in [privacy-policy.zh-CN.md](privacy-policy.zh-CN.md).

---

## Multi Translate for Thunderbird: privacy policy

Multi Translate for Thunderbird translates the messages you read in Thunderbird. It has no server of its own: its developer receives no data from it, and it collects no statistics, usage data or crash reports and has no accounts.

### What is sent, and to whom

The extension sends message text only when you translate a message or change a setting that changes a translation (the display mode, the languages, the services): with the buttons of the popup, the keyboard shortcuts Alt+A, Alt+S and Alt+R, or automatic translation if you turned it on. It then sends the text of the message's paragraphs, and its subject while "Translate the subject as well" is on (the default), to the services of the translation tiers you chose. The page of translated subjects, which the "Translated subjects" button of the main toolbar opens, sends the subjects of the messages it lists, up to 100 at first and 100 more with "Show more", to the same services:

| Service | Where the text goes |
| --- | --- |
| Google Translate | translate.googleapis.com |
| Microsoft Translator | edge.microsoft.com, or with your own Azure Translator key the endpoint of your Azure resource (api.cognitive.microsofttranslator.com by default) |
| DeepLX | the DeepLX server whose address you entered |
| DeepL API | api.deepl.com, or api-free.deepl.com for a key of DeepL's free plan, or the address you entered |
| Baidu Translate | fanyi-api.baidu.com |
| Youdao | openapi.youdao.com |
| Caiyun | api.interpreter.caiyunai.com |
| An AI service (OpenAI, Anthropic, Google Gemini, DeepSeek and the other presets) | the endpoint of that service shown in the settings, or the address you entered |

With precise translation turned on, the AI service also receives the text of the whole message (up to 20,000 characters) as context, and for a long message one extra request that asks for an analysis of it (summary, glossary of names and terms, tone).

When you ask for the summary and to-dos of a message, with the button "Summary and to-dos" of the popup, a keyboard shortcut you assigned yourself or the "Summary" button above a translated message if you turned it on, the AI service of the summary receives the text of the whole message (up to 20,000 characters) together with its sender, date and subject, so that it can name who has to do what and turn "next Wednesday" into a date. With precise translation on, the request also carries the glossary of the analysis described above. Nothing is sent for a summary unless you ask for one.

Together with the text, a service receives the source and target language, and the settings of the request that belong to it: for an AI service the model, the prompt, the temperature and the thinking switch; for Baidu and Youdao your app ID and a signature computed from your key, which itself is not sent; for DeepL the formality and the variant of English or Portuguese. An API key you saved is sent only to its own service. The recipients and attachments of a message are never sent; its sender and date only with a summary, and its subject only as described above. Each service handles the text under its own privacy policy.

### What the extension reads in Thunderbird

To translate subjects the extension reads the subject of the message on screen, for a summary also its sender and date, and on the page of translated subjects the sender, date and subject of the messages listed in the mail tab (the permission "Read your email messages", `messagesRead`). The page also selects the message of a row you click and notices when the mail tab shows another folder, which Thunderbird allows only with the permission "See your mail accounts and their folders" (`accountsRead`). The extension reads no account settings and stores none of this; only the subjects it translates, and the sender and date of a message you summarize, leave your computer, as described above.

### Your consent

Before the text of a message first goes to an online service, a panel above the message names the service and the address its requests go to, and says what is sent. The page of translated subjects shows the same panel above its list before subjects first go to an online service. Nothing is sent to that service until you click "Allow and translate". A summary uses the same consent: before its AI service first receives a message, the same panel appears. The extension asks once per service and records your answer in its settings. The settings page lists the services you allowed, and "Revoke" takes the consent back, after which the panel asks again.

The extension connects only to the addresses listed in its manifest. An address you type yourself, such as a local Ollama server or your DeepLX server, needs your permission through Thunderbird's own prompt, which the extension shows only when you click "Allow access" or "Test connection".

### What is not sent

The offline dictionary and the offline Bergamot models translate on your computer and send nothing. If you use only these two, no message text leaves Thunderbird, and the extension never shows the consent panel.

### Downloads without your data

Two lists and the offline data come from the network, without any message text:

- the list of dictionary packs and the packs themselves, from the GitHub releases of the project (github.com, which redirects downloads to release-assets.githubusercontent.com or objects.githubusercontent.com);
- the list of Bergamot translation models and the model files, from Mozilla (firefox.settings.services.mozilla.com and firefox-settings-attachments.cdn.mozilla.net).

The extension reads the lists when the settings page or the setup guide shows them and, while the dictionary or Bergamot is the service of a tier, when Thunderbird starts, when the settings change and when the popup opens. Packs and models are downloaded only when you click a download button. Like every download, these requests show the server your IP address and the file asked for.

### What is stored on your computer

- The settings, including API keys, in the extension storage (storage.local) of your Thunderbird profile. They are not encrypted, like the data of other add-ons.
- A cache of translations and summaries in the same storage, up to 5,000 entries by default. It holds the translations and summaries, and the text they come from only as a hash. The settings page turns the cache off and clears it.
- The dictionary packs and Bergamot models you downloaded, in the extension's IndexedDB storage.

Removing the extension removes all of this.

### Changes and contact

Changes to this policy are listed in the changelog of the project. Questions and reports: https://github.com/willlllliams/thunderbird-translate/issues
