/** The settings page opened at a place, in the tab that shows it already when there is one. */

import { ext } from "./ext"
import { type OptionsPlace, optionsPath } from "./messages"

/**
 * Show the settings page at `place`: the tab with the page comes to the front and goes there (a new hash moves the
 * page without a reload), otherwise a new tab opens. Clicking a link to the settings twice opens one tab.
 */
export async function openOptionsAt(place: OptionsPlace): Promise<void> {
  const url = ext.runtime.getURL(optionsPath(place))
  const open = await ext.tabs.query({ url: `${ext.runtime.getURL("options.html")}*` }).catch(() => [])
  const tab = open.find((t) => t.id !== undefined)
  if (tab) await ext.tabs.update(tab.id!, { url, active: true })
  else await ext.tabs.create({ url })
}
