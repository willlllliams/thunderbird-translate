/**
 * End-to-end test probe of the setup guide, compiled only into the e2e build
 * (see src/e2e/background.ts).
 *
 * On the page opened by a "welcome" scenario it goes to the offline step with
 * a click and waits for both lists (dictionary packs and Bergamot models of
 * the mock server: en → zh-Hans and zh-Hans → en).
 * - "welcome" (source language English): "Download selected" downloads the
 *   ticked direction en → zh-Hans of both lists; the probe watches the lists
 *   while the files arrive.
 * - "welcome-auto" (automatic detection, target Simplified Chinese): both
 *   directions of the target language are recommended and ticked. "Download
 *   common languages" of the dictionary list downloads its two packs after
 *   the confirmation; then the probe clicks a check box of the model list off
 *   and on again and downloads the models with "Download selected".
 * Then it reads what was stored, through the background script and in
 * IndexedDB itself, deletes the downloads and reads again. The report goes to
 * the mock server; the test runner (e2e/run.mjs) makes the assertions.
 */

import { DictionaryStore } from "../background/dictionary/store"
import { ext } from "../shared/ext"
import { t } from "../shared/i18n"
import type { BergamotResult } from "../shared/messages"
import { $, send } from "../shared/page"
import { STEP_IDS } from "../welcome/steps"
import type { E2eMessage } from "./background"
import { E2E_MARKER } from "./marker"

const TIMEOUT_MS = 60_000
const DIRECTIONS = ["en>zh-Hans", "zh-Hans>en"]

/** What a list row shows. */
interface Row {
  id: string
  /** The check box in front of the name; null once the direction is installed. */
  checkbox: { checked: boolean; disabled: boolean } | null
  installed: boolean
  /** Labels of a recommended direction: where its language comes from, its route. */
  labels: number
  error: string | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function until(what: string, test: () => boolean): Promise<void> {
  const deadline = performance.now() + TIMEOUT_MS
  while (!test()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

function rows(list: HTMLElement): Row[] {
  return Array.from(list.querySelectorAll<HTMLElement>("li[data-id]"), (li) => {
    const box = li.querySelector("input[type=checkbox]")
    return {
      id: li.dataset.id!,
      checkbox: box instanceof HTMLInputElement ? { checked: box.checked, disabled: box.disabled } : null,
      installed: li.querySelector(".tag.active") !== null,
      labels: li.querySelectorAll(".lang-sources .tag").length,
      error: li.querySelector(".test-result.fail")?.textContent ?? null,
    }
  })
}

const LISTS = { dictionary: "dictList", bergamot: "bergamotList" } as const
type ListName = keyof typeof LISTS

/** Both lists, their status lines and the download line. */
const screen = () => ({
  dictionary: { status: $("dictStatus").textContent, rows: rows($("dictList")), common: $("dictCommon").textContent },
  bergamot: { status: $("bergamotStatus").textContent, rows: rows($("bergamotList")), common: $("bergamotCommon").textContent },
  download: $("downloadStatus").textContent,
})

const row = (list: ListName, id: string) => rows($(LISTS[list])).find((r) => r.id === id)
const done = (list: ListName, ids: string[]) => ids.every((id) => row(list, id)?.installed || row(list, id)?.error)

/** The percentages the list showed, in order ("Downloading… 40%"). */
function watchProgress(list: HTMLElement): number[] {
  const seen: number[] = []
  new MutationObserver(() => {
    const percent = /(\d+)\s*%/.exec(list.textContent ?? "")?.[1]
    if (percent !== undefined && seen.at(-1) !== Number(percent)) seen.push(Number(percent))
  }).observe(list, { childList: true, subtree: true, characterData: true })
  return seen
}

/** Number of records in object stores of a database, read without the extension's own code. */
function countRecords(database: string, stores: string[]): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(database)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      try {
        const tx = db.transaction(stores)
        const counts: Record<string, number> = {}
        for (const store of stores) tx.objectStore(store).count().onsuccess = (event) => (counts[store] = (event.target as IDBRequest<number>).result)
        tx.oncomplete = () => resolve(counts)
        tx.onerror = () => reject(tx.error)
      } catch (error) {
        reject(error)
      } finally {
        db.close()
      }
    }
  })
}

