/**
 * Dictionary packs on GitHub Releases: the index dict-index.json and one
 * file per direction, under
 * https://github.com/willlllliams/thunderbird-translate/releases/download/<tag>/<file>.
 * Used by the settings page; the installed packs go to DictionaryStore.
 */

import { IDLE_TIMEOUT_MS, idleSignal, LIST_TIMEOUT_MS, readBody, sha256Hex } from "../../shared/download"
import { LocalizedError } from "../../shared/errors"
import { pairKey } from "../../shared/languages"
import { fetchOk } from "../queue/request-queue"
import { gunzip, parsePack } from "./format"
import type { DictionaryStore } from "./store"

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

export async function fetchDictionaryIndex(tag: string, fetchFn: typeof fetch = fetch, timeoutMs = LIST_TIMEOUT_MS): Promise<IndexedPack[]> {
  const url = releaseUrl(tag, "dict-index.json")
  const resp = await fetchOk({ fetchFn, timeoutMs }, { url, init: { method: "GET", headers: {} } }, "GitHub")
  const json = (await resp.json().catch(() => null)) as { version?: unknown; packs?: unknown } | null
  if (json?.version !== 1 || !Array.isArray(json.packs)) throw new LocalizedError("errUnexpectedResponse", ["dict-index.json"])
  return json.packs.filter(isIndexedPack)
}

export interface DownloadOptions {
  fetchFn?: typeof fetch
  /** Bytes received so far and the expected total. */
  onProgress?: (loaded: number, total: number) => void
  /** Cancels the download. */
  signal?: AbortSignal
  /** The download fails when nothing arrives for this long. */
  idleMs?: number
}

/** The file of a pack; fails when nothing arrives for `idleMs`, however long the whole download takes. */
async function downloadPack(url: string, fallbackTotal: number, { fetchFn = fetch, onProgress, signal, idleMs = IDLE_TIMEOUT_MS }: DownloadOptions): Promise<Uint8Array<ArrayBuffer>> {
  const idle = idleSignal(idleMs, signal)
  try {
    const resp = await fetchOk({ fetchFn }, { url, init: { method: "GET", headers: {}, signal: idle.signal } }, "GitHub")
    const total = Number(resp.headers.get("content-length")) || fallbackTotal
    return await readBody(
      resp,
      (loaded) => {
        idle.kick()
        onProgress?.(loaded, total)
      },
      idle.signal,
    )
  } catch (error) {
    throw idle.stalled() ? new LocalizedError("errDownloadStalled", ["GitHub", String(Math.round(idleMs / 1000))]) : error
  } finally {
    idle.stop()
  }
}

/** Download a pack, check its SHA-256 and its content, and store it. */
export async function installPack(pack: IndexedPack, tag: string, store: DictionaryStore, options: DownloadOptions = {}): Promise<void> {
  const data = await downloadPack(releaseUrl(tag, pack.file), pack.bytes, options)
  if ((await sha256Hex(data)) !== pack.sha256.toLowerCase()) throw new LocalizedError("errDictionaryChecksum", [pack.file])
  const parsed = parsePack(await gunzip(data))
  if (parsed.src !== pack.src || parsed.tgt !== pack.tgt) throw new LocalizedError("errDictionaryFormat")
  await store.put(
    {
      id: pairKey(pack.src, pack.tgt),
      src: pack.src,
      tgt: pack.tgt,
      version: parsed.version,
      source: pack.source,
      license: pack.license,
      attribution: pack.attribution,
      bytes: data.byteLength,
      entries: parsed.entries.size,
      forms: parsed.forms.size,
    },
    data.buffer,
  )
}
