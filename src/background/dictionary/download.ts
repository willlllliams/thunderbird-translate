/**
 * Dictionary packs on GitHub Releases: the index dict-index.json and one
 * file per direction, under
 * https://github.com/willlllliams/thunderbird-translate/releases/download/<tag>/<file>.
 * Used by the settings page; the installed packs go to DictionaryStore.
 */

import { LocalizedError } from "../../shared/errors"
import { fetchOk } from "../queue/request-queue"
import { gunzip, parsePack, sha256Hex } from "./format"
import { type DictionaryStore, packId } from "./store"

const RELEASES = "https://github.com/willlllliams/thunderbird-translate/releases/download"

export function releaseUrl(tag: string, file: string): string {
  return `${RELEASES}/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`
}

/** One entry of dict-index.json. */
export interface IndexedPack {
  src: string
  tgt: string
  file: string
  /** Size of the compressed file. */
  bytes: number
  /** Size of the uncompressed TSV. */
  rawBytes: number
  entries: number
  forms: number
  sha256: string
  source: string
  license: string
  attribution: string
}

const STRING_FIELDS = ["src", "tgt", "file", "sha256", "source", "license", "attribution"] as const
const NUMBER_FIELDS = ["bytes", "rawBytes", "entries", "forms"] as const

function isIndexedPack(value: unknown): value is IndexedPack {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return STRING_FIELDS.every((k) => typeof o[k] === "string") && NUMBER_FIELDS.every((k) => typeof o[k] === "number")
}

export async function fetchDictionaryIndex(tag: string, fetchFn: typeof fetch = fetch): Promise<IndexedPack[]> {
  const url = releaseUrl(tag, "dict-index.json")
  const resp = await fetchOk(fetchFn, { url, init: { method: "GET", headers: {} } }, "GitHub")
  const json = (await resp.json().catch(() => null)) as { version?: unknown; packs?: unknown } | null
  if (json?.version !== 1 || !Array.isArray(json.packs)) throw new LocalizedError("errUnexpectedResponse", ["dict-index.json"])
  return json.packs.filter(isIndexedPack)
}

export interface DownloadOptions {
  fetchFn?: typeof fetch
  /** Bytes received so far and the expected total. */
  onProgress?: (loaded: number, total: number) => void
}

/** Download a pack, check its SHA-256 and its content, and store it. */
export async function installPack(pack: IndexedPack, tag: string, store: DictionaryStore, { fetchFn = fetch, onProgress }: DownloadOptions = {}): Promise<void> {
  const resp = await fetchOk(fetchFn, { url: releaseUrl(tag, pack.file), init: { method: "GET", headers: {} } }, "GitHub")
  const total = Number(resp.headers.get("content-length")) || pack.bytes
  const chunks: Uint8Array[] = []
  let loaded = 0
  const reader = resp.body!.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.(loaded, total)
  }
  const data = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  if ((await sha256Hex(data)) !== pack.sha256.toLowerCase()) throw new LocalizedError("errDictionaryChecksum", [pack.file])
  const parsed = parsePack(await gunzip(data))
  if (parsed.src !== pack.src || parsed.tgt !== pack.tgt) throw new LocalizedError("errDictionaryFormat")
  await store.put(
    {
      id: packId(pack.src, pack.tgt),
      src: pack.src,
      tgt: pack.tgt,
      version: parsed.version,
      source: pack.source,
      license: pack.license,
      attribution: pack.attribution,
      bytes: loaded,
      entries: parsed.entries.size,
      forms: parsed.forms.size,
    },
    data.buffer,
  )
}
