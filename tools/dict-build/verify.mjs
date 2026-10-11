#!/usr/bin/env node
// Check built packs against dict-index.json and the pack format rules:
//   node verify.mjs [packDir]
// Exits with status 1 on the first pack that violates a rule.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { normalizeKey } from './lib/common.mjs';

const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist'));
const index = JSON.parse(readFileSync(path.join(dir, 'dict-index.json'), 'utf8'));
const MAX_BYTES = Number(process.env.DICT_MAX_BYTES) || 5_000_000;

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

if (index.version !== 1 || !Array.isArray(index.packs)) fail('index: version must be 1 with a packs array');

for (const p of index.packs) {
  const gz = readFileSync(path.join(dir, p.file));
  const where = p.file;
  if (gz.length !== p.bytes) fail(`${where}: bytes ${gz.length} != index ${p.bytes}`);
  if (gz.length > MAX_BYTES) fail(`${where}: ${gz.length} bytes exceeds ${MAX_BYTES}`);
  const sha = createHash('sha256').update(gz).digest('hex');
  if (sha !== p.sha256) fail(`${where}: sha256 mismatch`);
  const raw = gunzipSync(gz);
  if (raw.length !== p.rawBytes) fail(`${where}: rawBytes ${raw.length} != index ${p.rawBytes}`);
  const text = raw.toString('utf8');
  if (!text.endsWith('\n')) fail(`${where}: missing final newline`);
  const lines = text.slice(0, -1).split('\n');
  const header = lines[0].split('\t');
  if (header.length !== 6 || header[0] !== '#dict' || header[1] !== p.src || header[2] !== p.tgt) {
    fail(`${where}: bad header ${JSON.stringify(lines[0])}`);
  }
  if (header[4] !== p.source || header[5] !== p.license) fail(`${where}: header source/license differ from index`);
  const words = new Set();
  const forms = [];
  let prev = null;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length !== 3 || (parts[0] !== 'w' && parts[0] !== 'f')) fail(`${where}:${i + 1}: bad line ${JSON.stringify(lines[i])}`);
    const [type, key, value] = parts;
    if (!key || !value) fail(`${where}:${i + 1}: empty field`);
    if (normalizeKey(key, p.src) !== key) fail(`${where}:${i + 1}: key not normalized ${JSON.stringify(key)}`);
    if (prev !== null && !(prev < key)) fail(`${where}:${i + 1}: keys not strictly ascending (${JSON.stringify(prev)} then ${JSON.stringify(key)})`);
    prev = key;
    if (type === 'w') words.add(key);
    else forms.push([key, value, i + 1]);
  }
  for (const [key, lemma, line] of forms) {
    if (!words.has(lemma)) fail(`${where}:${line}: form ${JSON.stringify(key)} points to missing lemma ${JSON.stringify(lemma)}`);
  }
  if (words.size !== p.entries) fail(`${where}: ${words.size} entries != index ${p.entries}`);
  if (forms.length !== p.forms) fail(`${where}: ${forms.length} forms != index ${p.forms}`);
  console.log(`ok ${where}: ${p.entries} entries, ${p.forms} forms, ${p.bytes} bytes`);
}
