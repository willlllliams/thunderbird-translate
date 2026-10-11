/**
 * Dictionary packs: one gzip-compressed TSV file per direction,
 * dict-<src>-<tgt>.tsv.gz, UTF-8 with "\n" line ends.
 *
 *   #dict <src> <tgt> <packVersion> <sourceName> <license>   header (tab-separated)
 *   w <key> <translation>                                     entry
 *   f <key> <lemmaKey>                                        inflected form → its lemma
 *
 * Keys are NFC, lower-cased with the rules of the source language and
 * trimmed; a key may be a phrase of several words.
 */

import { LocalizedError } from "../../shared/errors"
import { baseLang } from "../../shared/languages"

/** Language codes of the packs. */
export const DICT_LANGS = ["en", "zh-Hans", "zh-Hant", "ja", "ko", "fr", "de", "es", "pt", "ru", "tr", "vi"]

/** Pack language of a language code of the extension ("zh-CN") or of a detector ("zh", "zh-TW", "pt-BR"); null when no pack has it. */
export function dictLang(code: string): string | null {
  const lower = code.toLowerCase()
  const base = baseLang(lower)
  if (base === "zh") return /hant|tw|hk|mo/.test(lower) ? "zh-Hant" : "zh-Hans"
  return DICT_LANGS.includes(base) ? base : null
}

/** Language code of the extension for a pack language, for language names in the interface. */
export function appLang(dict: string): string {
  if (dict === "zh-Hans") return "zh-CN"
  return dict === "zh-Hant" ? "zh-TW" : dict
}

export function dictKey(text: string, lang: string): string {
  return text.normalize("NFC").toLocaleLowerCase(lang).trim()
}

export interface DictPack {
  src: string
  tgt: string
  version: string
  source: string
  license: string
  entries: Map<string, string>
  /** Inflected form → key of its lemma. */
  forms: Map<string, string>
}

export function parsePack(text: string): DictPack {
  const lines = text.split("\n")
  const header = lines[0].split("\t")
  if (header[0] !== "#dict" || header.length < 6) throw new LocalizedError("errDictionaryFormat")
  const [, src, tgt, version, source, license] = header
  const entries = new Map<string, string>()
  const forms = new Map<string, string>()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const a = line.indexOf("\t")
    const b = line.indexOf("\t", a + 1)
    if (a !== 1 || b < 0) continue
    const map = line[0] === "w" ? entries : line[0] === "f" ? forms : null
    map?.set(line.slice(a + 1, b), line.slice(b + 1))
  }
  return { src, tgt, version, source, license, entries, forms }
}

export function gunzip(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data))
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")
}
