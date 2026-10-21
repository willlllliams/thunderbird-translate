/**
 * Dictionary translation: word by word with the installed packs.
 *
 * A paragraph is split into words with Intl.Segmenter. At every word the
 * longest phrase of up to three words that has an entry wins; a word without
 * an entry is looked up through its lemma (the pack's inflected forms) and
 * otherwise stays as it is. Punctuation and numbers stay as they are.
 * Between two languages other than English, the text goes through English
 * when both packs are installed. Between Simplified and Traditional Chinese
 * that would replace words by English glosses, so the dictionary refuses
 * the pair. Packs are read from IndexedDB on first use and released after a
 * while without translations; a pack that is not installed is looked for
 * again by the next batch, since it may be installed meanwhile. A paragraph without its packs fails with the
 * packs to download (see shared/offline-needs.ts), unless the release offers
 * none for the pair, its index has not been read yet, or the language of
 * the paragraph was a guess.
 */

import { LocalizedError, MissingDataError } from "../../shared/errors"
import { hashText } from "../../shared/hash"
import { detectSourceLanguage, type LanguageDetector } from "../../shared/lang-detect"
import { baseLang, dictLang, isChinesePair, pairKey } from "../../shared/languages"
import { type Catalog, type PairNeeds, pairNeeds } from "../../shared/offline-needs"
import { retryable } from "../../shared/retryable"
import { dictKey, type DictPack, gunzip, parsePack } from "./format"
import { DictionaryStore } from "./store"

const MAX_PHRASE_WORDS = 3
/** Languages written without spaces between words. */
const UNSPACED = new Set(["zh", "ja"])
const NUMBER = /^\p{N}[\p{N}.,:]*$/u
const INLINE_SPACE = /^[^\S\n]+$/
const CJK = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\u3000-\\u303f\\uff00-\\uffef"
/** Spaces next to Chinese or Japanese text, which has none. */
const CJK_SPACE = new RegExp(` +(?=[${CJK}])|(?<=[${CJK}]) +`, "gu")
const IDLE_MS = 5 * 60_000

function lookup(pack: DictPack, phrase: string): string | undefined {
  const key = dictKey(phrase, pack.src)
  const entry = pack.entries.get(key)
  if (entry !== undefined) return entry
  const lemma = pack.forms.get(key)
  return lemma === undefined ? undefined : pack.entries.get(lemma)
}

const isWord = (s: Intl.SegmentData | undefined) => Boolean(s?.isWordLike) && !NUMBER.test(s!.segment)

/** Phrases of two or more words that start at segment `i`, longest first, each with the index of the segment after it. */
function phrases(segments: Intl.SegmentData[], i: number, spaced: boolean): [string, number][] {
  const words = [segments[i].segment]
  const out: [string, number][] = []
  let last = i
  while (words.length < MAX_PHRASE_WORDS) {
    let next = last + 1
    if (spaced) {
      if (!INLINE_SPACE.test(segments[next]?.segment ?? "")) break
      next++
    }
    if (!isWord(segments[next])) break
    words.push(segments[next].segment)
    last = next
    out.unshift([words.join(spaced ? " " : ""), last + 1])
  }
  return out
}

/** Translate a text with one pack. */
export function translateText(text: string, pack: DictPack): string {
  const segments = [...new Intl.Segmenter(pack.src, { granularity: "word" }).segment(text)]
  const spacedSource = !UNSPACED.has(baseLang(pack.src))
  const spacedTarget = !UNSPACED.has(baseLang(pack.tgt))
  let out = ""
  let afterWord = false
  for (let i = 0; i < segments.length; ) {
    const { segment, isWordLike } = segments[i]
    if (!isWordLike) {
      out += INLINE_SPACE.test(segment) ? " " : segment
      afterWord = false
      i++
      continue
    }
    let piece = segment
    let next = i + 1
    if (isWord(segments[i])) {
      const match = phrases(segments, i, spacedSource)
        .map(([phrase, end]) => [lookup(pack, phrase), end] as const)
        .find(([translation]) => translation !== undefined)
      if (match) [piece, next] = [match[0]!, match[1]]
      else piece = lookup(pack, segment) ?? segment
    }
    // Words of an unspaced source language need spaces in a spaced target language.
    if (afterWord && spacedTarget) out += " "
    out += piece
    afterWord = true
    i = next
  }
  return spacedTarget ? out : out.replace(CJK_SPACE, "")
}

export interface DictionaryOptions {
  /** Language detector for source language "auto", from sourceDetector(). */
  detect?: LanguageDetector
  /** Time without translations after which the packs are released. */
  idleMs?: number
  /** Pair keys of the packs the release offers, as far as already read: a translation does not wait for the network. */
  catalog?: () => Catalog
}

