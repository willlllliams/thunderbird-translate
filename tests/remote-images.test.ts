// @vitest-environment jsdom
/**
 * The remote images of a displayed message (background/remote-images.ts): the addresses the HTML of a message names,
 * the request of one image with its options, its timeout and its size limit, and the way the popup is opened to ask
 * for the access; the address of a remote image as the content script reads it (shared/image.ts).
 */
import { describe, expect, it, vi } from "vitest"
import { fetchRemoteImage, imageUrlsOf, messageImageUrls, offerRemoteAccess, REMOTE_MAX_BYTES } from "../src/background/remote-images"
import { imageSource, remoteImageUrl } from "../src/shared/image"

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html")

/** A response with `chunks` as its body, read one chunk at a time; `cancel` records that the body was dropped. */
function streamed(chunks: Uint8Array[], headers: Record<string, string> = { "content-type": "image/png" }, status = 200) {
  const cancel = vi.fn()
  let at = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at < chunks.length) controller.enqueue(chunks[at++])
      else controller.close()
    },
    cancel,
  })
  return { response: new Response(body, { status, headers }), cancel }
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
})

describe("the request of a remote image", () => {
  const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

  it("asks without cookies and referrer, lets the HTTP cache answer, and joins the chunks", async () => {
    const { response } = streamed([bytes(3, 1), bytes(2, 2)], { "content-type": "image/PNG; charset=binary" })
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response)
    expect(await fetchRemoteImage("https://cdn.example.com/a.png", { fetchFn })).toEqual({ bytes: new Uint8Array([1, 1, 1, 2, 2]), type: "image/png" })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe("https://cdn.example.com/a.png")
    expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer", redirect: "follow" })
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
