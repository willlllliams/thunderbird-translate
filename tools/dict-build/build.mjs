#!/usr/bin/env node
// Build word-for-word dictionary packs from Wiktionary (kaikki.org wiktextract
// data) and ECDICT. Usage:
//
//   node build.mjs --pairs en-de,de-en --out dist/ [--cache .cache/] [--limit N]
//                  [--pack-version 20261011] [--max-bytes 5000000]
//
// --pairs accepts a comma-separated list or "all". See docs/dictionary-packs.md.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  ALL_PAIRS,
  FOREIGN,
  LANGS,
  cleanText,
  normalizeKey,
  packFileName,
  parsePair,
  stripBrackets,
} from './lib/common.mjs';
import {
  ECDICT_URL,
  ensureDownloaded,
  kaikkiUrl,
  openGzLines,
  readEcdictRows,
} from './lib/sources.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const WIKTIONARY = {
  license: 'CC-BY-SA-4.0',
  attribution:
    'Wiktionary contributors (https://en.wiktionary.org/), extracted by wiktextract and published by kaikki.org (https://kaikki.org/); CC BY-SA 4.0',
};
const ECDICT = {
  license: 'MIT',
  attribution: 'ECDICT by skywind3000 (https://github.com/skywind3000/ECDICT); MIT License',
};

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    pairs: 'all',
    out: 'dist',
    cache: path.join(SCRIPT_DIR, '.cache'),
    limit: 0,
    packVersion: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
    maxBytes: 5_000_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      return argv[++i];
    };
    if (a === '--pairs') opts.pairs = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--cache') opts.cache = next();
    else if (a === '--limit') opts.limit = Number(next());
    else if (a === '--pack-version') opts.packVersion = next();
    else if (a === '--max-bytes') opts.maxBytes = Number(next());
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (!Number.isInteger(opts.limit) || opts.limit < 0) throw new Error('--limit must be a non-negative integer');
  if (/[\t\n]/.test(opts.packVersion)) throw new Error('--pack-version must not contain tabs or newlines');
  const list = opts.pairs.trim() === 'all' || opts.pairs.trim() === ''
    ? ALL_PAIRS
    : opts.pairs.split(',').map((p) => p.trim()).filter(Boolean).map(parsePair);
  opts.pairList = list;
  return opts;
}

// --------------------------------------------------------------- candidates

const MAX_KEY_LENGTH = 100;

// A key must contain a letter and must not be an affix such as "-an" or "un-".
function validKey(k) {
  return (
    k.length > 0 &&
    k.length <= MAX_KEY_LENGTH &&
    !/[\t\n\r]/.test(k) &&
    /\p{L}/u.test(k) &&
    !k.startsWith('-') &&
    !k.endsWith('-')
  );
}

// Collects word and form candidates for one pack.
// Word rank: lower wins; ties keep the first candidate in source order.
class Candidates {
  constructor(exact = new Set()) {
    this.words = new Map();
    this.order = 0;
    // Keys for which an entry with exactly this spelling exists (for example
    // "is"); a case-folded candidate ("IS") never wins such a key.
    this.exact = exact;
  }

  markExact(key) {
    this.exact.add(key);
  }

  // Drop case-folded winners whose key also exists as an exact spelling.
  prune() {
    for (const [k, v] of this.words) if (v.rank % 4 === CASE_FOLDED && this.exact.has(k)) this.words.delete(k);
    return this;
  }

  // `score` breaks rank ties (higher wins); equal scores keep the first.
  addWord(key, translation, rank, score = 0) {
    if (!validKey(key) || !translation || /[\t\n\r]/.test(translation)) return;
    const cur = this.words.get(key);
    if (cur && (cur.rank < rank || (cur.rank === rank && cur.score >= score))) return;
    this.words.set(key, { t: translation, rank, score, ord: this.order++ });
  }
}

// form key -> candidate lemma keys. Priority 0 comes from the form's own entry
// ("is": form of "be"), priority 1 from another entry's inflection table
// ("i": plural "is"). Within a priority, source order is kept; at most 4
// candidates per priority are stored.
class FormTable {
  constructor() {
    this.map = new Map();
  }

  add(form, lemma, priority = 1) {
    if (!validKey(form) || !validKey(lemma) || form === lemma) return;
    let cur = this.map.get(form);
    if (!cur) this.map.set(form, (cur = [[], []]));
    const list = cur[priority];
    if (list.length < 4 && !list.includes(lemma)) list.push(lemma);
  }
}

// ------------------------------------------------------- Wiktionary helpers

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HAN_RE = /\p{Script=Han}/u;
// Characters outside Latin script (Common and Inherited cover digits,
// punctuation and combining marks).
const NON_LATIN_RE = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

