/** The mail APIs of Thunderbird (mailTabs, messages, windows) over folders of messages, as the page of translated subjects sees them. */
import { vi } from "vitest"
import type { MailTab, MessageHeader, MessageList } from "../../src/shared/ext"
import { fakeEvent } from "./events"

/** A message of a folder: id, subject, sender and date. */
export const message = (id: number, subject: string, author = `Sender ${id} <s${id}@example.com>`): MessageHeader => ({ id, subject, author, date: new Date(Date.UTC(2026, 9, 1, 9, id % 60)) })

/** `count` messages with subjects "Subject <n>". */
export const messages = (count: number, first = 1) => Array.from({ length: count }, (_, i) => message(first + i, `Subject ${first + i}`))

export interface FakeMailOptions {
  /** The messages of each folder; the mail tab shows the first one. */
  folders: Record<string, MessageHeader[]>
  /** The mail tab of mailTabs.getCurrent(); null: the active tab is no mail tab. */
  current?: MailTab | null
  /** Messages per page of a list, 100 in Thunderbird. */
  pageSize?: number
}

export function fakeMail({ folders, current = { id: 5, windowId: 1, active: true }, pageSize = 100 }: FakeMailOptions) {
  let displayed = Object.keys(folders)[0]
  const open = new Map<string, MessageHeader[]>()
  let lists = 0
  /** One page of `rest`; the remainder waits under the id of the list. */
  const page = (rest: MessageHeader[]): MessageList => {
    if (rest.length <= pageSize) return { id: null, messages: rest }
    const id = `list-${++lists}`
    open.set(id, rest.slice(pageSize))
    return { id, messages: rest.slice(0, pageSize) }
  }
  const onDisplayedFolderChanged = fakeEvent<[MailTab, unknown]>()
  const api = {
    mailTabs: {
      getCurrent: vi.fn(async () => current ?? undefined),
      getListedMessages: vi.fn(async (_tabId: number) => page([...folders[displayed]])),
      setSelectedMessages: vi.fn(async (_tabId: number, _ids: number[]) => {}),
      onDisplayedFolderChanged,
    },
    messages: {
      continueList: vi.fn(async (id: string) => {
        const rest = open.get(id)
        if (!rest) throw new Error(`unknown list ${id}`)
        open.delete(id)
        return page(rest)
      }),
      abortList: vi.fn(async (id: string) => void open.delete(id)),
      onNewMailReceived: fakeEvent<[unknown, MessageList]>(),
      onDeleted: fakeEvent<[MessageList]>(),
      onMoved: fakeEvent<[MessageList, MessageList]>(),
    },
    windows: { create: vi.fn(async (_info: object) => ({})) },
  }
  return {
    api,
    /** Lists not read to the end and not aborted. */
    open,
    /** The mail tab `tabId` shows another folder. */
    show(folder: string, tabId = current?.id ?? 5) {
      displayed = folder
      onDisplayedFolderChanged.fire({ id: tabId, windowId: 1, active: true }, { name: folder })
    },
  }
}

export type FakeMail = ReturnType<typeof fakeMail>
