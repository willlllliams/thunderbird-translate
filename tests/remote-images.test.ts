// @vitest-environment jsdom
/**
 * The remote images of a displayed message (background/remote-images.ts): the addresses the HTML of a message names,
 * the request of one image with its options, its timeout and its size limit, and the way the popup is opened to ask
 * for the access; the address of a remote image as the content script reads it (shared/image.ts).
 */
import { describe, expect, it, vi } from "vitest"
import { fetchRemoteImage, HeldImages, imageUrlsOf, messageImageUrls, offerRemoteAccess, readableHost, REMOTE_MAX_BYTES, RemoteImages, srcsetUrls } from "../src/background/remote-images"
import { messageImageAddresses } from "../src/background/displayed"
import { imageSource, remoteImageUrl, sniffImageType } from "../src/shared/image"

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html")

/** A response with `chunks` as its body, read one chunk at a time; `cancel` records that the body was dropped; `url`: its final address after redirects. */
function streamed(chunks: Uint8Array[], headers: Record<string, string> = { "content-type": "image/png" }, status = 200, url?: string) {
  const cancel = vi.fn()
  let at = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at < chunks.length) controller.enqueue(chunks[at++])
      else controller.close()
    },
    cancel,
  })
  const response = new Response(body, { status, headers })
  if (url) Object.defineProperties(response, { url: { value: url }, redirected: { value: true } })
  return { response, cancel }
}

describe("the address of a remote image", () => {
  it("is http or https with a host, without a user name or password", () => {
    expect(remoteImageUrl("https://cdn.example.com/a b.png")).toBe("https://cdn.example.com/a%20b.png")
    expect(remoteImageUrl("HTTP://Example.COM/x.png")).toBe("http://example.com/x.png")
    for (const src of ["https://user:pw@example.com/a.png", "https://user@example.com/a.png", "ftp://example.com/a.png", "data:image/png;base64,AA", "mailbox:///x?part=1.2", "not a url"]) expect(remoteImageUrl(src)).toBeNull()
    expect(imageSource("https://example.com/r.png")).toEqual({ kind: "remote", url: "https://example.com/r.png" })
    // An address with credentials is no source the extension reads.
    expect(imageSource("https://user:pw@example.com/r.png")).toEqual({ kind: "other" })
  })
})

describe("the addresses of the images of a message", () => {
  it("collects src and every srcset candidate of img and picture, resolved against <base href>", () => {
    const doc = parse(`<base href="https://news.example.com/mail/">
      <img src="https://cdn.example.com/a.png?x=1&amp;y=2">
      <img src="b.png" srcset="c.png 1x, https://cdn.example.com/d.png 2x">
      <picture><source srcset="https://cdn.example.com/e.webp"><img src="f.png"></picture>
      <img src="data:image/png;base64,AA"><img src="cid:x@y"><img src="https://u:p@example.com/g.png"><img><a href="https://example.com/h.png">h</a>`)
    expect([...imageUrlsOf(doc)].sort()).toEqual(
      ["https://cdn.example.com/a.png?x=1&y=2", "https://news.example.com/mail/b.png", "https://news.example.com/mail/c.png", "https://cdn.example.com/d.png", "https://cdn.example.com/e.webp", "https://news.example.com/mail/f.png"].sort(),
    )
    // Without a base, a relative address names nothing the extension reads.
    expect([...imageUrlsOf(parse(`<img src="b.png"><img src="http://example.com/a.png">`))]).toEqual(["http://example.com/a.png"])
  })

  it("A11: reads srcset by the rules of HTML: a comma inside an address belongs to it", () => {
    expect(srcsetUrls("https://res.cloudinary.com/x/image/upload/w_600,c_fill/a.jpg 2x, b.jpg 1x")).toEqual(["https://res.cloudinary.com/x/image/upload/w_600,c_fill/a.jpg", "b.jpg"])
    // Without white space the commas are part of one address, as Gecko reads it; commas at the end of an address end it.
    expect(srcsetUrls("a.png,b.png 2x")).toEqual(["a.png,b.png"])
    expect(srcsetUrls("a.png, b.png,, c.png,")).toEqual(["a.png", "b.png", "c.png"])
    // Descriptors up to the comma, also one in parentheses; white space and commas alone name nothing.
    expect(srcsetUrls(" a.png 640w (x, y), b.png 2x ")).toEqual(["a.png", "b.png"])
    expect(srcsetUrls(" , ,")).toEqual([])
    const doc = parse(`<img srcset="https://res.cloudinary.com/x/image/upload/w_600,c_fill/a.jpg 2x">`)
    expect([...imageUrlsOf(doc)]).toEqual(["https://res.cloudinary.com/x/image/upload/w_600,c_fill/a.jpg"])
  })

  it("reads every HTML part of the message, nested in multiparts, and no other part", () => {
    const message = {
      contentType: "multipart/mixed",
      parts: [
        { contentType: "multipart/alternative", parts: [{ contentType: "text/plain", body: '<img src="https://example.com/plain.png">' }, { contentType: "text/html", body: '<img src="https://example.com/a.png">' }] },
        { contentType: "TEXT/HTML", body: '<img src="https://example.com/b.png">' },
        { contentType: "image/png" },
      ],
    }
    expect([...messageImageUrls(message, parse)].sort()).toEqual(["https://example.com/a.png", "https://example.com/b.png"])
    expect(messageImageUrls({ contentType: "text/plain", body: "https://example.com/a.png" }, parse).size).toBe(0)
  })

  it("reads the message through messages.getFull() and parses its HTML without loading anything", async () => {
    const getFull = vi.fn(async (_id: number) => ({ contentType: "multipart/alternative", parts: [{ contentType: "text/html", body: '<img src="https://example.com/a.png">' }] }))
    vi.stubGlobal("browser", { messages: { getFull } })
    expect([...(await messageImageAddresses(5))]).toEqual(["https://example.com/a.png"])
    expect(getFull).toHaveBeenCalledWith(5)
  })
})

