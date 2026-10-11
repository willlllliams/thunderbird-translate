/**
 * End-to-end test probe of the setup guide, compiled only into the e2e build
 * (see src/e2e/background.ts).
 *
 * On the page opened by the "welcome" scenario it goes to the offline step
 * with a click, downloads the dictionary pack and the Bergamot model that the
 * step has ticked by clicking "Download selected", and watches the lists while
 * the files arrive. Then it reads what was stored, through the background
 * script and in IndexedDB itself, deletes both downloads and reads again. The
 * report goes to the mock server; the test runner (e2e/run.mjs) makes the
 * assertions.
 */

import { DictionaryStore } from "../background/dictionary/store"
import { ext } from "../shared/ext"
import type { BergamotRequired, BergamotResult } from "../shared/messages"
import { $, send } from "../shared/page"
import { STEP_IDS } from "../welcome/steps"
import type { E2eMessage } from "./background"
import { E2E_MARKER } from "./marker"

const TIMEOUT_MS = 60_000
const PACK = { id: "en>zh-Hans", src: "en", tgt: "zh-Hans" }

/** What a list row shows. */
interface Row {
  text: string
  /** The check box in front of the name; null once the pack is installed. */
  checkbox: { checked: boolean; disabled: boolean } | null
  installed: boolean
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
  return Array.from(list.children, (li) => {
    const box = li.querySelector("input[type=checkbox]")
    return {
      text: li.textContent ?? "",
      checkbox: box instanceof HTMLInputElement ? { checked: box.checked, disabled: box.disabled } : null,
      installed: li.querySelector(".tag.active") !== null,
      error: li.querySelector(".test-result.fail")?.textContent ?? null,
    }
  })
}

/** Both lists and their status lines. */
const screen = () => ({
  dictionary: { status: $("dictStatus").textContent, rows: rows($("dictList")) },
  bergamot: { status: $("bergamotStatus").textContent, rows: rows($("bergamotList")) },
})

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
  const required = await send<BergamotRequired>({ type: "bergamotRequired", src: PACK.src, tgt: "zh-CN" })
  return {
    bergamotInstalled: list.ok ? (list.pairs ?? []).filter((p) => p.installed).map((p) => `${p.src}>${p.tgt}`) : list.error,
    bergamotMissing: required.missing.map(([s, t]) => `${s}>${t}`),
    dictionaryInstalled: (await new DictionaryStore().list()).map((p) => p.id),
    bergamotRecords: await countRecords("tt-bergamot", ["pairs", "files"]),
    dictionaryRecords: await countRecords("tt-dictionary", ["packs", "data"]),
  }
}

export async function runWelcomeProbe(): Promise<void> {
  const report: Record<string, unknown> = { hook: E2E_MARKER, scenario: "welcome", url: location.href }
  try {
    // Step 4 of the guide, reached through the progress list.
    const offline = $("stepList").querySelectorAll("button")[STEP_IDS.indexOf("offline")]
    await until("the offline step in the progress list", () => !offline.disabled)
    offline.click()
    await until("the offline step", () => !(document.querySelector('section[data-step="offline"]') as HTMLElement).hidden)
    await until("the pack and the model to be offered", () => $("dictList").querySelector("input") !== null && $("bergamotList").querySelector("input") !== null)
    report.offered = screen()
    report.initial = await stored()

    const progress = { dictionary: watchProgress($("dictList")), bergamot: watchProgress($("bergamotList")) }
    const download = $<HTMLButtonElement>("downloadPicked")
    download.click()
    report.disabledWhileDownloading = download.disabled
    const finished = () => {
      const { dictionary, bergamot } = screen()
      const all = [...dictionary.rows, ...bergamot.rows]
      return !download.disabled && all.length > 0 && all.every((r) => r.installed || r.error !== null)
    }
    await until("the downloads to finish", finished)
    report.progress = progress
    report.finished = screen()
    report.downloaded = await stored()

    // The guide has no delete button; remove the downloads the way the settings page does.
    await send({ type: "bergamotRemove", src: PACK.src, tgt: PACK.tgt })
    await new DictionaryStore().remove(PACK.id)
    await send({ type: "dictionaryChanged" })
    report.removed = await stored()
  } catch (error) {
    report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
    report.screen = screen()
  }
  await ext.runtime.sendMessage({ e2e: "report", report } satisfies E2eMessage)
}
