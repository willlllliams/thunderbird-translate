// Shared helpers for building and reading dictionary packs.
// Pack format: see docs/dictionary-packs.md.

import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

// Languages supported by the pipeline. `kaikki` is the language name used in
// kaikki.org file names; `cjk` marks languages written in Han, kana or hangul.
export const LANGS = {
  en: { kaikki: 'English' },
  'zh-Hans': { kaikki: 'Chinese', cjk: true },
  'zh-Hant': { kaikki: 'Chinese', cjk: true },
  ja: { kaikki: 'Japanese', cjk: true },
  ko: { kaikki: 'Korean', cjk: true },
  fr: { kaikki: 'French' },
  de: { kaikki: 'German' },
  es: { kaikki: 'Spanish' },
  pt: { kaikki: 'Portuguese' },
  ru: { kaikki: 'Russian' },
  tr: { kaikki: 'Turkish' },
  vi: { kaikki: 'Vietnamese' },
};

export const FOREIGN = Object.keys(LANGS).filter((l) => l !== 'en');

// All 22 directions: en -> X and X -> en.
export const ALL_PAIRS = [
  ...FOREIGN.map((l) => ['en', l]),
  ...FOREIGN.map((l) => [l, 'en']),
];

export function packFileName(src, tgt) {
  return `dict-${src}-${tgt}.tsv.gz`;
}

// Parse "en-zh-Hans" style pair names against the known language codes.
export function parsePair(name) {
  for (const [src, tgt] of ALL_PAIRS) {
    if (`${src}-${tgt}` === name) return [src, tgt];
  }
  throw new Error(`Unknown pair "${name}". Known pairs: ${ALL_PAIRS.map((p) => p.join('-')).join(', ')}`);
}

// Combining grave (U+0300) and acute (U+0301) accents used as stress marks.
const STRESS = new RegExp(`[${String.fromCharCode(0x300, 0x301)}]`, 'g');

function stripRussianStress(s) {
  return s.normalize('NFD').replace(STRESS, '').normalize('NFC');
}

// Normalize a text value (translation or lemma) without case folding.
export function cleanText(s, lang) {
  if (typeof s !== 'string') return '';
  let t = s.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (lang === 'ru') t = stripRussianStress(t);
  return t;
}

// Key rule: NFC, trim, inner whitespace collapsed to one space,
// toLocaleLowerCase(src). Han, kana and hangul have no case, so for zh/ja/ko
// only embedded Latin letters change ("T恤" -> "t恤"), which matches the
// extension's dictKey(). Russian stress marks are removed
// because running text does not carry them.
export function normalizeKey(s, lang) {
  let k = cleanText(s, lang);
  k = k.toLocaleLowerCase(lang);
  return k;
}

// Remove (...) [...] （...） 【...】 annotations, including nested ones.
export function stripBrackets(s) {
  let prev;
  do {
    prev = s;
    s = s
      .replace(/\([^()]*\)/gu, ' ')
      .replace(/\[[^[\]]*\]/gu, ' ')
      .replace(/（[^（）]*）/gu, ' ')
      .replace(/【[^【】]*】/gu, ' ');
  } while (s !== prev);
  return s.replace(/[()[\]（）【】]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export async function* readGzLines(file) {
  const input = createReadStream(file).pipe(createGunzip());
  const rl = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) yield line;
  } finally {
    rl.close();
    input.destroy();
  }
}

// Read a pack into { header, words: Map, forms: Map }.
export async function readPack(file) {
  let header = null;
  const words = new Map();
  const forms = new Map();
  for await (const line of readGzLines(file)) {
    if (!line) continue;
    const parts = line.split('\t');
    if (header === null) {
      if (parts[0] !== '#dict') throw new Error(`${file}: missing #dict header`);
      header = { src: parts[1], tgt: parts[2], version: parts[3], source: parts[4], license: parts[5] };
      continue;
    }
    if (parts[0] === 'w') words.set(parts[1], parts[2]);
    else if (parts[0] === 'f') forms.set(parts[1], parts[2]);
  }
  return { header, words, forms };
}

// Look up one key: direct entry first, then form -> lemma -> entry.
export function lookup(pack, key) {
  const direct = pack.words.get(key);
  if (direct !== undefined) return { translation: direct, via: null };
  const lemma = pack.forms.get(key);
  if (lemma !== undefined) {
    const t = pack.words.get(lemma);
    if (t !== undefined) return { translation: t, via: lemma };
  }
  return null;
}