const SENSE_SKIP_TAGS = new Set(['form-of', 'alt-of', 'no-gloss', 'empty-gloss', 'romanization']);
// Senses with these tags are used only when no other sense of the entry yields a gloss.
const SENSE_FALLBACK_TAGS = new Set(['obsolete', 'archaic', 'historical', 'dated', 'rare']);
const TRANSLATION_SKIP_TAGS = new Set(['obsolete', 'archaic', 'dated']);
const ZH_DIALECT_TAGS = new Set([
  'Cantonese', 'Hokkien', 'Hakka', 'Wu', 'Min', 'Min-Nan', 'Min-Dong', 'Min-Bei', 'Min-Zhong',
  'Teochew', 'Xiang', 'Gan', 'Jin', 'Dungan', 'Puxian-Min', 'Shanghainese', 'Taishanese',
  'Leizhou-Min', 'Hainanese', 'Southern-Pinghua', 'Northern-Pinghua', 'Classical-Chinese',
  'Literary-Chinese', 'Teochew-Min',
]);
const FORM_SKIP_TAGS = new Set([
  'romanization', 'canonical', 'table-tags', 'inflection-template', 'class', 'counter', 'eumhun',
  'hangeul', 'hanja', 'auxiliary', 'transliteration', 'Simplified-Chinese', 'Traditional-Chinese',
  'Second-Round-Simplified-Chinese', 'obsolete', 'archaic', 'misspelling', 'nonstandard',
  'abbreviation', 'error-unknown-tag',
]);
const SECONDARY_POS = new Set(['character', 'affix', 'prefix', 'suffix', 'infix', 'interfix', 'circumfix', 'punct', 'symbol']);
// Glosses that describe the word instead of translating it.
const META_GLOSS_RE =
  /^(?:\S+ ){0,3}?(?:synonym|abbreviation|form|spelling|clipping|initialism|acronym|contraction|misspelling|ellipsis|plural|diminutive|augmentative|feminine|masculine|inflection|gerund|participle|comparative|superlative|nominalization|noun|equivalent|romanization|transliteration|variant|tense|short|dialect) (?:of|for)\b/i;
const META_START_RE =
  /^(?:used|forms?|as an?|indicates?|denotes?|expresses|introduces?|marks?|serves|refers?|placed|prefix|suffix|letter|name of|the letter)\b/i;

function hasAny(tags, set) {
  if (!tags) return false;
  for (const t of tags) if (set.has(t)) return true;
  return false;
}

// Rank of an entry's candidate for its key (lower wins):
//   rank = 4 * (secondary part of speech ? 1 : 0) + case class
// Case class 0: the headword is spelled exactly like the key.
// Case class 1: a capitalized German noun ("Buch" for "buch"); German nouns are
//   capitalized by spelling rules, so it is kept but loses to an exact entry.
// Case class 3 (CASE_FOLDED): any other case-folded headword ("IS" for "is");
//   dropped when an exact-spelling entry exists, even one without a translation.
const LEXICAL_CASE_POS = new Set(['noun', 'name']);
const CASE_FOLDED = 3;
function entryRank(entry, key, lang) {
  const cls = SECONDARY_POS.has(entry.pos) ? 1 : 0;
  let caseClass = cleanText(entry.word, lang) === key ? 0 : CASE_FOLDED;
  if (caseClass && lang === 'de' && LEXICAL_CASE_POS.has(entry.pos)) caseClass = 1;
  return cls * 4 + caseClass;
}

// Shorten an English gloss to a phrase usable as a word-for-word translation:
// drop bracketed notes, cut at the first ";" or ",", drop "to " for verbs and
// "a "/"an " for nouns, reject results longer than 4 words.
// The gloss is cut at ";" and ","; pieces are tried in order and the first
// usable one is returned.
export function glossPhrase(gloss, pos) {
  if (typeof gloss !== 'string') return null;
  const whole = stripBrackets(gloss);
  if (META_GLOSS_RE.test(whole) || META_START_RE.test(whole)) return null;
  for (const piece of whole.split(/[;,]/)) {
    let s = piece.replace(/\s+/g, ' ').trim().replace(/[.:!?]+$/u, '').trim();
    if (pos === 'verb') s = s.replace(/^to /i, '');
    if (pos === 'noun') s = s.replace(/^(a|an) /i, '');
    s = s.trim();
    if (!s) continue;
    if (s.split(' ').length > 4) continue;
    if (NON_LATIN_RE.test(s)) continue;
    if (META_GLOSS_RE.test(s) || META_START_RE.test(s)) continue;
    return s.normalize('NFC');
  }
  return null;
}

