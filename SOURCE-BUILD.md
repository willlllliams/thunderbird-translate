# Building Multi Translate for Thunderbird from source

This archive holds the source code of the extension and everything its build reads. The build bundles the TypeScript sources with esbuild (minified), writes the interface texts and the third-party notices, and packs the xpi. The steps below produce the same xpi, byte for byte, as the one submitted to addons.thunderbird.net.

## Requirements

| Item | Version |
| --- | --- |
| Operating system | Ubuntu 24.04 or Windows 10/11 (x64); any system that runs Node.js works |
| Node.js | 24.21.0 (any 24.x; at least 22) |
| npm | 11.19.0 |

No other tool is needed: packing the xpi uses the JavaScript library fflate, not a system `zip`.

## Build

From the directory this archive was unpacked into:

```bash
npm ci
npm run build
```

`npm ci` installs the exact package versions of `package-lock.json` from the npm registry (or from the local npm cache). npm 11 may report that the install script of esbuild did not run; the build does not need it, since npm installs esbuild's binary for the platform as a package of its own. `npm run build` then works without network:

- The Bergamot translation engine is part of the archive in `vendor/bergamot/` and is checked against pinned sha256 hashes (see below).
- The license texts that some npm packages lack are part of the archive in `licenses/`.

The output is `web-ext-artifacts/thunderbird-translate-<version>.xpi`; the unpacked extension is in `dist/`. Every entry of the xpi carries the time stamp 2026-01-01 00:00 in every time zone (a zip stores the time without a zone) and the entries are in a fixed order, so two builds of the same sources can be compared with a checksum:

```bash
sha256sum web-ext-artifacts/thunderbird-translate-*.xpi
```

On Windows, `certutil -hashfile web-ext-artifacts\thunderbird-translate-<version>.xpi SHA256` gives the same value.

## What the build does

`scripts/build.mjs`:

1. bundles `src/background/index.ts` (an ES module with the AI SDK as a separate chunk), `src/content/index.ts`, `src/popup/index.ts`, `src/options/index.ts`, `src/welcome/index.ts`, `src/subjects/index.ts` and `src/offline/bergamot/worker.ts` into `dist/` with esbuild;
2. copies `static/` (manifest, HTML, CSS, icons) and `LICENSE`, and the two files of the Bergamot engine from `vendor/bergamot/`;
3. writes `dist/_locales/<language>/messages.json` from `locales/*.json`;
4. writes `dist/THIRD-PARTY-NOTICES.txt` (`scripts/notices.mjs`) from the npm packages esbuild read;
5. packs `dist/` into the xpi.

The source of the end-to-end test build (`src/e2e/`) is left out of this archive; the regular build never reads it, and `scripts/build.mjs` stops if it ever does.

## Bergamot engine (WebAssembly and glue script)

`vendor/bergamot/bergamot-translator.wasm.zst` and `vendor/bergamot/bergamot-translator.js` are Mozilla's published build of the Bergamot translation engine, unmodified, the same files Firefox and Thunderbird use:

| File | Source | sha256 |
| --- | --- | --- |
| `bergamot-translator.wasm.zst` | Mozilla Remote Settings, collection `main/translations-wasm-v2`, `bergamot-translator` 4.0, release v0.6.0, built from https://github.com/mozilla/translations at revision `1de4a085d3a7afb625c51a60aabb5ad298e4059f` | `327fcfc7b7e9d95f6fa0844ebf899cfc05469872ef02d3aef5783182839a6255` (decompressed: `f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926`) |
| `bergamot-translator.js` | Thunderbird 156.0.1 `omni.ja`, identical to https://github.com/mozilla-firefox/firefox/blob/48d55cf7ec80093903e2ef7f58b61a84a22ef716/toolkit/components/translations/bergamot-translator/bergamot-translator.js | `faff1ef6285b0d26f01787776fd49299dfb756ecb9688aa990c250e66797b47d` |

The build checks both hashes of the binary (`scripts/fetch-bergamot.mjs`) and stops when they differ. `VENDOR.md` declares both files with their upstream addresses, and `vendor/bergamot/README.md` gives the download address and the licenses.
