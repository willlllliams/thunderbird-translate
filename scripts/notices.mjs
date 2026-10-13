// The third-party notices of the xpi (THIRD-PARTY-NOTICES.txt): every npm package esbuild bundled into the scripts, with
// version, license, copyright line and license text; the Bergamot engine and where its source code is; the dictionary data.
// scripts/build.mjs writes the file from the metafile of each build and stops when a bundled package is not declared
// below, a declared package is no longer bundled, a license differs from the declaration, or a license text or a
// copyright line is missing. The build reads every text from node_modules/ and licenses/; it does not use the network.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { BERGAMOT_WASM } from "./fetch-bergamot.mjs"

/**
 * Every npm package that may be bundled, with its license (the SPDX name of its package.json). `licenseFile` replaces the
 * license file of the npm package with a text kept in licenses/, for a package that ships none or one without a copyright
 * line; `source` is where that text was copied from.
 */
export const PACKAGES = {
  ai: { license: "Apache-2.0" },
  "@ai-sdk/alibaba": { license: "Apache-2.0" },
  "@ai-sdk/anthropic": { license: "Apache-2.0" },
  "@ai-sdk/azure": { license: "Apache-2.0" },
  "@ai-sdk/cerebras": { license: "Apache-2.0" },
  "@ai-sdk/deepinfra": { license: "Apache-2.0" },
  "@ai-sdk/deepseek": { license: "Apache-2.0" },
  "@ai-sdk/fireworks": { license: "Apache-2.0" },
  "@ai-sdk/gateway": { license: "Apache-2.0" },
  "@ai-sdk/google": { license: "Apache-2.0" },
  "@ai-sdk/groq": { license: "Apache-2.0" },
  "@ai-sdk/mistral": { license: "Apache-2.0" },
  "@ai-sdk/moonshotai": { license: "Apache-2.0" },
  "@ai-sdk/openai": { license: "Apache-2.0" },
  "@ai-sdk/openai-compatible": { license: "Apache-2.0" },
  "@ai-sdk/perplexity": { license: "Apache-2.0" },
  "@ai-sdk/provider": { license: "Apache-2.0" },
  // The npm package has no license file; the text is the LICENSE of its repository.
  "@ai-sdk/provider-utils": { license: "Apache-2.0", licenseFile: "licenses/vercel-ai.LICENSE.txt", source: "https://github.com/vercel/ai/blob/main/LICENSE" },
  "@ai-sdk/togetherai": { license: "Apache-2.0" },
  "@ai-sdk/xai": { license: "Apache-2.0" },
  "@vercel/oidc": { license: "Apache-2.0" },
  // The LICENSE.md of the npm package only points to the LICENSE of its repository, which carries the copyright line.
  "@workflow/serde": { license: "Apache-2.0", licenseFile: "licenses/vercel-workflow.LICENSE.txt", source: "https://github.com/vercel/workflow/blob/main/LICENSE.md" },
  "eventsource-parser": { license: "MIT" },
  fzstd: { license: "MIT" },
  zod: { license: "MIT" },
}

/** License texts kept in licenses/ for the notices, with where they were copied from. */
export const TEXTS = {
  apache: { file: "licenses/Apache-2.0.txt", source: "https://www.apache.org/licenses/LICENSE-2.0.txt" },
  marian: { file: "licenses/marian.LICENSE.txt", source: `https://github.com/mozilla/translations/blob/${BERGAMOT_WASM.revision}/inference/marian-fork/LICENSE.md` },
  ecdict: { file: "licenses/ECDICT.LICENSE.txt", source: "https://github.com/skywind3000/ECDICT/blob/master/LICENSE" },
}

export const CC_BY_SA_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
export const MPL_URL = "https://mozilla.org/MPL/2.0/"
/** Copyright line of the ECDICT license (licenses/ECDICT.LICENSE.txt). */
export const ECDICT_COPYRIGHT = "Copyright (c) 2025 Linwei"

/** The npm packages among the files esbuild read (metafile.inputs): name → directory, sorted by name. A file of a nested node_modules/ belongs to the innermost package. */
export function bundledPackages(inputs) {
  const found = new Map()
  for (const input of inputs) {
    const path = input.split("\\").join("/")
    const at = path.lastIndexOf("node_modules/")
    if (at === -1) continue
    const parts = path.slice(at + "node_modules/".length).split("/")
    const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]
    found.set(name, path.slice(0, at) + "node_modules/" + name)
  }
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)))
}

