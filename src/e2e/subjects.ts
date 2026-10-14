/**
 * End-to-end test probe of the page of translated subjects, compiled only
 * into the e2e build (see src/e2e/background.ts, scenario "subjects").
 *
 * The background script shows the local folder "Foreign" in the mail tab
 * and opens the page in a window of its own with ?tab=<mail tab>&e2e=subjects. No online service is
 * allowed yet, so the page first shows the consent panel; the probe waits,
 * checks that nothing was translated, and clicks "Allow and translate".
 * Then it waits until every subject not in the target language has its final
 * translation, clicks the second row and reads the selection of the mail
 * tab, shows the folder "Second" in the mail tab and waits for the page to
 * list and translate its subjects. The report goes to the mock server; the
 * test runner (e2e/run.mjs) makes the assertions.
 */

import { ext, type MessageList } from "../shared/ext"
import { t } from "../shared/i18n"
import type { SubjectsProbeParts } from "../hooks/subjects"
import type { E2eMessage } from "./background"
import { E2E_MARKER } from "./marker"

const TIMEOUT_MS = 60_000

/** The mail APIs the probe uses besides those of the page. */
interface ProbeApi {
  mailTabs: {
    getSelectedMessages(tabId: number): Promise<MessageList>
    update(tabId: number, properties: { displayedFolder: unknown }): Promise<unknown>
  }
  folders: { query(info: { name: string }): Promise<unknown[]> }
}
const api = () => browser as unknown as ProbeApi

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function until(what: string, test: () => boolean): Promise<void> {
  const deadline = performance.now() + TIMEOUT_MS
  while (!test()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(rows())}`)
    await sleep(50)
  }
}

/** What each row shows: the subject, its translation (without a mark) and the mark of a provisional or fallback result. */
function rows() {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>("#rows tr"), (tr) => {
    const translation = tr.querySelector<HTMLElement>(".tt-translation")
    return {
      subject: tr.querySelector(".subject")?.textContent ?? "",
      translation: translation?.firstChild?.nodeType === Node.TEXT_NODE ? (translation.firstChild.textContent ?? "") : null,
      mark: translation?.classList.contains("tt-provisional") ? "provisional" : translation?.classList.contains("tt-fallback") ? "fallback" : null,
      loading: tr.querySelector(".tt-loading") !== null,
      selected: tr.getAttribute("aria-selected") === "true",
    }
  })
}

/** `count` rows show the final translation of the AI tier, and no row is still loading or provisional. */
const allFinal = (count: number) => () => {
  const shown = rows()
  const final = shown.filter((r) => r.mark === null && r.translation?.startsWith("[AI "))
  return final.length === count && shown.every((r) => !r.loading && r.mark === null)
}

export async function runSubjectsProbe({ client, tabId }: SubjectsProbeParts): Promise<void> {
  const report: Record<string, unknown> = { hook: E2E_MARKER, tabId }
  void ext.runtime.sendMessage({ e2e: "log", message: `page of translated subjects on ${location.href}` } satisfies E2eMessage)
  try {
    if (tabId === undefined) throw new Error("the page has no mail tab")
    await until("the consent panel", () => document.querySelector(".tt-consent") !== null)
    // Time for a request that must not go out.
    await sleep(1500)
    const panel = document.querySelector<HTMLElement>(".tt-consent")!
    report.panel = {
      titleOfSubjects: panel.querySelector("strong")?.textContent === t("consentSubjectsTitle"),
      services: Array.from(panel.querySelectorAll("li"), (li) => li.textContent),
      buttons: Array.from(panel.querySelectorAll("button"), (b) => b.textContent),
    }
    report.beforeAllow = { translations: document.querySelectorAll(".tt-translation").length, rows: rows().length }
    report.allowedAt = Date.now()
    panel.querySelector<HTMLButtonElement>("button")!.click()
    // Six subjects, one of them in the target language.
    await until("the final translations of the folder Foreign", allFinal(5))
    report.first = { rows: rows(), status: document.getElementById("status")?.textContent, active: client.controller.active }

    // A click selects the message in the mail tab.
    const row = document.querySelectorAll<HTMLTableRowElement>("#rows tr")[1]
    row.click()
    let selected: string[] = []
    const deadline = performance.now() + TIMEOUT_MS
    while (performance.now() < deadline) {
      selected = (await api().mailTabs.getSelectedMessages(tabId)).messages.map((m) => m.subject)
      if (selected.length > 0) break
      await sleep(200)
    }
    report.selected = { clicked: row.querySelector(".subject")?.textContent, selected, marked: rows()[1]?.selected }

    // Another folder in the mail tab: the page lists and translates its messages.
    const [second] = await api().folders.query({ name: "Second" })
    if (!second) throw new Error("no folder Second")
    // Thunderbird reads the new mbox file of the folder when it first shows it, and may fail the first attempt.
    const until2 = performance.now() + TIMEOUT_MS
    const attempts: string[] = []
    for (;;) {
      try {
        await api().mailTabs.update(tabId, { displayedFolder: second })
        break
      } catch (error) {
        attempts.push(String(error))
        if (performance.now() > until2) throw new Error(`mailTabs.update: ${attempts.join("; ")}`)
        await sleep(500)
      }
    }
    report.folderAttempts = attempts.length
    await until("the subjects of the folder Second", () => rows().length === 2 && allFinal(2)())
    report.second = { rows: rows() }
  } catch (error) {
    report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
  }
  await ext.runtime.sendMessage({ e2e: "report", report } satisfies E2eMessage)
}