export class Dictionary {
  private packs = new Map<string, Promise<DictPack | null>>()
  /** Hash of the installed packs and their versions. */
  private readonly installed = retryable(async () => hashText((await this.store.list()).map((p) => `${p.id}@${p.version}:${p.bytes}`).sort().join(",")))
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly store = new DictionaryStore(),
    private readonly opts: DictionaryOptions = {},
  ) {}

  /**
   * Packs were installed or deleted: the pack `id` ("en>zh-Hans"), or all packs
   * without it, is read again on next use; the signature is worked out again.
   */
  invalidate(id?: string): void {
    if (id === undefined) this.packs.clear()
    else this.packs.delete(id)
    this.installed.reset()
  }

  /** Ids of the installed packs ("en>zh-Hans"). */
  async installedIds(): Promise<Set<string>> {
    return new Set((await this.store.list()).map((p) => p.id))
  }

  /** Hash of the installed packs and their versions: part of the cache key of every dictionary translation. */
  signature(): Promise<string> {
    return this.installed.get()
  }

  /**
   * A pack in memory, read on first use; null when it is not installed.
   * `batch` holds what the batch looked up: a missing pack is read once per
   * batch, and the next batch reads it again.
   */
  private pack(src: string, tgt: string, batch: Map<string, Promise<DictPack | null>>): Promise<DictPack | null> {
    const id = pairKey(src, tgt)
    let pack = batch.get(id) ?? this.packs.get(id)
    if (!pack) {
      const read = this.store.data(id).then(async (data) => (data ? parsePack(await gunzip(data)) : null))
      const forget = () => void (this.packs.get(id) === read && this.packs.delete(id))
      read.then((found) => found || forget(), forget)
      this.packs.set(id, read)
      pack = read
    }
    batch.set(id, pack)
    return pack
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.invalidate(), this.opts.idleMs ?? IDLE_MS)
  }

  /** `sourceLang`: "auto" (detected per paragraph) or a language code. A paragraph that cannot be translated fails alone. */
  async translate(texts: string[], sourceLang: string, targetLang: string): Promise<PromiseSettledResult<string>[]> {
    this.touch()
    const tgt = dictLang(targetLang)
    if (!tgt) throw new LocalizedError("errDictionaryUnsupported", [targetLang])
    /** What each language pair of the batch needs, worked out once. */
    const needs = new Map<string, Promise<PairNeeds>>()
    /** The packs the batch looked up. */
    const packs = new Map<string, Promise<DictPack | null>>()
    return Promise.allSettled(
      texts.map(async (text) => {
        const detected = sourceLang === "auto" ? await detectSourceLanguage(text, this.opts.detect) : sourceLang
        const lang = detected ?? "en"
        const src = dictLang(lang)
        if (!src) throw new LocalizedError("errDictionaryUnsupported", [lang])
        if (src === tgt) return text
        if (isChinesePair(src, tgt)) throw new LocalizedError("errChineseVariants")
        return this.translateWith(text, src, tgt, detected !== null, { needs, packs })
      }),
    )
  }

  /** `detected`: the source language was detected or set, not guessed; only then the error names the packs to download. */
  private async translateWith(
    text: string,
    src: string,
    tgt: string,
    detected: boolean,
    { needs, packs }: { needs: Map<string, Promise<PairNeeds>>; packs: Map<string, Promise<DictPack | null>> },
  ): Promise<string> {
    const direct = await this.pack(src, tgt, packs)
    if (direct) return translateText(text, direct)
    if (src !== "en" && tgt !== "en") {
      const [toEnglish, fromEnglish] = await Promise.all([this.pack(src, "en", packs), this.pack("en", tgt, packs)])
      if (toEnglish && fromEnglish) return translateText(translateText(text, toEnglish), fromEnglish)
    }
    const pair = `${src} → ${tgt}`
    const id = pairKey(src, tgt)
    if (!needs.has(id)) needs.set(id, this.installedIds().then((installed) => pairNeeds("dictionary", src, tgt, this.opts.catalog?.() ?? null, installed)))
    const { unsupported, missing } = await needs.get(id)!
    if (unsupported) throw new LocalizedError("errDictionaryNoPack", [pair])
    if (!detected || missing.length === 0) throw new LocalizedError("errDictionaryMissing", [pair], undefined, "hintDictionaryDownload")
    throw new MissingDataError("errDictionaryMissing", [pair], { service: "dictionary", pair: id, models: missing }, "hintDictionaryDownload")
  }
}
