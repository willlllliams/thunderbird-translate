#!/usr/bin/env node
// Word-for-word translation demo over built packs:
//   node demo.mjs [packDir]
// Words missing from a pack are shown as [word].

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LANGS, lookup, normalizeKey, packFileName, readPack } from './lib/common.mjs';

const MAX_PHRASE_WORDS = 4;

const SAMPLES = [
  ['en', 'zh-Hans', 'The cat is sleeping on the warm windowsill.'],
  ['en', 'zh-Hans', 'She bought three books yesterday.'],
  ['en', 'zh-Hans', 'We need to finish the report before the meeting.'],
  ['de', 'en', 'Der Hund läuft schnell über die Straße.'],
  ['de', 'en', 'Ich habe gestern ein Buch gekauft.'],
];

function segment(text, lang) {
  const seg = new Intl.Segmenter(lang, { granularity: 'word' });
  return [...seg.segment(text)].map((s) => ({ text: s.segment, word: s.isWordLike }));
}

// Greedy longest match over up to MAX_PHRASE_WORDS consecutive words, so that
// multi-word keys ("in front of") win over single words.
export function translate(pack, text) {
  const { src, tgt } = pack.header;
  const segs = segment(text, src);
  const out = [];
  const joiner = LANGS[tgt]?.cjk ? '' : ' ';
  let i = 0;
  while (i < segs.length) {
    const s = segs[i];
    if (!s.word) {
      if (!/^\s+$/.test(s.text)) out.push({ text: s.text, punct: true });
      i++;
      continue;
    }
    let matched = null;
    const words = [];
    let j = i;
    for (let count = 0; j < segs.length && count < MAX_PHRASE_WORDS; j++) {
      if (!segs[j].word) {
        if (/^\s+$/.test(segs[j].text)) continue;
        break;
      }
      words.push(segs[j].text);
      count++;
      const hit = lookup(pack, normalizeKey(words.join(' '), src));
      if (hit) matched = { end: j + 1, hit };
    }
    if (matched) {
      out.push({ text: matched.hit.translation });
      i = matched.end;
    } else {
      out.push({ text: `[${s.text}]` });
      i++;
    }
  }
  let result = '';
  for (const piece of out) {
    if (piece.punct || !result) result += piece.text;
    else result += joiner + piece.text;
  }
  return result;
}

async function main() {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist'));
  const cache = new Map();
  for (const [src, tgt, text] of SAMPLES) {
    const file = path.join(dir, packFileName(src, tgt));
    if (!existsSync(file)) {
      console.log(`${src}->${tgt}: missing ${file}`);
      continue;
    }
    if (!cache.has(file)) cache.set(file, await readPack(file));
    const pack = cache.get(file);
    console.log(`${src}->${tgt} (${pack.header.source})`);
    console.log(`  ${text}`);
    console.log(`  ${translate(pack, text)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
