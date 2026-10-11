// Source download, caching and streaming line readers.

import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { readGzLines } from './common.mjs';

export const KAIKKI_BASE = 'https://kaikki.org/dictionary';
export const ECDICT_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';

export function kaikkiUrl(langName) {
  return `${KAIKKI_BASE}/${langName}/kaikki.org-dictionary-${langName}.jsonl.gz`;
}

function metaPath(file) {
  return `${file}.meta.json`;
}

export function readMeta(file) {
  try {
    return JSON.parse(readFileSync(metaPath(file), 'utf8'));
  } catch {
    return null;
  }
}

function writeMeta(file, meta) {
  writeFileSync(metaPath(file), JSON.stringify(meta, null, 2) + '\n');
}

function mb(n) {
  return `${(n / 1048576).toFixed(1)} MB`;
}

function progressLogger(label, total) {
  let seen = 0;
  let nextLog = 0;
  const step = 100 * 1048576;
  return (n) => {
    seen += n;
    if (seen >= nextLog) {
      const pct = total ? ` (${((seen / total) * 100).toFixed(0)}%)` : '';
      console.log(`  ${label}: ${mb(seen)}${pct}`);
      nextLog = seen + step;
    }
  };
}

async function fetchOk(url, signal) {
  const res = await fetch(url, { signal, headers: { 'user-agent': 'thunderbird-translate-dict-build' } });
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return res;
}

// Download `url` to `file` once. Later runs reuse the cached file. A failed or
// truncated transfer is attempted up to three times in total.
export async function ensureDownloaded(url, file) {
  if (existsSync(file)) {
    return readMeta(file) ?? { url, bytes: statSync(file).size };
  }
  await mkdir(path.dirname(file), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      return await download(url, file);
    } catch (err) {
      if (attempt >= 3) throw err;
      console.log(`  download failed (${err.message}), retrying`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function download(url, file) {
  console.log(`Downloading ${url}`);
  const res = await fetchOk(url);
  const total = Number(res.headers.get('content-length')) || 0;
  const log = progressLogger(path.basename(file), total);
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => log(chunk.length));
  const part = `${file}.part`;
  await pipeline(body, createWriteStream(part));
  const bytes = statSync(part).size;
  if (total && !res.headers.get('content-encoding') && bytes !== total) throw new Error(`${url}: got ${bytes} of ${total} bytes`);
  renameSync(part, file);
  const meta = {
    url,
    lastModified: res.headers.get('last-modified'),
    bytes,
    fetchedAt: new Date().toISOString(),
  };
  writeMeta(file, meta);
  return meta;
}

async function* take(iter, limit) {
  let n = 0;
  for await (const x of iter) {
    if (n >= limit) return;
    n++;
    yield x;
  }
}

// Yield the lines of a gzip-compressed JSONL source.
// Without `limit` the whole file is downloaded to the cache first.
// With `limit` only the first `limit` lines are read: from the full cached
// file if present, otherwise streamed from the network and stored as a small
// sample file so repeated runs do not download again.
export async function openGzLines({ url, cacheDir, fileName, limit, onMeta }) {
  const full = path.join(cacheDir, fileName);
  if (!limit) {
    const meta = await ensureDownloaded(url, full);
    onMeta?.(meta);
    return readGzLines(full);
  }
  if (existsSync(full)) {
    onMeta?.(readMeta(full) ?? { url });
    return take(readGzLines(full), limit);
  }
  const sample = path.join(cacheDir, fileName.replace(/\.jsonl\.gz$/, `.first${limit}.jsonl.gz`));
  if (existsSync(sample)) {
    onMeta?.(readMeta(sample) ?? { url });
    return readGzLines(sample);
  }
  await mkdir(cacheDir, { recursive: true });
  return streamSample(url, sample, limit, onMeta);
}

async function* streamSample(url, sample, limit, onMeta) {
  console.log(`Streaming first ${limit} lines of ${url}`);
  const ac = new AbortController();
  const res = await fetchOk(url, ac.signal);
  const meta = {
    url,
    lastModified: res.headers.get('last-modified'),
    sampleLines: limit,
    fetchedAt: new Date().toISOString(),
  };
  onMeta?.(meta);
  let stopping = false;
  const body = Readable.fromWeb(res.body);
  const gunzip = createGunzip();
  const swallow = (err) => {
    if (!stopping) gunzip.destroy(err);
  };
  body.on('error', swallow);
  body.pipe(gunzip);
  const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

  const part = `${sample}.part`;
  const gz = createGzip({ level: 1 });
  const out = createWriteStream(part);
  gz.pipe(out);

  let n = 0;
  let complete = false;
  try {
    for await (const line of rl) {
      if (!gz.write(line + '\n')) await once(gz, 'drain');
      yield line;
      if (++n >= limit) break;
    }
    complete = true;
  } finally {
    stopping = true;
    rl.close();
    ac.abort();
    body.destroy();
    gunzip.destroy();
    gz.end();
    await once(out, 'close');
    if (complete) {
      renameSync(part, sample);
      writeMeta(sample, { ...meta, sampleLines: n });
    }
  }
}

// Minimal CSV record parser (RFC 4180 quoting). Returns null when the line
// ends inside a quoted field so the caller can append the next physical line.
export function parseCsvRecord(text) {
  const fields = [];
  let i = 0;
  const n = text.length;
  while (true) {
    if (text[i] === '"') {
      let value = '';
      i++;
      while (true) {
        if (i >= n) return null;
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += c;
          i++;
        }
      }
      fields.push(value);
      if (i >= n) return fields;
      if (text[i] === ',') i++;
    } else {
      const j = text.indexOf(',', i);
      if (j === -1) {
        fields.push(text.slice(i));
        return fields;
      }
      fields.push(text.slice(i, j));
      i = j + 1;
    }
    if (i === n) {
      fields.push('');
      return fields;
    }
  }
}

// Yield ECDICT rows as objects keyed by the header names.
export async function* readEcdictRows(file, limit) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  let pending = '';
  let rows = 0;
  for await (const line of rl) {
    const text = pending ? `${pending}\n${line}` : line;
    const rec = parseCsvRecord(text);
    if (rec === null) {
      pending = text;
      continue;
    }
    pending = '';
    if (!header) {
      header = rec;
      continue;
    }
    const row = {};
    for (let k = 0; k < header.length; k++) row[header[k]] = rec[k] ?? '';
    yield row;
    if (limit && ++rows >= limit) break;
  }
  rl.close();
}