/** What the extension holds: the answers of the background script and the object stores themselves. */
async function stored() {
  const list = await send<BergamotResult>({ type: "bergamotList" })
  return {
    bergamotInstalled: list.ok ? (list.pairs ?? []).filter((p) => p.installed).map((p) => `${p.src}>${p.tgt}`) : list.error,
    dictionaryInstalled: (await new DictionaryStore().list()).map((p) => p.id).sort(),
    bergamotRecords: await countRecords("tt-bergamot", ["pairs", "files"]),
    dictionaryRecords: await countRecords("tt-dictionary", ["packs", "data"]),
  }
}

/** "Download selected", then wait until it reports how it ended. */
async function downloadSelected(report: Record<string, unknown>): Promise<void> {
  const download = $<HTMLButtonElement>("downloadPicked")
  download.click()
  report.disabledWhileDownloading = download.disabled
  report.statusWhileDownloading = $("downloadStatus").textContent
  const running = $("downloadStatus").textContent
  await until("Download selected to end", () => !["", running].includes($("downloadStatus").textContent ?? ""))
  report.downloadStatus = $("downloadStatus").textContent === t("downloadDone") ? "done" : $("downloadStatus").textContent
}

async function welcome(report: Record<string, unknown>): Promise<string[]> {
  const progress = { dictionary: watchProgress($("dictList")), bergamot: watchProgress($("bergamotList")) }
  await downloadSelected(report)
  await until("the downloads to show as finished", () => done("dictionary", ["en>zh-Hans"]) && done("bergamot", ["en>zh-Hans"]))
  report.progress = progress
  return ["en>zh-Hans"]
}

async function welcomeAuto(report: Record<string, unknown>): Promise<string[]> {
  report.autoHint = !$("offlineAutoHint").hidden
  // Dictionary: "Download common languages", the confirmation, then the download.
  const common = $("dictCommon")
  common.querySelector("button")!.click()
  const confirm = common.querySelector(".common-confirm")
  report.commonConfirm = confirm ? { items: confirm.querySelectorAll("li").length, text: confirm.querySelector("p")?.textContent } : null
  confirm!.querySelector<HTMLButtonElement>("button.primary")!.click()
  await until("the common dictionary packs", () => done("dictionary", DIRECTIONS))
  report.commonAfter = { allInstalled: (common.textContent ?? "").includes(t("commonAllInstalled")), disabled: common.querySelector("button")!.disabled }
  // Models: a check box clicked off and on again, then "Download selected".
  const box = () => $("bergamotList").querySelector<HTMLInputElement>('li[data-id="zh-Hans>en"] input[type=checkbox]')!
  box().click()
  report.untickedPicks = !box().checked && $<HTMLButtonElement>("downloadPicked").disabled === false
  box().click()
  report.retickedPicks = box().checked
  await downloadSelected(report)
  await until("the models to show as installed", () => done("bergamot", DIRECTIONS))
  return DIRECTIONS
}

export async function runWelcomeProbe(scenario: string): Promise<void> {
  const report: Record<string, unknown> = { hook: E2E_MARKER, scenario, url: location.href }
  try {
    const i18n = ext.i18n as typeof ext.i18n & { getPreferredSystemLanguages?: () => Promise<string[]> }
    report.systemLanguages = i18n.getPreferredSystemLanguages ? await i18n.getPreferredSystemLanguages() : "no getPreferredSystemLanguages()"
    // Step 4 of the guide, reached through the progress list.
    const offline = $("stepList").querySelectorAll("button")[STEP_IDS.indexOf("offline")]
    await until("the offline step in the progress list", () => !offline.disabled)
    offline.click()
    await until("the offline step", () => !(document.querySelector('section[data-step="offline"]') as HTMLElement).hidden)
    await until("both directions in both lists", () => DIRECTIONS.every((id) => row("dictionary", id) && row("bergamot", id)))
    report.offered = screen()
    report.initial = await stored()

    const downloaded = scenario === "welcome-auto" ? await welcomeAuto(report) : await welcome(report)
    report.finished = screen()
    report.downloaded = await stored()

    // The guide has no delete button; remove the downloads the way the settings page does.
    for (const id of downloaded) {
      const [src, tgt] = id.split(">")
      await send({ type: "bergamotRemove", src, tgt })
      await new DictionaryStore().remove(id)
    }
    await send({ type: "dictionaryChanged" })
    report.removed = await stored()
  } catch (error) {
    report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
    report.screen = screen()
  }
  await ext.runtime.sendMessage({ e2e: "report", report } satisfies E2eMessage)
}
