/** Dictionary packs as the build tools write them, and a GitHub Releases stand-in serving them. */
import { gzipSync } from "node:zlib"
import { vi } from "vitest"
import type { IndexedPack } from "../../src/background/dictionary/download"
import { jsonResponse, sha256Hex } from "../helpers"

/** Pack text: header, `w` entries, `f` forms. */
export function tsv(src: string, tgt: string, entries: Record<string, string>, forms: Record<string, string> = {}): string {
  return [
    `#dict\t${src}\t${tgt}\t20261011\tTest source\tMIT`,
    ...Object.entries(entries).map(([k, v]) => `w\t${k}\t${v}`),
    ...Object.entries(forms).map(([k, v]) => `f\t${k}\t${v}`),
    "",
  ].join("\n")
}

export const gz = (text: string) => new Uint8Array(gzipSync(Buffer.from(text, "utf8")))

/** dict-index.json entry of a pack text, named dict-<src>-<tgt>.tsv.gz. */
export function packEntry(text: string, over: Partial<IndexedPack> = {}): IndexedPack {
  const [, src = "", tgt = ""] = text.slice(0, text.indexOf("\n")).split("\t")
  const data = gz(text)
  const count = (type: string) => text.split("\n").filter((l) => l.startsWith(`${type}\t`)).length
  return {
    src,
    tgt,
    file: `dict-${src}-${tgt}.tsv.gz`,
    bytes: data.byteLength,
    rawBytes: text.length,
    entries: count("w"),
    forms: count("f"),
    sha256: sha256Hex(data),
    source: "Test source",
    license: "MIT",
    attribution: "Test contributors; MIT",
    ...over,
  }
}

/** GitHub Releases stand-in: dict-index.json lists `texts`, each file is served gzipped with its length; other files are 404. */
export function releaseServer(texts: string[]) {
  const files = new Map(texts.map((t) => [packEntry(t).file, t]))
  return vi.fn(async (url: string) => {
    const file = decodeURIComponent(url.split("/").at(-1)!)
    if (file === "dict-index.json") return jsonResponse({ version: 1, packs: texts.map((t) => packEntry(t)) })
    const text = files.get(file)
    if (text === undefined) return new Response("Not Found", { status: 404 })
    const data = gz(text)
    return new Response(data, { headers: { "content-length": String(data.byteLength) } })
  })
}
