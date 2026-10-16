/*
 * WebExtension Experiment "e2eCapture" of the end-to-end test build (scripts/build.mjs --e2e): a PNG image of a
 * Thunderbird window with everything it shows, the message list, the message header and the content of extension
 * pages included, for the screenshots of npm run e2e. No other build contains it.
 */

/* global ChromeUtils, Services */
"use strict"

var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs")

var e2eCapture = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return {
      e2eCapture: {
        async window(windowType) {
          const win = Services.wm.getMostRecentWindow(windowType)
          if (!win) throw new Error(`no window of type ${windowType}`)
          const image = await win.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "white")
          const canvas = new win.OffscreenCanvas(image.width, image.height)
          canvas.getContext("bitmaprenderer").transferFromImageBitmap(image)
          const blob = await canvas.convertToBlob({ type: "image/png" })
          return await new Promise((resolve, reject) => {
            const reader = new win.FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
        },
      },
    }
  }
}