const normalize = (text) => text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim()
/** Collapsed whitespace and URLs without angle brackets, for comparing license texts laid out differently. */
const flat = (text) => text.replace(/<(https?:[^>\s]+)>/g, "$1").replace(/\s+/g, " ").trim()

/** The terms of the Apache License 2.0, from "TERMS AND CONDITIONS" to "END OF TERMS AND CONDITIONS". */
function apacheTerms(text) {
  const t = flat(text)
  const start = t.indexOf("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION")
  const end = t.indexOf("END OF TERMS AND CONDITIONS")
  return start === -1 || end === -1 ? null : t.slice(start, end)
}

/**
 * The first copyright notice of a license text ("Copyright 2023 Vercel, Inc."), with the lines that continue it up to the
 * next blank line; the template line of the Apache License appendix has no year and does not count.
 */
export function copyrightLine(text) {
  const lines = normalize(text).split("\n").map((l) => l.trim())
  const start = lines.findIndex((l) => /^(Copyright|©)\s*(\(c\)\s*|©\s*)?\d{4}/i.test(l))
  if (start === -1) return null
  const end = lines.indexOf("", start)
  return lines.slice(start, end === -1 ? undefined : end).join(" ")
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i

function readText(root, file) {
  return normalize(readFileSync(join(root, file), "utf8"))
}

/**
 * The bundled packages with their version, license, copyright line, license text and source repository, checked against
 * `packages`. Throws an Error that lists every problem.
 */
export function packageNotices({ root, inputs, packages = PACKAGES }) {
  const problems = []
  const bundled = bundledPackages(inputs)
  for (const name of Object.keys(packages)) if (!bundled.has(name)) problems.push(`${name} is declared in scripts/notices.mjs but no longer bundled`)
  const out = []
  for (const [name, dir] of bundled) {
    const declared = packages[name]
    if (!declared) {
      problems.push(`${name} is bundled but not declared in scripts/notices.mjs (license, license text)`)
      continue
    }
    const pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"))
    if (pkg.license !== declared.license) problems.push(`${name}: package.json names the license ${JSON.stringify(pkg.license)}, scripts/notices.mjs ${declared.license}`)
    let file = declared.licenseFile
    if (!file) {
      const own = existsSync(join(root, dir)) ? readdirSync(join(root, dir)).find((f) => LICENSE_FILE.test(f)) : undefined
      file = own && `${dir}/${own}`
    }
    if (!file || !existsSync(join(root, file))) {
      problems.push(`${name}: no license text (${file ?? `no LICENSE file in ${dir}`}); put one into licenses/ and name it in scripts/notices.mjs`)
      continue
    }
    const text = readText(root, file)
    const copyright = copyrightLine(text)
    if (!copyright) {
      problems.push(`${name}: the license text ${file} has no copyright line`)
      continue
    }
    const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url
    out.push({ name, version: pkg.version, license: declared.license, copyright, text, source: declared.source, repository: repository ? repositoryUrl(repository) : undefined })
  }
  if (problems.length) throw new Error(`Third-party notices:\n${problems.join("\n")}`)
  return out
}

/** "git+ssh://git@github.com/a/b.git" → "https://github.com/a/b". */
function repositoryUrl(url) {
  return url
    .replace(/^git\+/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
}

const RULE = "=".repeat(78)
const wrap = (text, width = 78) => {
  const lines = []
  let line = ""
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.join("\n")
}
const paragraphs = (...texts) => texts.map((t) => wrap(t)).join("\n\n")

/** THIRD-PARTY-NOTICES.txt of version `version`. Throws like packageNotices(). */
export function thirdPartyNotices({ root, inputs, version, packages = PACKAGES }) {
  const notices = packageNotices({ root, inputs, packages })
  const apache = readText(root, TEXTS.apache.file)
  const canonicalTerms = apacheTerms(apache)
  if (!canonicalTerms) throw new Error(`Third-party notices: ${TEXTS.apache.file} is not the Apache License 2.0`)

  // License texts: one block per distinct text; a text that is the whole Apache License 2.0 is not repeated, since its
  // copyright line is listed with the package and the license follows in full at the end.
  const blocks = []
  const lines = []
  for (const n of notices) {
    let reference
    if (apacheTerms(n.text) === canonicalTerms) reference = "the Apache License 2.0 in section 4"
    else {
      let block = blocks.find((b) => b.text === n.text)
      if (!block) {
        block = { label: String.fromCharCode(65 + blocks.length), text: n.text, users: [] }
        blocks.push(block)
      }
      block.users.push(n.name)
      reference = `[${block.label}] in section 4${n.license === "Apache-2.0" ? ", with the Apache License 2.0 that follows it" : ""}`
    }
    lines.push(
      [
        `${n.name} ${n.version}`,
        `  License:      ${n.license}`,
        `  Copyright:    ${n.copyright}`,
        ...(n.repository ? [`  Source:       ${n.repository}`] : []),
        `  License text: ${reference}`,
        ...(n.source ? [`  Text from:    ${n.source} (the npm package lacks it)`] : []),
      ].join("\n"),
    )
  }
  const byLicense = new Map()
  for (const n of notices) byLicense.set(n.license, (byLicense.get(n.license) ?? 0) + 1)
  const counts = [...byLicense].map(([license, count]) => `${count} under ${license}`).join(", ")

  const marian = readText(root, TEXTS.marian.file)
  const ecdict = readText(root, TEXTS.ecdict.file)
  const { release, revision } = BERGAMOT_WASM
  const sections = [
    `Thunderbird Translate ${version}: third-party notices`,
    paragraphs(
      "Thunderbird Translate is released under the GNU General Public License, version 3 or later (the file LICENSE). The extension contains the third-party software listed below; each part keeps its own license.",
    ),
    [
      "1. npm packages bundled into the scripts of the extension",
      "2. Bergamot translation engine",
      "3. Dictionary data (downloaded on request, not part of the extension)",
      "4. License texts",
    ].join("\n"),
    RULE,
    `1. npm packages bundled into the scripts of the extension`,
    wrap(`${notices.length} packages: ${counts}. The scripts are minified bundles; every package below is part of them.`),
    lines.join("\n\n"),
    RULE,
    "2. Bergamot translation engine",
    paragraphs(
      `bergamot-translator.js (the JavaScript glue) and bergamot-translator.wasm.zst (the engine compiled to WebAssembly, compressed with zstd) are the Bergamot translation engine of Mozilla, release ${release}, built from the repository mozilla/translations at revision ${revision}. Firefox and Thunderbird ship the same files.`,
      `License: Mozilla Public License 2.0 (MPL-2.0), ${MPL_URL}. The glue keeps its MPL header unchanged.`,
      `Source code: https://github.com/mozilla/translations/tree/${revision} (directory inference/; the WebAssembly build is inference/scripts/build-wasm.py). A copy of the whole repository at that revision: https://github.com/mozilla/translations/archive/${revision}.tar.gz`,
      "The WebAssembly binary contains Marian (inference/marian-fork, MIT License, text below) and the libraries under inference/3rd_party and inference/marian-fork/src/3rd_party at that revision, whose license files are part of the source code above.",
    ),
    wrap(`Marian, MIT License (copied from ${TEXTS.marian.source}):`),
    marian,
    RULE,
    "3. Dictionary data",
    paragraphs(
      `The dictionary packs are not part of the extension; it downloads them from the project's GitHub releases when the user asks for them. Every pack except English → Simplified Chinese is adapted (extracted, filtered and trimmed) from Wiktionary (Wiktionary contributors, https://www.wiktionary.org/; extracted by wiktextract and published by kaikki.org, https://kaikki.org/) and licensed under CC BY-SA 4.0, ${CC_BY_SA_URL}.`,
      `The English → Simplified Chinese pack is adapted (extracted, filtered and trimmed) from ECDICT, ${ECDICT_COPYRIGHT} (https://github.com/skywind3000/ECDICT), under the MIT License (copied from ${TEXTS.ecdict.source}):`,
    ),
    ecdict,
    RULE,
    "4. License texts",
    ...blocks.map((b) => `${wrap(`[${b.label}] used by ${b.users.join(", ")}:`)}\n\n${b.text}`),
    `Apache License 2.0 (copied from ${TEXTS.apache.source}):`,
    apache,
  ]
  return `${sections.join("\n\n")}\n`
}