// `glosses` lists parent glosses first and the sense's own gloss last. A parent
// gloss ending in ":" is only a header ("As a copulative verb:"), so the
// sense's own gloss is used in that case.
function senseGloss(sense) {
  const g = sense.glosses;
  if (!Array.isArray(g) || !g.length) return null;
  return /:\s*$/.test(g[0]) ? g[g.length - 1] : g[0];
}

// Returns { gloss, sense }. `sense` counts the fallback senses (obsolete,
// archaic, historical, dated, rare) passed over before the gloss was found, or
// is 100 or more when the gloss itself comes from a fallback sense. Between
// entries with the same rank, the smaller count wins: Vietnamese "tôi" takes
// the pronoun entry ("I/me") over the noun entry whose first sense is
// historical ("slave").
function pickGloss(entry, { zh = false } = {}) {
  const senses = entry.senses ?? [];
  for (const fallback of [false, true]) {
    let passed = 0;
    for (const sense of senses) {
      if (sense.form_of || sense.alt_of) continue;
      if (hasAny(sense.tags, SENSE_SKIP_TAGS)) continue;
      if (zh && hasAny(sense.tags, ZH_DIALECT_TAGS)) continue;
      if (hasAny(sense.tags, SENSE_FALLBACK_TAGS) !== fallback) {
        passed++;
        continue;
      }
      const phrase = glossPhrase(senseGloss(sense), entry.pos);
      if (phrase) return { gloss: phrase, sense: fallback ? 100 : passed };
    }
  }
  return null;
}

function acceptForm(f, lang) {
  if (!f || typeof f.form !== 'string') return null;
  if (hasAny(f.tags, FORM_SKIP_TAGS)) return null;
  const form = normalizeKey(f.form, lang);
  if (!form || /[\s/(),]/u.test(form) || /^[-–—]+$/u.test(form)) return null;
  // Japanese and Korean tables also list romanized forms ("aruita").
  if (LANGS[lang].cjk && !CJK_RE.test(form)) return null;
  return form;
}

function collectForms(entry, key, lang, forms) {
  for (const f of entry.forms ?? []) {
    const form = acceptForm(f, lang);
    if (form) forms.add(form, key, 1);
  }
  for (const sense of entry.senses ?? []) {
    const target = sense.form_of?.[0]?.word ?? sense.alt_of?.[0]?.word;
    if (target) forms.add(key, normalizeKey(target, lang), 0);
  }
}

// Map a translation item from an English entry to the pipeline language
// codes it serves.
function itemLangs(t) {
  const name = t.lang;
  if (name === 'Chinese Mandarin' || name === 'Mandarin') {
    return hasAny(t.tags, ZH_DIALECT_TAGS) ? [] : ['zh-Hant', 'zh-Hans'];
  }
  if (name === 'Portuguese' || name === 'Brazilian Portuguese' || name === 'European Portuguese') return ['pt'];
  const code = KAIKKI_NAME_TO_CODE.get(name);
  return code && (t.lang_code ?? t.code) === code ? [code] : [];
}

const KAIKKI_NAME_TO_CODE = new Map(
  FOREIGN.filter((l) => !l.startsWith('zh') && l !== 'pt').map((l) => [LANGS[l].kaikki, l]),
);

// "詞典 /词典" -> traditional "詞典", simplified "词典".
function splitChinese(word) {
  const parts = word.split(/\s*[/／]\s*/u).map((p) => p.trim()).filter(Boolean);
  return { trad: parts[0] ?? '', simp: parts[1] ?? parts[0] ?? '' };
}

function translationValue(t, code) {
  if (typeof t.word !== 'string') return null;
  let w = t.word;
  if (code === 'zh-Hant') w = splitChinese(w).trad;
  else if (code === 'zh-Hans') w = splitChinese(w).simp;
  w = cleanText(stripBrackets(w), code);
  if (!w || w.length > 60 || /[\t\n]/.test(w) || /^-|-$/.test(w)) return null;
  if (LANGS[code].cjk && !CJK_RE.test(w)) return null;
  return w;
}

// ------------------------------------------------------------ source passes

function dumpDate(meta) {
  if (!meta?.lastModified) return 'unknown date';
  const d = new Date(meta.lastModified);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toISOString().slice(0, 10);
}

function wiktionarySourceName(meta, limit) {
  const base = `Wiktionary via kaikki.org ${dumpDate(meta)}`;
  return limit ? `${base} (first ${limit} lines)` : base;
}

async function kaikkiLines(langName, opts, onMeta) {
  return openGzLines({
    url: kaikkiUrl(langName),
    cacheDir: opts.cache,
    fileName: `kaikki.org-dictionary-${langName}.jsonl.gz`,
    limit: opts.limit,
    onMeta,
  });
}