describe("the request of a remote image", () => {
  const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

  it("A2: asks without cookies and referrer, follows the rules of the HTTP cache, and joins the chunks", async () => {
    const { response } = streamed([bytes(3, 1), bytes(2, 2)], { "content-type": "image/PNG; charset=binary" })
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response)
    expect(await fetchRemoteImage("https://cdn.example.com/a.png", { fetchFn })).toEqual({ bytes: new Uint8Array([1, 1, 1, 2, 2]), type: "image/png" })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe("https://cdn.example.com/a.png")
    expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "default", referrerPolicy: "no-referrer", redirect: "follow" })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("reads no other scheme and drops an answer that is no image or no success", async () => {
    const fetchFn = vi.fn(async () => new Response("x", { headers: { "content-type": "image/png" } }))
    expect(await fetchRemoteImage("file:///etc/passwd", { fetchFn })).toBeNull()
    expect(await fetchRemoteImage("https://u:p@example.com/a.png", { fetchFn })).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    const html = streamed([bytes(3)], { "content-type": "text/html" })
    expect(await fetchRemoteImage("https://example.com/a", { fetchFn: async () => html.response })).toBeNull()
    expect(html.cancel).toHaveBeenCalled()
    expect(await fetchRemoteImage("https://example.com/a", { fetchFn: async () => streamed([bytes(3)], { "content-type": "image/png" }, 404).response })).toBeNull()
    expect(await fetchRemoteImage("https://example.com/a", { fetchFn: async () => Promise.reject(new TypeError("NetworkError")) })).toBeNull()
  })

  it("A1: reads no host of this computer or the local network, at the address or after a redirect", async () => {
    const fetchFn = vi.fn(async () => streamed([bytes(3)]).response)
    for (const url of ["http://127.0.0.1/x.png", "http://10.0.0.5/cam.jpg", "http://[::1]/x.png", "http://printer.local/x.png", "http://intranet/x.png"]) expect(await fetchRemoteImage(url, { fetchFn })).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    // A public address that redirects into the local network: the answer is dropped, and its body is not read.
    for (const final of ["http://127.0.0.1/x.png", "http://192.168.0.2/x.png", "http://[::1]/x.png", "http://printer.local/x.png"]) {
      const redirected = streamed([bytes(3)], { "content-type": "image/png" }, 200, final)
      expect(await fetchRemoteImage("https://cdn.example.com/a.png", { fetchFn: async () => redirected.response })).toBeNull()
      expect(redirected.cancel).toHaveBeenCalled()
    }
    // A redirect to another public host is followed.
    const elsewhere = streamed([bytes(3)], { "content-type": "image/png" }, 200, "https://img.example.net/a.png")
    expect(await fetchRemoteImage("https://cdn.example.com/a.png", { fetchFn: async () => elsewhere.response })).toEqual({ bytes: bytes(3), type: "image/png" })
    // The e2e build names its mock server on this computer; nothing else there.
    const local = streamed([bytes(3)], { "content-type": "image/png" }, 200, "http://127.0.0.1:8123/remote/offer.png")
    expect(await fetchRemoteImage("http://127.0.0.1:8123/remote/offer.png", { fetchFn: async () => local.response, localOrigin: "http://127.0.0.1:8123" })).toEqual({ bytes: bytes(3), type: "image/png" })
    expect([readableHost("http://127.0.0.1:8124/x.png", "http://127.0.0.1:8123"), readableHost("not a url", "http://127.0.0.1:8123"), readableHost("https://cdn.example.com/x.png")]).toEqual([false, false, true])
  })

  it("A12: reads an answer without a media type or with octet-stream by its first bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    for (const headers of [{ "content-type": "application/octet-stream" }, {} as Record<string, string>]) {
      expect(await fetchRemoteImage("https://cdn.example.com/a", { fetchFn: async () => streamed([png], headers).response })).toEqual({ bytes: png, type: "image/png" })
    }
    const html = new TextEncoder().encode("<html>")
    expect(await fetchRemoteImage("https://cdn.example.com/a", { fetchFn: async () => streamed([html], { "content-type": "application/octet-stream" }).response })).toBeNull()
    // Another declared type is not read at all.
    const json = streamed([png], { "content-type": "application/json" })
    expect(await fetchRemoteImage("https://cdn.example.com/a", { fetchFn: async () => json.response })).toBeNull()
    expect(json.cancel).toHaveBeenCalled()
    const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))
    expect([sniffImageType(ascii("GIF89a")), sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), sniffImageType(ascii("RIFF\0\0\0\0WEBPVP8 ")), sniffImageType(ascii("RIFF\0\0\0\0WAVE")), sniffImageType(new Uint8Array())]).toEqual([
      "image/gif",
      "image/jpeg",
      "image/webp",
      null,
      null,
    ])
  })

  it("drops a larger image by its Content-Length before reading, and while reading once the bytes pass the limit", async () => {
    const declared = streamed([bytes(10)], { "content-type": "image/jpeg", "content-length": String(REMOTE_MAX_BYTES + 1) })
    expect(await fetchRemoteImage("https://example.com/a.jpg", { fetchFn: async () => declared.response })).toBe("large")
    expect(declared.cancel).toHaveBeenCalled()
    // No Content-Length: the third chunk passes the limit of 10 bytes, and the reading stops there.
    const endless = streamed([bytes(4), bytes(4), bytes(4), bytes(4)], { "content-type": "image/jpeg" })
    expect(await fetchRemoteImage("https://example.com/b.jpg", { fetchFn: async () => endless.response, maxBytes: 10 })).toBe("large")
    // Exactly at the limit is read.
    expect(await fetchRemoteImage("https://example.com/c.jpg", { fetchFn: async () => streamed([bytes(5), bytes(5)], { "content-type": "image/jpeg", "content-length": "10" }).response, maxBytes: 10 })).toEqual({ bytes: bytes(10), type: "image/jpeg" })
  })

  it("gives up after the timeout, and throws when the content script went away", async () => {
    const hanging = (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))
    expect(await fetchRemoteImage("https://example.com/slow.png", { fetchFn: hanging, timeoutMs: 20 })).toBeNull()
    const gone = new AbortController()
    const request = fetchRemoteImage("https://example.com/slow.png", { fetchFn: hanging, signal: gone.signal, timeoutMs: 10_000 })
    gone.abort()
    await expect(request).rejects.toBeDefined()
    // A body that stops in the middle: the timeout errors it, as fetch() does.
    const slowBody = async (_url: string | URL | Request, init?: RequestInit) => {
      const stalled = new ReadableStream<Uint8Array>({
        start: (c) => {
          c.enqueue(bytes(2))
          init?.signal?.addEventListener("abort", () => c.error(new DOMException("The operation timed out.", "TimeoutError")))
        },
      })
      return new Response(stalled, { headers: { "content-type": "image/png" } })
    }
    expect(await fetchRemoteImage("https://example.com/stalled.png", { fetchFn: slowBody, timeoutMs: 20 })).toBeNull()
  })
})

