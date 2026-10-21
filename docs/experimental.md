# Experimental build

The experimental build is a second variant of Multi Translate for Thunderbird, made from the same sources. It adds a column "Translated subject" to Thunderbird's message list. The column needs an internal interface of Thunderbird, which an add-on reaches only through a WebExtension Experiment. That is why the experimental build is published only on the GitHub releases of this project and not on addons.thunderbird.net.

## Contents

- [What it adds](#what-it-adds)
- [Install](#install)
- [Differences from the regular build](#differences-from-the-regular-build)
- [Risks](#risks)
- [How the column works](#how-the-column-works)
- [Thunderbird versions](#thunderbird-versions)
- [Build](#build)

## What it adds

The message list gets a column "Translated subject". When a mail tab shows a folder, the extension translates the subjects of the first 100 messages of the list and fills the column:

- The column shows the result of the highest tier that has answered. A lower tier fills it first, and the highest tier replaces it.
- Reply and forward prefixes such as "Fwd:" stay in front of the translation.
- An AI translation appears without its Markdown marks while "Render Markdown in AI translations" is on, see [Markdown in AI translations](settings.md#markdown-in-ai-translations); changing the switch shows the column again without a request.
- A subject already in the target language leaves its cell empty.
- The subjects are translated again when the mail tab shows another folder, when another mail tab comes to the front, when new mail arrives and when Thunderbird starts. Translations in the cache come back without a request.
- After a change of the languages, of a service of the tiers or of the allowed services, the column empties and fills again.

Everything else is the regular extension: the translation of the message body with the subject line above it, the page of translated subjects, the settings and the setup guide.

## Install

1. Download `multi-translate-experimental-<version>.xpi` from the [Releases page](https://github.com/willlllliams/thunderbird-translate/releases). The release of a version carries both builds; the regular build is `thunderbird-translate-<version>.xpi`.
2. If the regular build is installed, remove it first under Tools → Add-ons and Themes.
3. Click the gear icon above the extension list, choose "Install Add-on From File", select the xpi file and confirm.

Requirements:

- Thunderbird 128 or later.
- The table view of the message list. Thunderbird draws the columns of add-ons only in the table view; the cards view, the default of Thunderbird 128 and later, has no columns. Switch with the "Message list display options" button in the header of the message list.

No preference has to be changed. Thunderbird installs add-ons without a signature, and it runs WebExtension Experiments in its release builds as well. Both were checked with Thunderbird 156.0.1: the unsigned xpi in a new profile, without any preference about signatures or experiments, was active after the start, and its column showed the translations. In the source code of Thunderbird the build option that would require signatures (`MOZ_REQUIRE_SIGNING`) is off, and the preferences `xpinstall.signatures.required` and `extensions.experiments.enabled` default to `false` and `true`.

Only one of the two builds can be installed. They have different add-on ids (`thunderbird-translate@willlllliams.github.io` and `thunderbird-translate-experimental@willlllliams.github.io`), so Thunderbird would run both side by side. Each would add its own buttons, register its own content script and translate every message twice. The add-on id also keeps the automatic updates apart: the regular build updates from addons.thunderbird.net, the experimental build does not update by itself.

The settings, the translation cache and the downloaded dictionary packs and offline models belong to the add-on id. The experimental build therefore starts with its own setup guide and does not see what the regular build stored.

## Differences from the regular build

| | Regular build | Experimental build |
| --- | --- | --- |
| File | `thunderbird-translate-<version>.xpi` | `multi-translate-experimental-<version>.xpi` |
| Add-on id | `thunderbird-translate@willlllliams.github.io` | `thunderbird-translate-experimental@willlllliams.github.io` |
| Name | Multi Translate for Thunderbird | Multi Translate for Thunderbird (Experimental), with the word for "experimental" in each interface language |
| Published | addons.thunderbird.net and GitHub releases | GitHub releases only |
| Updates | automatic, from addons.thunderbird.net | install each new version by hand |
| Column "Translated subject" | no | yes |
| WebExtension Experiment | none | `translatedColumn`, running in Thunderbird's main process |

The version number is the same for both builds.

## Risks

- The column relies on `ThreadPaneColumns`, an internal module of Thunderbird. It is no published interface for add-ons: Thunderbird may rename it, change its functions or remove it in any version, and the column then stops working. The rest of the extension keeps working, since it uses the published WebExtension API only.
- An Experiment runs with the full rights of Thunderbird itself, outside the restrictions of a WebExtension. The code of this one is short and only adds and fills the column; it is in [src/experiments/translated-column/implementation.js](../src/experiments/translated-column/implementation.js).
- Thunderbird 153 added a switch, `extensions.experiments.suppressed`, that disables every Experiment except a few allowed ones. It is off by default up to Thunderbird 160. In May 2026 Thunderbird announced that Experiments would be blocked on the monthly release channel and keep working in its ESR versions; its monthly development digest of June 2026 postponed this by a year. Once such a restriction applies, the experimental build works only in an ESR version of Thunderbird.
- addons.thunderbird.net does not list the experimental build, so no reviewer of the add-on site has read it.

## How the column works

The background script of the experimental build runs the background script of the regular build and adds the column ([src/experiments/background.ts](../src/experiments/background.ts) and [column.ts](../src/experiments/column.ts)). It reads the message list of the mail tab with `mailTabs.getListedMessages()` and translates the subjects through the translation service of the extension, in the same batches, with the same cache and under the same consent rules as the page of translated subjects.

The column cannot show the consent panel. An online service that you have not allowed yet therefore sends nothing, and only the tiers you allowed and the offline tiers fill the column. Allow a service by translating a message or by opening the page of translated subjects.

The Experiment `translatedColumn` ([schema](../src/experiments/translated-column/schema.json), [implementation](../src/experiments/translated-column/implementation.js)) runs in Thunderbird's main process:

1. `add(name)` registers the column with `ThreadPaneColumns.addCustomColumn()`. Thunderbird asks the column for the text of each row synchronously, through the function `textCallback`, so the column reads a table of translations kept in the main process. The table is keyed by the subject as the message database stores it (`nsIMsgDBHdr.mime2DecodedSubject`), which is the same text as `MessageHeader.subject` of the WebExtension API.
2. `set(entries)` takes over new translations and calls `ThreadPaneColumns.refreshCustomColumn()`. Every message list of every window then draws its visible rows again, and the column gives each row its translation.
3. `show()` makes the column visible in the folders the message lists show. A new column is visible in a folder that has no column settings of its own. A folder whose columns you arranged keeps the new column hidden until you tick it in the column picker of the message list. After a new installation the extension calls `show()` once for the folders on screen.
4. `inspect(tabId, rows)` reports whether the column is registered and visible and what it shows in the first rows; the end-to-end test reads the column with it.
5. When the extension is disabled, removed or updated, `onShutdown` removes the column with `ThreadPaneColumns.removeCustomColumn()` and asks Thunderbird to reload the scripts of Experiments, so that a new version does not run the old one. When Thunderbird itself closes, nothing needs to be removed.

The column cannot be sorted: sorting by it would order the messages by text that changes while translations arrive.

## Thunderbird versions

The module and its functions were compared in the source code of Thunderbird ([thunderbird-desktop](https://github.com/thunderbird/thunderbird-desktop), branches `esr128`, `esr140`, `esr153`, `release`, and the tags of 157.0 and 157.0.1) and in the installed Thunderbird 156.0.1:

| Thunderbird | Module | Functions used |
| --- | --- | --- |
| 115.10 and later 115 | `chrome://messenger/content/thread-pane-columns.mjs` | same as below |
| 128 ESR, 140 ESR, 153 ESR, 156, 157 | `chrome://messenger/content/ThreadPaneColumns.mjs` | `addCustomColumn(id, { name, hidden, resizable, sortable, textCallback })`, `refreshCustomColumn(id)`, `removeCustomColumn(id)`, `getCustomColumns()` |

Thunderbird 128 renamed the file of the module (bug 1890731). The module was always an ES module under `chrome://`, never a `.jsm` under `resource:///modules/`. From 128 to 157 its custom column functions accept the same properties; the file is identical from 153 on, and 128 and 140 differ only in built-in columns and comments. The implementation tries the name of 128 first and the name of 115 second, and reports both when neither loads. In all these versions `refreshCustomColumn()` makes every message list draw its rows again (`threadTree.invalidate()`), which the column relies on.

The choice between table view and cards view lives in different places: Thunderbird 128 keeps it in the XUL store of the main window (`xulstore.json`, entry `threadPane`, attribute `view`), Thunderbird 140 and later in the preference `mail.threadpane.listview`. The button of the message list sets either one, so for users nothing differs. `inspect()` therefore reads the view from the message list itself (`threadTree`, attribute `rows`), and the test profile sets both.

The end-to-end test runs the experimental build in Thunderbird 128.14.0esr, 140.17.0esr, 153.4.0esr and 157.0.1 in CI ([development.md](development.md#end-to-end-tests), run `column`). It checks that the column is registered and visible, and that its cells on screen show the translations once they arrive. A change of the internal module in a later version shows up there first.

Thunderbird has no published interface for columns of add-ons yet: bug [1615801](https://bugzilla.mozilla.org/show_bug.cgi?id=1615801), "Add an API to allow adding columns to the message list", is still open. The WebExtension API of 157 lets an add-on sort by a custom column (`mailTabs` with `sortType: "custom"`), but not add one.

## Build

```bash
npm ci
npm run build:experimental
```

The result is `web-ext-artifacts/multi-translate-experimental-<version>.xpi`. [development.md](development.md#build-from-source) describes the build and the checks that keep the Experiment out of the regular build.
