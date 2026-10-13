# README animations

`record.mjs` makes the three animations at the top of the READMEs: `docs/media/tiers-en.gif` (English interface, a German message translated into English), `docs/media/tiers-zh-CN.gif` (Simplified Chinese interface, an English message translated into Simplified Chinese) and `docs/media/tiers-zh-TW.gif` (the same in Traditional Chinese). README.md and the translated READMEs show the English one; the two Chinese READMEs show their own.

Each animation lasts 9 seconds at 12 frames per second and loops. The popup shows the three tiers (dictionary, Google Translate, DeepSeek) for 1.6 seconds. Then the message is translated in bilingual mode: the dictionary answers every paragraph at once, Google Translate replaces it after 1.4 seconds, and DeepSeek gives the final translation 2.2 seconds later. The machine and AI answers reach the paragraphs 0.2 seconds apart. The line at the top names the tier whose answers are arriving.

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

`samples.js` holds the sample messages and the caption texts. The messages, names and addresses are invented. The dictionary lines are the output of the real dictionary tier (`translateText()` in `src/offline/dictionary/index.ts`) with the packs dict-de-en and dict-en-zh-Hans; the Traditional Chinese dictionary line is the Simplified Chinese output in traditional characters. The Google Translate and DeepSeek lines are written in the style of each service.
