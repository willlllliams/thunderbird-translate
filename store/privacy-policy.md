# Privacy policy

The text below, from "Multi Translate for Thunderbird: privacy policy" to the end, goes into the privacy policy field of the listing on addons.thunderbird.net. A Simplified Chinese version is in [privacy-policy.zh-CN.md](privacy-policy.zh-CN.md).

---

## Multi Translate for Thunderbird: privacy policy

Multi Translate for Thunderbird translates the messages you read in Thunderbird. It has no server of its own: its developer receives no data from it, and it collects no statistics, usage data or crash reports and has no accounts.

### What is sent, and to whom

The extension sends message text only when you translate a message or change a setting that changes a translation (the display mode, the languages, the services): with the buttons of the popup, the keyboard shortcuts Alt+A, Alt+S and Alt+R, or automatic translation if you turned it on. It then sends the text of the message's paragraphs to the services of the translation tiers you chose:

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

When you ask for the summary and to-dos of a message, with the button "Summary and to-dos" of the popup, a keyboard shortcut you assigned yourself or the "Summary" button above a translated message if you turned it on, or when "Automatic summary" opens it by itself (off by default; "When the message is translated" or "For every opened message"), the AI service of the summary receives the text of the whole message (up to 20,000 characters) together with its sender, date and subject, so that it can name who has to do what and turn "next Wednesday" into a date. With precise translation on, the request also carries the glossary of the analysis described above. When a long message needs that analysis and the summary uses the same AI service and model as tier 3, one request asks for both, and the message with its sender, date and subject goes to that service once. Nothing is sent for a summary unless you ask for one or turn on "Automatic summary".

### Images

The images of a message are sent only when you turn on precise translation, and then only:

- in the image translation mode "Ask under each image" (the default), when you click "Translate image text" under an image: that image only;
- in the mode "On", by themselves when you translate a message: the first images that pass the filters below, in the order of the message.

At most five images per message are sent (the default), counted for the message on screen whatever the extension draws again; translating the message again with "Retranslate" counts anew.

What is sent is the image itself, scaled down to at most 1568 pixels on its longer side (the default) and encoded again as JPEG, which drops its file name and metadata such as EXIF, together with the prompt and one line naming its place in the message and the target language. With "Use the message context" on, the glossary of names and terms that precise translation made of the message goes with it, but only to the service of tier 3 or to a service you also allowed to receive the text of messages; the consent panel then says so. At most 6 MB of images per message are sent (the default). The image goes to the vision service: the AI service of tier 3, or another AI service you chose for images, at the endpoint listed above.

Never sent: remote images (loaded from the internet), tracking pixels, images with more than 40 megapixels, images under the size limits of the settings (100 pixels on the shorter side, 40,000 pixels of area, 4 KB of file by default), animated images unless you choose to send their first frame, and attachments that are not images. Images in a signature are not sent by default; the settings can turn this filter off.

Together with the text, a service receives the source and target language, and the settings of the request that belong to it: for an AI service the model, the prompt, the temperature and the thinking switch; for Baidu and Youdao your app ID and a signature computed from your key, which itself is not sent; for DeepL the formality and the variant of English or Portuguese. An API key you saved is sent only to its own service. The recipients and attachments of a message are never sent; its sender, date and subject only with a summary, as described above. Each service handles the text under its own privacy policy.

### What the extension reads in Thunderbird

To translate the images of a message, the extension reads the image parts of the message on screen with `messages.getAttachmentFile()`: the images of the body and the image attachments that pass the filters above, no other attachment. It reads them on your computer when the translation of the message starts, to find results it already has and to apply its filters, and only from the message that was on screen when the translation started, while it is still on screen; an image leaves your computer only as described above. For a summary the extension reads the sender, date and subject of the message on screen (the permission "Read your email messages", `messagesRead`, which also covers the image parts above). The extension reads no account settings and stores none of this; only the sender, date and subject of a message it summarizes leave your computer, as described above.

### Your consent

Before the text of a message first goes to an online service, a panel above the message names the service and the address its requests go to, and says what is sent. Nothing is sent to that service until you click "Allow and translate". A summary uses the same consent: before its AI service first receives a message, the same panel appears, also for a summary that "Automatic summary" opens by itself. The extension asks once per service and address, records your answer with that address in its settings, and asks again when you change the address of the service. The settings page lists the services you allowed with their addresses, and "Revoke" takes the consent back: requests to the service that still wait in a queue are not sent, and the panel asks again.

Images need a consent of their own, apart from the text: before the first image goes to a service, a panel under the image names the service and its address, says that the image goes scaled down and encoded again without its file name and metadata, and, for Anthropic, Google Gemini and OpenAI, what the service states about its use of the data. Nothing is sent until you click "Allow and translate image"; an image that waits in a queue is not sent once you revoke the consent, turn image translation off or leave the message. With "Ask again for every message" on, the panel asks for every message and records nothing. The settings page lists the services allowed to receive images in a column of their own, each with "Revoke".

When the settings page or the setup guide shows Google Translate (free) or Microsoft Translator (free) as an added service, it sends the fixed test sentence of "Test connection" there once per page, to tell you whether the service can be reached from your network (Google Translate is not available in mainland China, for example). No message text goes with it; like any request, it shows the service your IP address.

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
- A cache of translations, summaries and the text of images in the same storage, up to 5,000 entries by default. It holds the translations, summaries and the answers about images, and the text or image they come from only as a hash. The settings page turns the cache off and clears it.
- The dictionary packs and Bergamot models you downloaded, in the extension's IndexedDB storage.

Removing the extension removes all of this.

### Changes and contact

Changes to this policy are listed in the changelog of the project. Questions and reports: https://github.com/willlllliams/thunderbird-translate/issues
