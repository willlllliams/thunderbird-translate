/**
 * Dictionary translation: word by word with the installed packs.
 *
 * A paragraph is split into words with Intl.Segmenter. At every word the
 * longest phrase of up to three words that has an entry wins; a word without
 * an entry is looked up through its lemma (the pack's inflected forms) and
 * otherwise stays as it is. Punctuation and numbers stay as they are.
 * Between two languages other than English, the text goes through English
 * when both packs are installed. Packs are read from IndexedDB on first use
 * and released after a while without translations.
 */

import { LocalizedError } from "../../shared/errors"
import { detectLanguage, type LanguageDetector } from "../../shared/lang-detect"
import { baseLang } from "../../shared/languages"
import { dictKey, dictLang, type DictPack, gunzip, parsePack } from "./format"
import { DictionaryStore, packId } from "./store"

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
  /** Language detector for source language "auto". */
  detect?: LanguageDetector
  /** Time without translations after which the packs are released. */
  idleMs?: number
}

export class Dictionary {
  private packs = new Map<string, Promise<DictPack | null>>()
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly store = new DictionaryStore(),
    private readonly opts: DictionaryOptions = {},
  ) {}

  /** Packs were installed or deleted: read them again on next use. */
  invalidate(): void {
    this.packs.clear()
  }

  /** A pack in memory, read on first use; null when it is not installed. */
  private pack(src: string, tgt: string): Promise<DictPack | null> {
    const id = packId(src, tgt)
    let pack = this.packs.get(id)
    if (!pack) {
      pack = this.store.data(id).then(async (data) => (data ? parsePack(await gunzip(data)) : null))
      pack.catch(() => this.packs.delete(id))
      this.packs.set(id, pack)
    }
    return pack
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.invalidate(), this.opts.idleMs ?? IDLE_MS)
  }

  /** `sourceLang`: "auto" (detected per paragraph) or a language code. */
  async translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    this.touch()
    const tgt = dictLang(targetLang)
    if (!tgt) throw new LocalizedError("errDictionaryUnsupported", [targetLang])
    return Promise.all(
      texts.map(async (text) => {
        const lang = sourceLang === "auto" ? ((await detectLanguage(text, this.opts.detect)) ?? "en") : sourceLang
        const src = dictLang(lang)
        if (!src) throw new LocalizedError("errDictionaryUnsupported", [lang])
        return src === tgt ? text : this.translateWith(text, src, tgt)
      }),
    )
  }

  private async translateWith(text: string, src: string, tgt: string): Promise<string> {
    const direct = await this.pack(src, tgt)
    if (direct) return translateText(text, direct)
    if (src !== "en" && tgt !== "en") {
      const [toEnglish, fromEnglish] = await Promise.all([this.pack(src, "en"), this.pack("en", tgt)])
      if (toEnglish && fromEnglish) return translateText(translateText(text, toEnglish), fromEnglish)
    }
    throw new LocalizedError("errDictionaryMissing", [`${src} → ${tgt}`], undefined, "hintDictionaryDownload")
  }
}
