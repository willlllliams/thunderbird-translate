// Writes e2e/fixtures/image.eml, the message of the image runs of e2e/run.mjs: node e2e/make-image-eml.mjs
//
// The message holds what the filters of image translation have to tell apart. Thunderbird numbers the parts from
// the top multipart/mixed, which is part 1: the multipart/related is 1.1, its HTML 1.1.1, the attachment 1.2.
// - part 1.1.2, a chart (cid:, PNG, 400 × 200) and part 1.2, a receipt attached as an image (PNG, 300 × 300): the two
//   images that get a button;
// - part 1.1.3, a tracking pixel (1 × 1): left out by the content script;
// - part 1.1.4, an animated GIF (two frames on a 200 × 200 screen, with a comment that makes the file larger than the
//   smallest file of the settings): left out by the background script, which reads the frames;
// - part 1.1.5, a logo in the signature (240 × 240): left out by the content script;
// - part 1.1.6, a notice (PNG, 320 × 160) without Content-Disposition, which Thunderbird 128 lists among no attachments:
//   its bytes are read all the same. It comes after the GIF, so in "image-auto" (one image per message, the first two
//   images peeked at) it gets its button without being read.
// The pixels are deterministic, so the file is the same on every run.
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { noise, png } from "./png.mjs"

/** Bars with labels as dark boxes on white, and rows of noise, so the file is larger than a plain drawing. */
const chart = png(400, 200, (x, y) => {
  if (y < 6) return [noise(x, y), noise(y, x), noise(x + y, x)]
  if (y > 30 && y < 40 && x > 20 && x < 220) return [30, 30, 30]
  const bar = Math.floor((x - 40) / 70)
  if (x > 40 && (x - 40) % 70 < 40 && y > 190 - (bar + 1) * 30 && y < 190) return [70, 110, 200]
  return [255, 255, 255]
})
const receipt = png(300, 300, (x, y) => (y < 24 ? [noise(x, y), noise(x, y + 1), noise(x + 1, y)] : y % 24 < 6 && x > 20 && x < 20 + ((y * 7) % 240) ? [20, 20, 20] : [250, 250, 245]))
const pixel = png(1, 1, () => [255, 255, 255])
const notice = png(320, 160, (x, y) => (y < 8 ? [noise(x, y), noise(y, x), noise(x, x + y)] : y > 60 && y < 90 && x > 20 && x < 300 ? [180, 30, 30] : [255, 250, 240]))
const logo = png(240, 240, (x, y) => ((x - 120) ** 2 + (y - 120) ** 2 < 90 ** 2 ? [200, 60, 60] : [255, 255, 255]))

/** A GIF with two 1 × 1 frames on a 200 × 200 screen and a comment of 5000 bytes. */
function animatedGif() {
  const bytes = [...Buffer.from("GIF89a"), 200, 0, 200, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255]
  // Comment extension: sub-blocks of 250 bytes.
  bytes.push(0x21, 0xfe)
  for (let i = 0; i < 20; i++) bytes.push(250, ...new Array(250).fill(0x2e))
  bytes.push(0)
  for (let frame = 0; frame < 2; frame++) {
    // Graphic control extension with a delay of 0.5 s, then a 1 × 1 image: clear, pixel 0, end (LZW, minimum code size 2).
    bytes.push(0x21, 0xf9, 4, 0, 50, 0, 0, 0)
    bytes.push(0x2c, frame, 0, frame, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0)
  }
  bytes.push(0x3b)
  return Buffer.from(bytes)
}

const base64 = (data) => data.toString("base64").replace(/.{76}/g, "$&\n")
const part = (type, name, data, headers) => `Content-Type: ${type}; name="${name}"\nContent-Transfer-Encoding: base64\n${headers}\n\n${base64(data)}\n`

const html = `<html>
<head><meta charset="utf-8"></head>
<body>
<p>Hello Bob, the chart below shows the quarterly revenue of the new product line in the three regions.</p>
<p><img src="cid:chart@e2e.example" alt="Quarterly revenue"></p>
<p>The receipt for the client dinner is attached; please check the total amount before Friday.</p>
<p><img src="cid:pixel@e2e.example" alt=""></p>
<p><img src="cid:spinner@e2e.example" alt="Loading"></p>
<p><img src="cid:notice@e2e.example" alt="Notice"></p>
<div class="moz-signature">-- <br>Alice Walker<br><img src="cid:logo@e2e.example" alt="Logo"></div>
</body>
</html>`

const eml = `From: Alice Walker <alice@example.com>
To: Bob Stone <bob@example.com>
Subject: Quarterly chart and the dinner receipt
Date: Mon, 12 Oct 2026 10:00:00 +0000
Message-ID: <tt-e2e-image@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="tt-mixed"

--tt-mixed
Content-Type: multipart/related; boundary="tt-related"

--tt-related
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 8bit

${html}
--tt-related
${part("image/png", "chart.png", chart, "Content-ID: <chart@e2e.example>\nContent-Disposition: inline; filename=\"chart.png\"")}--tt-related
${part("image/png", "pixel.png", pixel, "Content-ID: <pixel@e2e.example>")}--tt-related
${part("image/gif", "spinner.gif", animatedGif(), "Content-ID: <spinner@e2e.example>")}--tt-related
${part("image/png", "logo.png", logo, "Content-ID: <logo@e2e.example>")}--tt-related
${part("image/png", "notice.png", notice, "Content-ID: <notice@e2e.example>")}--tt-related--

--tt-mixed
${part("image/png", "receipt.png", receipt, "Content-Disposition: attachment; filename=\"receipt.png\"")}--tt-mixed--
`

const out = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "image.eml")
writeFileSync(out, eml)
console.log(`${out}: ${eml.length} bytes; chart ${chart.length}, receipt ${receipt.length}, GIF ${animatedGif().length} bytes`)
