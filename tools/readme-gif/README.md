# README animations

`record.mjs` makes the three animations at the top of the READMEs: `docs/media/tiers-en.gif` (English interface, a German message translated into English), `docs/media/tiers-zh-CN.gif` (Simplified Chinese interface, an English message translated into Simplified Chinese) and `docs/media/tiers-zh-TW.gif` (the same in Traditional Chinese). README.md and the translated READMEs show the English one; the two Chinese READMEs show their own.

Each animation is 900×716 pixels, lasts 10 seconds at 12 frames per second and loops. The popup shows the three tiers (dictionary, Google Translate, DeepSeek) for 1.6 seconds. Then the message is translated in bilingual mode. The content script puts the subject in a line above the body and translates it with the four paragraphs:

- At 1.6 seconds the dictionary answers the subject line and every paragraph at once.
- At 3.0 seconds Google Translate starts to replace the dictionary text.
- At 5.2 seconds DeepSeek starts to give the final translation.

The machine and AI answers reach the subject line and the paragraphs one after another, 0.2 seconds apart, so the final translation is complete at 6.0 seconds and stays on screen for the last 4 seconds. The line at the top names the tier whose answers are arriving.

The third paragraph is a request with a date and two list items written with "- ", as in a plain-text mail. The dictionary and Google Translate keep the "- " as characters. DeepSeek answers in Markdown, and the content script shows its answer with the list as bullets and the date in bold. The subject line shows an AI translation as plain text, without Markdown marks.

## Regenerating

```sh
npm run build
node tools/readme-gif/record.mjs            # all three
node tools/readme-gif/record.mjs zh-CN      # one variant: en, zh-CN or zh-TW
```

The script needs Chrome or Edge and ffmpeg. `CHROME_BIN` selects the browser, `FFMPEG_BIN` the ffmpeg executable; without `FFMPEG_BIN`, ffmpeg is looked up on the PATH. The frames are kept in `.cache/readme-gif/frames-<variant>/` for inspection. The script stops with an error when a GIF exceeds 2.5 MB.

## How it works

The setup follows `tools/store-screenshots/`. A local server on 127.0.0.1 serves `dist/` and puts `samples.js` and `stub.js` in front of the scripts of each page of the extension. `stub.js` stands in for Thunderbird's WebExtension API. The popup and the content script are the built ones, with their real interface texts from `locales/`.

`stage.html` lays out a message pane with the real popup and a message body that runs the real content script, plus the caption line. It holds the timeline. Nothing in it depends on the browser's timers: for each frame, `record.mjs` sets the time on the stage, the stage releases the tier answers that are due through `stub.js`, and the script waits until every paragraph shows the expected tier before it takes the screenshot.

ffmpeg encodes the frames in two passes: `palettegen` computes one 256-colour palette over all frames, and `paletteuse` maps the frames to it with light Bayer dithering. Only the changed rectangle of each frame is stored.

`samples.js` holds the sample messages with their subjects and the caption texts. `stub.js` answers the content script's request for the subject of the message with the subject of the sample, as the background script does with the header of the message on screen. The messages, names and addresses are invented. The dictionary lines are the output of the real dictionary tier (`translateText()` in `src/offline/dictionary/index.ts`) with the packs dict-de-en and dict-en-zh-Hans; the Traditional Chinese dictionary line is the Simplified Chinese output in traditional characters. The Google Translate and DeepSeek lines are written in the style of each service.
