# README animations

`record.mjs` makes the animations of the READMEs in `docs/media/`: four scenes, each in three variants. The variant `en` has an English interface and a German message translated into English, `zh-CN` an English message translated into Simplified Chinese, `zh-TW` the same in Traditional Chinese. The files are named `<scene>-<variant>.gif`. README.md and the translated READMEs show the `en` animations; the two Chinese READMEs show their own.

Each animation is 900×716 pixels, lasts 10 seconds at 12 frames per second and loops. A line at the top names the steps of the scene and what the current one shows. A pointer moves to the controls and clicks them; the clicks are real clicks on the elements of the popup and of the content script.

## Scenes

`tiers` is at the top of the READMEs. The popup shows the three tiers (dictionary, Google Translate, DeepSeek) for 1.6 seconds. Then the message is translated in bilingual mode, and the content script translates the four paragraphs of the body:

- At 1.6 seconds the dictionary answers every paragraph at once.
- At 3.0 seconds Google Translate starts to replace the dictionary text.
- At 5.2 seconds DeepSeek starts to give the final translation.

The machine and AI answers reach the paragraphs one after another, 0.2 seconds apart, so the final translation is complete at 6.0 seconds and stays on screen for the last 4 seconds. The third paragraph is a request with a date and two list items written with "- ", as in a plain-text mail. The dictionary and Google Translate keep the "- " as characters. DeepSeek answers in Markdown, and the content script shows its answer with the list as bullets and the date in bold.

`images` sits next to precise translation in the feature list. The popup shows precise translation on and the image mode "Ask under each image"; the pointer clicks "Translate this message". A short message with an inline chart image is translated, and the button "Translate image text" appears under the chart. Its click opens the consent panel for images, "Allow and translate image" sends the image, and at 5.3 seconds the answer of DeepSeek appears: a table with each label of the chart (title, axis titles, series, the forecast mark) and its translation, without the figures and without a word on the trend. The chart is an SVG drawn by `samples.js` with invented figures.

`summary` sits next to summary and to-dos. The message is translated, with the "Summary" button above it. Its click shows the panel with "Writing the summary…", and at 2.5 seconds the summary arrives: the summary, two to-dos for "Me", the first with its due date, the question to answer and three dates. At 6.2 seconds the pointer clicks "Copy as Markdown", and the button reads "Copied".

`modes` sits next to the display modes. The popup stays open beside the translated message, with precise translation on. The pointer switches to "Translation only" at 1.6 seconds and back to "Bilingual" at 4.2 seconds; the content script draws the results it holds again, and the script checks that no translation is requested after the start. At 6.6 seconds "Show original" turns the translation off, and the script checks that the body is the same HTML as before the translation.

## Regenerating

```sh
npm run build
node tools/readme-gif/record.mjs                  # all twelve
node tools/readme-gif/record.mjs images           # one scene: tiers, images, summary or modes
node tools/readme-gif/record.mjs summary zh-CN    # one scene in one variant: en, zh-CN or zh-TW
```

The script needs Chrome or Edge and ffmpeg. `CHROME_BIN` selects the browser, `FFMPEG_BIN` the ffmpeg executable; without `FFMPEG_BIN`, ffmpeg is looked up on the PATH. The frames are kept in `.cache/readme-gif/frames-<scene>-<variant>/` for inspection. The script stops with an error when a GIF exceeds 2.5 MB, when the page does not reach the state of a frame within 20 seconds (it then prints what the page shows), and when a scene sent requests it must not send. `GIF_DEBUG=1` prints the exceptions and console output of the pages.

## How it works

The setup follows `tools/store-screenshots/`. A local server on 127.0.0.1 serves `dist/` and puts `samples.js` and `stub.js` in front of the scripts of each page of the extension. `stub.js` stands in for Thunderbird's WebExtension API. The popup and the content script are the built ones, with their real interface texts from `locales/`.

`stage.html` lays out a message pane with the real popup and a message body that runs the real content script, plus the caption line and the pointer. It holds the timeline of each scene. Nothing in it depends on the browser's timers: for each frame, `record.mjs` sets the time on the stage, the stage clicks what is due and releases the answers that are due (tiers, image, summary) through `stub.js`, and the script waits until the pages show the expected state before it takes the screenshot. The popup and the message body each load their own copy of `stub.js`; what the popup asks for the message ("Show original", the display mode and image mode it stores) goes to the copy of the message body, which pushes it to the content script as the background script would.

ffmpeg encodes the frames in two passes: `palettegen` computes one 256-colour palette over all frames, and `paletteuse` maps the frames to it with light Bayer dithering. Only the changed rectangle of each frame is stored.

`samples.js` holds the sample messages with their headers, the summary, the chart and the answer for it, and the caption texts. The messages, names and addresses are invented. The dictionary lines are the output of the real dictionary tier (`translateText()` in `src/offline/dictionary/index.ts`) with the packs dict-de-en and dict-en-zh-Hans; the Traditional Chinese dictionary line is the Simplified Chinese output in traditional characters. The Google Translate and DeepSeek lines are written in the style of each service.