function parseLine(line) {
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// English pass: en -> X candidates from translation tables, English inflected
// forms, and citation counts of X words (used as a frequency signal for X -> en).
//
// Within one entry, translation items are taken in sense order (translations
// attached to senses first, then the entry-level ones wiktextract could not
// attach to a sense). The chosen translation is the word that occurs in the
// most translation tables of the entry; ties go to the first one in that
// order. Counting tables compensates for wrong sense attachment: for "run"
// the first attached German item is "laufen lassen" (from the table "to cause
// to move quickly"), while "laufen" occurs in several tables.
async function englishPass(targets, opts, { withForms }) {
  const exact = new Set();
  const cands = new Map(targets.map((t) => [t, new Candidates(exact)]));
  const forms = new FormTable();
  const counts = new Map(FOREIGN.map((l) => [l, new Map()]));
  let meta = null;
  let n = 0;
  const lines = await kaikkiLines('English', opts, (m) => (meta = m));
  for await (const line of lines) {
    n++;
    if (n % 200000 === 0) console.log(`  English: ${n} lines`);
    const e = parseLine(line);
    if (!e || e.lang_code !== 'en' || typeof e.word !== 'string') continue;
    const key = normalizeKey(e.word, 'en');
    if (!validKey(key)) continue;
    const rank = entryRank(e, key, 'en');
    if (rank % 4 === 0) exact.add(key);
    const items = [];
    for (const s of e.senses ?? []) if (s.translations) items.push(...s.translations);
    if (e.translations) items.push(...e.translations);
    const tally = new Map(); // code -> Map(value -> occurrences)
    for (const t of items) {
      if (hasAny(t.tags, TRANSLATION_SKIP_TAGS)) continue;
      for (const code of itemLangs(t)) {
        const value = translationValue(t, code);
        if (!value) continue;
        const ck = normalizeKey(value, code);
        const c = counts.get(code);
        c.set(ck, (c.get(ck) ?? 0) + 1);
        if (!cands.has(code)) continue;
        let m = tally.get(code);
        if (!m) tally.set(code, (m = new Map()));
        m.set(value, (m.get(value) ?? 0) + 1);
      }
    }
    for (const [code, m] of tally) {
      let best = null;
      let bestN = 0;
      for (const [value, cnt] of m) {
        if (cnt > bestN) {
          best = value;
          bestN = cnt;
        }
      }
      cands.get(code).addWord(key, best, rank, bestN);
    }
    if (withForms) collectForms(e, key, 'en', forms);
  }
  for (const c of cands.values()) c.prune();
  console.log(`  English: ${n} lines read`);
  return { cands, forms, counts, meta, lines: n };
}

// Generic X -> en pass for languages other than Chinese.
async function foreignPass(lang, opts) {
  const cands = new Candidates();
  const forms = new FormTable();
  const name = LANGS[lang].kaikki;
  const cjk = LANGS[lang].cjk;
  const capitalNouns = new Map(); // key -> gloss of a capitalized German noun
  const lowercaseFormOf = new Map();
  let meta = null;
  let n = 0;
  const lines = await kaikkiLines(name, opts, (m) => (meta = m));
  for await (const line of lines) {
    n++;
    if (n % 200000 === 0) console.log(`  ${name}: ${n} lines`);
    const e = parseLine(line);
    if (!e || e.lang !== name || typeof e.word !== 'string') continue;
    const key = normalizeKey(e.word, lang);
    if (!validKey(key)) continue;
    if (cjk && !CJK_RE.test(key)) continue;
    if (e.pos === 'romanization') continue;
    if (e.pos === 'soft-redirect') {
      const target = e.redirects?.[0];
      if (target) forms.add(key, normalizeKey(target, lang), 0);
      continue;
    }
    const rank = entryRank(e, key, lang);
    if (rank % 4 === 0) cands.markExact(key);
    const picked = pickGloss(e);
    const gloss = picked?.gloss;
    if (gloss) {
      const capitalNoun = lang === 'de' && LEXICAL_CASE_POS.has(e.pos) && e.word !== key;
      cands.addWord(key, gloss, rank, -picked.sense);
      if (capitalNoun && !capitalNouns.has(key)) capitalNouns.set(key, gloss);
    }
    if (lang === 'de' && e.word === key && !lowercaseFormOf.has(key)) {
      // Imperative-only forms ("buch") are rare in running text and never win.
      const target = (e.senses ?? []).find((s) => s.form_of && !s.tags?.includes('imperative'))?.form_of?.[0]?.word;
      if (target) lowercaseFormOf.set(key, normalizeKey(target, lang));
    }
    collectForms(e, key, lang, forms);
  }
  cands.prune();
  console.log(`  ${name}: ${n} lines read`);
  return { cands, forms, meta, lines: n, capitalNouns, lowercaseFormOf };
}

// German keys such as "habe" are both a capitalized noun ("Habe", belongings)
// and an inflected form ("habe" of "haben"). The key keeps the noun only when
// the noun is cited at least as often as the verb lemma in English
// translation tables; otherwise the noun entry is dropped and the key resolves
// through its form line. "buch" keeps "Buch" (book); "habe" resolves to "haben".
function resolveGermanCaseClashes(res, freq) {
  let dropped = 0;
  for (const [key, lemma] of res.lowercaseFormOf) {
    if (!res.capitalNouns.has(key) || res.cands.words.get(key)?.t !== res.capitalNouns.get(key)) continue;
    const nounRank = freq(key);
    const lemmaRank = freq(lemma);
    if (lemmaRank !== null && (nounRank === null || lemmaRank < nounRank)) {
      res.cands.words.delete(key);
      res.forms.add(key, lemma, 0);
      dropped++;
    }
  }
  console.log(`  German noun/form clashes resolved to the form: ${dropped}`);
}

// Chinese pass: one read of the Chinese file builds zh-Hant -> en and
// zh-Hans -> en. Traditional headwords carry the glosses; simplified spellings
// come from the "Simplified-Chinese" form of a traditional entry or from
// simplified soft-redirect pages.
async function chinesePass(opts) {
  const hant = new Candidates();
  const viaSimp = []; // [simp, gloss, rank, score]
  const direct = []; // [word, gloss, rank, score]
  const redirects = []; // [simp, trad]
  let meta = null;
  let n = 0;
  const lines = await kaikkiLines('Chinese', opts, (m) => (meta = m));
  for await (const line of lines) {
    n++;
    if (n % 200000 === 0) console.log(`  Chinese: ${n} lines`);
    const e = parseLine(line);
    if (!e || e.lang !== 'Chinese' || typeof e.word !== 'string') continue;
    const key = normalizeKey(e.word, 'zh-Hant');
    if (!validKey(key) || !HAN_RE.test(key)) continue;
    const picked = e.pos === 'soft-redirect' ? null : pickGloss(e, { zh: true });
    const gloss = picked?.gloss;
    if (!gloss) {
      const target = e.redirects?.[0];
      if (target && target !== e.word) redirects.push([key, normalizeKey(target, 'zh-Hant')]);
      continue;
    }
    const rank = entryRank(e, key, 'zh-Hant');
    const score = -picked.sense;
    hant.addWord(key, gloss, rank, score);
    const simpForm = (e.forms ?? []).find(
      (f) => f.tags?.includes('Simplified-Chinese') &&
        !f.tags.includes('alternative') &&
        !f.tags.includes('Second-Round-Simplified-Chinese'),
    );
    const simp = simpForm ? normalizeKey(simpForm.form, 'zh-Hans') : '';
    if (simp && simp !== key && HAN_RE.test(simp)) viaSimp.push([simp, gloss, rank, score]);
    else direct.push([key, gloss, rank, score]);
  }
  // Hans precedence: headwords identical in both scripts, then simplified
  // forms of traditional entries, then simplified redirect pages.
  const hans = new Candidates();
  for (const [k, g, r, sc] of direct) hans.addWord(k, g, r, sc);
  for (const [k, g, r, sc] of viaSimp) hans.addWord(k, g, r + 4, sc);
  for (const [s, t] of redirects) {
    const g = hant.words.get(t);
    if (g) hans.addWord(s, g.t, g.rank + 8, g.score);
  }
  console.log(`  Chinese: ${n} lines read`);
  return { hans, hant, meta, lines: n };
}

// ECDICT: en -> zh-Hans.
// Lines of the translation field are tried in order. Part-of-speech prefixes
// ("n.", "vt.") and bracketed notes are removed and the line is cut at
// "，；,;"; the first item that contains Chinese and no Latin letters wins.
// Lines with a domain marker ("[计]", "[网络]") are only used when no general
// line yields a translation. Lines like "go的过去式" are inflection notes and
// yield `formOf` instead of a translation.
const ECDICT_FORM_NOTE_RE =
  /^([A-Za-z][A-Za-z' -]*?)\s*的(?:过去式|过去分词|现在分词|现在式|现在时|复数|第三人称|比较级|最高级)/u;

export function ecdictTranslation(translation) {
  let formOf = null;
  const general = [];
  const domain = [];
  for (const raw of translation.split(/\\r\\n|\\n|\r?\n/)) {
    let s = raw.trim();
    if (!s) continue;
    const isDomain = /^\[[^\]]*\]/u.test(s);
    s = s.replace(/^(?:\[[^\]]*\]\s*)+/u, '');
    s = s.replace(/^(?:[a-z]+\.\s*(?:&\s*[a-z]+\.\s*)?)+/iu, '');
    const note = ECDICT_FORM_NOTE_RE.exec(s);
    if (note) {
      formOf ??= note[1].trim();
      continue;
    }
    const items = stripBrackets(s)
      .split(/[，；,;]/u)
      .map((x) => x.replace(/[.]{2,}|…+/gu, '').trim())
      .filter((x) => x && HAN_RE.test(x));
    (isDomain ? domain : general).push(items);
  }
  const pick = (groups) => {
    for (const items of groups) {
      const pure = items.find((x) => !/[A-Za-z]/.test(x));
      if (pure) return pure;
    }
    for (const items of groups) if (items.length) return items[0];
    return null;
  };
  const t = pick(general) ?? (formOf ? null : pick(domain));
  return { t, formOf };
}

function ecdictRank(row) {
  const frq = Number(row.frq) || 0;
  const bnc = Number(row.bnc) || 0;
  const ranks = [frq, bnc].filter((x) => x > 0);
  return ranks.length ? Math.min(...ranks) : null;
}

const EXCHANGE_FORM_TYPES = new Set(['p', 'd', 'i', '3', 'r', 't', 's']);

async function ecdictFile(opts) {
  const file = path.join(opts.cache, 'ecdict.csv');
  const meta = await ensureDownloaded(ECDICT_URL, file);
  return { file, meta };
}

async function ecdictPass(opts) {
  const { file, meta } = await ecdictFile(opts);
  const cands = new Candidates();
  const forms = new FormTable();
  const ranks = new Map();
  let n = 0;
  let dropped = 0;
  for await (const row of readEcdictRows(file, opts.limit)) {
    n++;
    const key = normalizeKey(row.word, 'en');
    if (!validKey(key)) continue;
    const caseRank = cleanText(row.word, 'en') !== key ? CASE_FOLDED : 0;
    const rank = ecdictRank(row);
    if (rank !== null && (!ranks.has(key) || rank < ranks.get(key))) ranks.set(key, rank);
    for (const part of (row.exchange ?? '').split('/')) {
      const idx = part.indexOf(':');
      if (idx < 1) continue;
      const type = part.slice(0, idx);
      const value = normalizeKey(part.slice(idx + 1), 'en');
      if (!value) continue;
      if (type === '0') forms.add(key, value, 0);
      else if (EXCHANGE_FORM_TYPES.has(type)) forms.add(value, key);
    }
    if (rank === null && !(row.tag ?? '').trim()) {
      dropped++;
      continue;
    }
    if (caseRank === 0) cands.markExact(key);
    const { t, formOf } = ecdictTranslation(row.translation ?? '');
    if (formOf) forms.add(key, normalizeKey(formOf, 'en'), 0);
    if (!t) continue;
    cands.addWord(key, cleanText(t, 'zh-Hans'), caseRank);
  }
  cands.prune();
  console.log(`  ECDICT: ${n} rows read, ${dropped} rows without frequency or exam tag dropped`);
  return { cands, forms, ranks, meta, lines: n };
}

// ECDICT frequency ranks for English keys (lower is more frequent).
let ecdictRanksPromise = null;
function ecdictRanks(opts) {
  ecdictRanksPromise ??= (async () => {
    const { file } = await ecdictFile(opts);
    const ranks = new Map();
    for await (const row of readEcdictRows(file, 0)) {
      const key = normalizeKey(row.word, 'en');
      const rank = ecdictRank(row);
      if (rank !== null && (!ranks.has(key) || rank < ranks.get(key))) ranks.set(key, rank);
    }
    return ranks;
  })();
  return ecdictRanksPromise;
}

// -------------------------------------------------------------- pack output

function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function resolveForms(forms, words, keep) {
  const out = new Map();
  if (!forms) return out;
  for (const [k, lists] of forms.map) {
    if (words.has(k) || !keep(k)) continue;
    const l = lists[0].find((x) => words.has(x)) ?? lists[1].find((x) => words.has(x));
    if (l !== undefined) out.set(k, l);
  }
  return out;
}

function serialize(header, words, forms) {
  const keys = [...words.keys(), ...forms.keys()].sort(compareKeys);
  const lines = [header];
  for (const k of keys) {
    const t = words.get(k);
    lines.push(t !== undefined ? `w\t${k}\t${t}` : `f\t${k}\t${forms.get(k)}`);
  }
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}

// keepWord filters w lines; keepForm filters f line keys. An f line also
// needs its lemma to survive as a w line.
function render(header, wordMap, forms, keepWord, keepForm = () => true) {
  const words = new Map();
  for (const [k, v] of wordMap) if (keepWord(k)) words.set(k, v.t);
  const f = resolveForms(forms, words, keepForm);
  const raw = serialize(header, words, f);
  const gz = gzipSync(raw, { level: 9 });
  return { raw, gz, entries: words.size, forms: f.size };
}

// Build one pack, applying the size limit in this order:
//   1. drop multi-word keys (w and f lines)
//   2. drop w lines whose key has no frequency information
//   3. keep only the N most frequent w lines (largest N that fits)
// Steps 2 and 3 rank lemmas only; f lines stay as long as their lemma stays.
async function buildPack({ src, tgt, sourceName, license, attribution, cands, forms, getFreq, opts, extra }) {
  const header = `#dict\t${src}\t${tgt}\t${opts.packVersion}\t${sourceName}\t${license}`;
  const steps = [];
  const words = cands.words;
  let keepWord = () => true;
  let keepForm = () => true;
  let r = render(header, words, forms, keepWord, keepForm);
  steps.push({ step: 'full', entries: r.entries, forms: r.forms, bytes: r.gz.length });

  if (r.gz.length > opts.maxBytes) {
    keepWord = (k) => !k.includes(' ');
    keepForm = keepWord;
    r = render(header, words, forms, keepWord, keepForm);
    steps.push({ step: 'drop-multiword', entries: r.entries, forms: r.forms, bytes: r.gz.length });
  }
  if (r.gz.length > opts.maxBytes) {
    const freq = await getFreq();
    const singleWord = keepWord;
    keepWord = (k) => singleWord(k) && freq(k) !== null;
    r = render(header, words, forms, keepWord, keepForm);
    steps.push({ step: 'drop-no-frequency', entries: r.entries, forms: r.forms, bytes: r.gz.length });
    if (r.gz.length > opts.maxBytes) {
      const ranked = [...words.keys()]
        .filter(keepWord)
        .sort((a, b) => freq(a) - freq(b) || words.get(a).ord - words.get(b).ord);
      let lo = 0;
      let hi = ranked.length;
      let best = null;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const set = new Set(ranked.slice(0, mid));
        const attempt = render(header, words, forms, (k) => set.has(k), keepForm);
        if (attempt.gz.length <= opts.maxBytes) {
          lo = mid;
          best = attempt;
        } else {
          hi = mid - 1;
        }
      }
      r = best ?? render(header, words, forms, () => false, keepForm);
      steps.push({ step: 'top-n', n: lo, entries: r.entries, forms: r.forms, bytes: r.gz.length });
    }
  }

  const file = packFileName(src, tgt);
  writeFileSync(path.join(opts.out, file), r.gz);
  const sha256 = createHash('sha256').update(r.gz).digest('hex');
  const pack = {
    src,
    tgt,
    file,
    bytes: r.gz.length,
    rawBytes: r.raw.length,
    entries: r.entries,
    forms: r.forms,
    sha256,
    source: sourceName,
    license,
    attribution,
  };
  console.log(
    `  wrote ${file}: ${r.entries} entries, ${r.forms} forms, ${(r.gz.length / 1048576).toFixed(2)} MB` +
      (steps.length > 1 ? ` (trimmed: ${steps.slice(1).map((s) => s.step).join(' -> ')})` : ''),
  );
  return { pack, report: { src, tgt, file, source: sourceName, ...extra, steps } };
}

