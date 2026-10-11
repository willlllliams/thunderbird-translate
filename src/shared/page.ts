/** Helpers shared by the popup and the settings page. */

import { ext } from "./ext"
import type { BackgroundRequest } from "./messages"

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export function send<T>(req: BackgroundRequest): Promise<T> {
  return ext.runtime.sendMessage(req) as Promise<T>
}

/** Replace a select's options, keeping the selected value. */
export function fillSelect(select: HTMLSelectElement, options: HTMLOptionElement[], value: string): void {
  select.replaceChildren(...options)
  select.value = value
}