describe("the bytes kept from a peek", () => {
  const original = (n: number) => ({ bytes: new Uint8Array(n), type: "image/png" })

  it("A6: hold at most the limit of a session and the limit of all, dropping the oldest of the other sessions first", () => {
    const held = new HeldImages(10, 16)
    const [a, b] = [{}, {}]
    held.hold(a, "1", original(6))
    held.hold(a, "1", original(6))
    held.hold(a, "2", original(6))
    // The second image of the session would pass its limit of 10.
    expect([held.get(a, "1")?.bytes.length, held.get(a, "2"), held.size]).toEqual([6, undefined, 6])
    held.hold(a, "3", original(4))
    held.hold(b, "1", original(8))
    // 18 of 16: the oldest image of the other session goes.
    expect([held.get(a, "1"), held.get(a, "3")?.bytes.length, held.get(b, "1")?.bytes.length, held.size]).toEqual([undefined, 4, 8, 12])
    // An image larger than all is not kept.
    held.hold(b, "2", original(20))
    held.hold(b, "3", original(2))
    expect([held.get(b, "2"), held.get(b, "3")?.bytes.length, held.size]).toEqual([undefined, 2, 14])
    // Room for a new image of the first session: the oldest image of the other one goes, never one of its own.
    held.hold(a, "4", original(5))
    expect([held.get(b, "1"), held.get(a, "3")?.bytes.length, held.get(a, "4")?.bytes.length, held.size]).toEqual([undefined, 4, 5, 11])
    held.release(b, "3")
    held.release(b, "nothing")
    expect(held.size).toBe(9)
    held.clear(a)
    expect([held.get(a, "3"), held.size]).toEqual([undefined, 0])
    // Only the images of the session itself would make room: the new one is not kept.
    const tight = new HeldImages(10, 8)
    tight.hold(a, "1", original(5))
    tight.hold(a, "2", original(4))
    expect([tight.get(a, "2"), tight.size]).toEqual([undefined, 5])
  })

  it("A7: are read two at a time per message, so another message does not wait for a slow server", async () => {
    const waiting: (() => void)[] = []
    const fetchFn = vi.fn(async () => {
      await new Promise<void>((resolve) => waiting.push(resolve))
      return streamed([new Uint8Array([1])]).response
    })
    const urls = ["https://cdn.example.com/1.png", "https://cdn.example.com/2.png", "https://cdn.example.com/3.png"]
    const held = new HeldImages()
    const slow = new RemoteImages({ imageUrls: async () => new Set(urls), fetchFn: fetchFn as unknown as typeof fetch, held })
    const signal = new AbortController().signal
    const reads = urls.map((url) => slow.bytes(1, url, signal))
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    // Another message reads at once.
    const other = new RemoteImages({ imageUrls: async () => new Set(urls), fetchFn: async () => streamed([new Uint8Array([2])]).response, held })
    expect(await other.bytes(2, urls[0], signal)).toEqual({ bytes: new Uint8Array([2]), type: "image/png" })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    waiting.shift()!()
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3))
    for (const resolve of waiting.splice(0)) resolve()
    expect((await Promise.all(reads)).map((r) => r && r !== "large" && r.bytes[0])).toEqual([1, 1, 1])
    // Without the addresses of the message nothing is read.
    expect(await new RemoteImages({ held }).bytes(1, urls[0], signal)).toBeNull()
  })
})

describe("the access to remote images", () => {
  it("opens the popup of the window, else the settings page", async () => {
    const openPopup = vi.fn(async () => true)
    const openOptions = vi.fn(async () => {})
    await offerRemoteAccess(3, { openPopup, openOptions })
    expect(openPopup).toHaveBeenCalledWith(3)
    expect(openOptions).not.toHaveBeenCalled()
    // The button is not in a toolbar, or the call fails.
    await offerRemoteAccess(undefined, { openPopup: async () => false, openOptions })
    await offerRemoteAccess(3, { openPopup: async () => Promise.reject(new Error("no window")), openOptions })
    expect(openOptions).toHaveBeenCalledTimes(2)
    // A failing settings page is no error.
    await expect(offerRemoteAccess(3, { openPopup: async () => false, openOptions: async () => Promise.reject(new Error("closed")) })).resolves.toBeUndefined()
  })
})
