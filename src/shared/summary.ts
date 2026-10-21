/**
 * The summary and to-dos of a message: what the background script reads
 * from the answer of the AI service (background/summary.ts) and the panel
 * above the message draws (content/summary.ts).
 */

/** Something to do: who ("me" for the reader, a name, or ""), what, the deadline as an ISO date and as the message states it, and the words it rests on. */
export interface SummaryAction {
  who: string
  task: string
  /** YYYY-MM-DD or YYYY-MM-DD HH:MM; "" when the message leaves it open. */
  due: string
  dueText: string
  /** At most 120 characters of the original. */
  quote: string
  /** The quote of the model was not in the message: the item may come from an instruction hidden in it. */
  unverified?: boolean
}

export interface SummaryQuestion {
  from: string
  question: string
}

export interface SummaryDate {
  what: string
  /** YYYY-MM-DD or YYYY-MM-DD HH:MM; "" when the message leaves it open. */
  when: string
  where: string
}

export interface MailSummary {
  summary: string[]
  actions: SummaryAction[]
  questions: SummaryQuestion[]
  dates: SummaryDate[]
}

/** The answer to a summary request: the summary, or null with the answer of the model when it could not be read; `service` names the AI service. */
export type SummaryResponse = { ok: true; service: string; summary: MailSummary | null; raw: string } | { ok: false; service?: string; error: string }

/** The value of `who` that stands for the reader. */
export const SUMMARY_ME = "me"