// --------------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  opts.out = path.resolve(opts.out);
  opts.cache = path.resolve(opts.cache);
  await mkdir(opts.out, { recursive: true });
  await mkdir(opts.cache, { recursive: true });
  const started = Date.now();

  const wanted = opts.pairList.map(([s, t]) => `${s}-${t}`);
  const has = (s, t) => wanted.includes(`${s}-${t}`);
  const enTargets = FOREIGN.filter((l) => l !== 'zh-Hans' && has('en', l));
  const foreignSources = FOREIGN.filter((l) => has(l, 'en'));

  const packs = [];
  const reports = [];
  const add = ({ pack, report }) => {
    packs.push(pack);
    reports.push(report);
  };

  const enRankFreq = async () => {
    const ranks = await ecdictRanks(opts);
    return (k) => ranks.get(k) ?? null;
  };

  // Citation counts of foreign words in English translation tables.
  let counts = null;
  const countFreq = async (lang) => {
    if (!counts) {
      console.log('Reading English Wiktionary for citation counts');
      counts = (await englishPass([], opts, { withForms: false })).counts;
    }
    const c = counts.get(lang);
    return (k) => (c.has(k) ? -c.get(k) : null);
  };

  if (enTargets.length) {
    console.log(`English Wiktionary -> ${enTargets.join(', ')}`);
    const res = await englishPass(enTargets, opts, { withForms: true });
    counts = res.counts;
    const sourceName = wiktionarySourceName(res.meta, opts.limit);
    for (const tgt of enTargets) {
      add(
        await buildPack({
          src: 'en',
          tgt,
          sourceName,
          ...WIKTIONARY,
          cands: res.cands.get(tgt),
          forms: res.forms,
          getFreq: enRankFreq,
          opts,
          extra: { sourceUrl: kaikkiUrl('English'), sourceLastModified: res.meta?.lastModified ?? null, limit: opts.limit || null },
        }),
      );
    }
  }

  if (has('en', 'zh-Hans')) {
    console.log('ECDICT -> en-zh-Hans');
    const res = await ecdictPass(opts);
    add(
      await buildPack({
        src: 'en',
        tgt: 'zh-Hans',
        sourceName: opts.limit ? `ECDICT (first ${opts.limit} rows)` : 'ECDICT',
        ...ECDICT,
        cands: res.cands,
        forms: res.forms,
        getFreq: async () => (k) => res.ranks.get(k) ?? null,
        opts,
        extra: { sourceUrl: ECDICT_URL, limit: opts.limit || null },
      }),
    );
  }

  const zhTargets = foreignSources.filter((l) => l.startsWith('zh'));
  if (zhTargets.length) {
    console.log(`Chinese Wiktionary -> ${zhTargets.join(', ')}`);
    const res = await chinesePass(opts);
    const sourceName = wiktionarySourceName(res.meta, opts.limit);
    for (const src of zhTargets) {
      add(
        await buildPack({
          src,
          tgt: 'en',
          sourceName,
          ...WIKTIONARY,
          cands: src === 'zh-Hans' ? res.hans : res.hant,
          forms: null,
          getFreq: () => countFreq(src),
          opts,
          extra: { sourceUrl: kaikkiUrl('Chinese'), sourceLastModified: res.meta?.lastModified ?? null, limit: opts.limit || null },
        }),
      );
    }
  }

  for (const src of foreignSources.filter((l) => !l.startsWith('zh'))) {
    console.log(`${LANGS[src].kaikki} Wiktionary -> ${src}-en`);
    const res = await foreignPass(src, opts);
    if (src === 'de') resolveGermanCaseClashes(res, await countFreq('de'));
    add(
      await buildPack({
        src,
        tgt: 'en',
        sourceName: wiktionarySourceName(res.meta, opts.limit),
        ...WIKTIONARY,
        cands: res.cands,
        forms: res.forms,
        getFreq: () => countFreq(src),
        opts,
        extra: { sourceUrl: kaikkiUrl(LANGS[src].kaikki), sourceLastModified: res.meta?.lastModified ?? null, limit: opts.limit || null },
      }),
    );
  }

  // Merge into an existing index so partial rebuilds keep other packs.
  const indexFile = path.join(opts.out, 'dict-index.json');
  let index = { version: 1, packs: [] };
  if (existsSync(indexFile)) {
    try {
      const old = JSON.parse(readFileSync(indexFile, 'utf8'));
      if (old?.version === 1 && Array.isArray(old.packs)) index = old;
    } catch {
      // rewrite a broken index
    }
  }
  const built = new Set(packs.map((p) => `${p.src}-${p.tgt}`));
  index.packs = [...index.packs.filter((p) => !built.has(`${p.src}-${p.tgt}`)), ...packs].sort(
    (a, b) => compareKeys(a.src, b.src) || compareKeys(a.tgt, b.tgt),
  );
  writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');

  // The report is merged the same way; each pack entry records its own build.
  const reportFile = path.join(opts.out, 'dict-build-report.json');
  let oldReports = [];
  if (existsSync(reportFile)) {
    try {
      oldReports = JSON.parse(readFileSync(reportFile, 'utf8')).packs ?? [];
    } catch {
      oldReports = [];
    }
  }
  const builtAt = new Date().toISOString();
  const runInfo = { packVersion: opts.packVersion, builtAt, maxBytes: opts.maxBytes, limit: opts.limit || null };
  const merged = [
    ...oldReports.filter((p) => !built.has(`${p.src}-${p.tgt}`)),
    ...reports.map((p) => ({ ...p, ...runInfo })),
  ].sort((a, b) => compareKeys(a.src, b.src) || compareKeys(a.tgt, b.tgt));
  writeFileSync(
    reportFile,
    JSON.stringify({ updatedAt: builtAt, seconds: Math.round((Date.now() - started) / 1000), packs: merged }, null, 2) + '\n',
  );
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s: ${packs.length} packs, index ${indexFile}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
