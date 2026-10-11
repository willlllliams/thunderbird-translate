/** The welcome page opens once, after a new installation; updates of the extension or of Thunderbird do not open it. */

import { ext } from "../shared/ext"

export function openWelcomeOnInstall(details: { reason: string }): Promise<unknown> | undefined {
  if (details.reason !== "install") return undefined
  return ext.tabs.create({ url: ext.runtime.getURL("welcome.html") })
}
