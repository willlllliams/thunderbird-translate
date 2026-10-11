/**
 * Model records from Mozilla Remote Settings (main/translations-models-v2)
 * and the rules that pick one set of files per direction pair.
 *
 * The rules follow Firefox: only major version 3, no pre-releases ("3.0a1"),
 * only records meant for desktop, the highest version per file name and
 * pair, and every file of a pair at the same version as its model file.
 */

import { pairKey } from "./languages"

export const MODEL_FILE_TYPES = ["model", "lex", "vocab", "srcvocab", "trgvocab"] as const
export type ModelFileType = (typeof MODEL_FILE_TYPES)[number]

export interface RemoteAttachment {
  /** Path below the attachments base URL. */
  location: string
  /** sha256 (hex) of the compressed file. */
  hash: string
  /** Size of the compressed file. */
  size: number
}

/** Fields of a translations-models-v2 record that the extension uses. */
export interface ModelRecord {
  id?: string
  name: string
  sourceLanguage: string
  targetLanguage: string
  fileType: string
  version: string
  architecture?: string
  filter_expression?: string
  attachment: RemoteAttachment
  /** sha256 (hex) of the decompressed file. */
  decompressedHash: string
  decompressedSize: number
}

/** The files of one direction pair, ready to download. */
export interface PairFiles {
  src: string
  tgt: string
  version: string
  architecture: string
  files: ModelRecord[]
  /** Compressed size of all files (download size). */
  bytes: number
  /** Decompressed size of all files. */
  rawBytes: number
}

/** Filter expressions that hold on Thunderbird desktop, release channel. */
const ACCEPTED_FILTERS = new Set(["", "env.appinfo.OS != 'Android'"])

/** "3.0", "3.1"; pre-releases such as "3.0a1" do not match. */
const SUPPORTED_VERSION = /^3\.(\d+)$/

/** Compare "3.10" and "3.2" numerically: >0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function isUsable(r: ModelRecord): boolean {
  return (
    typeof r.name === "string" &&
    typeof r.sourceLanguage === "string" &&
    typeof r.targetLanguage === "string" &&
    !!r.attachment &&
    typeof r.attachment.location === "string" &&
    typeof r.attachment.hash === "string" &&
    typeof r.decompressedHash === "string" &&
    SUPPORTED_VERSION.test(r.version ?? "") &&
    ACCEPTED_FILTERS.has(r.filter_expression ?? "") &&
    (MODEL_FILE_TYPES as readonly string[]).includes(r.fileType)
  )
}

/**
 * One file set per direction pair, keyed by pairKey(). Pairs whose files
 * are incomplete (no model, no vocabulary) are left out. When a pair has
 * both a shared vocabulary and separate source/target vocabularies at the
 * model's version, the shared one is used.
 */
export function selectPairs(records: readonly ModelRecord[]): Map<string, PairFiles> {
  // Highest version per pair and file name.
  const newest = new Map<string, ModelRecord>()
  for (const r of records) {
    if (!isUsable(r)) continue
    const k = `${pairKey(r.sourceLanguage, r.targetLanguage)}|${r.name}`
    const prev = newest.get(k)
    if (!prev || compareVersions(r.version, prev.version) > 0) newest.set(k, r)
  }

  const byPair = new Map<string, ModelRecord[]>()
  for (const r of newest.values()) {
    const k = pairKey(r.sourceLanguage, r.targetLanguage)
    const list = byPair.get(k)
    if (list) list.push(r)
    else byPair.set(k, [r])
  }

  const result = new Map<string, PairFiles>()
  for (const [key, list] of byPair) {
    const models = list.filter((r) => r.fileType === "model").sort((a, b) => compareVersions(b.version, a.version))
    const model = models[0]
    if (!model) continue
    const sameVersion = list.filter((r) => r.version === model.version)
    const pick = (type: ModelFileType) => sameVersion.find((r) => r.fileType === type)
    const lex = pick("lex")
    const vocab = pick("vocab")
    const srcvocab = pick("srcvocab")
    const trgvocab = pick("trgvocab")
    const vocabFiles = vocab ? [vocab] : srcvocab && trgvocab ? [srcvocab, trgvocab] : null
    if (!vocabFiles) continue
    const files = [model, ...(lex ? [lex] : []), ...vocabFiles]
    result.set(key, {
      src: model.sourceLanguage,
      tgt: model.targetLanguage,
      version: model.version,
      architecture: model.architecture ?? "",
      files,
      bytes: files.reduce((n, f) => n + (f.attachment.size || 0), 0),
      rawBytes: files.reduce((n, f) => n + (f.decompressedSize || 0), 0),
    })
  }
  return result
}

/** Memory alignment that Bergamot expects for each file type. */
export function fileAlignment(fileType: string): number {
  return fileType === "model" ? 256 : 64
}

/** Marian decoder options for one model, in the "key: value" text form Bergamot parses. */
export function modelConfig(modelFileName: string): string {
  const options: Record<string, string> = {
    "beam-size": "1",
    normalize: "1.0",
    "word-penalty": "0",
    "max-length-break": "128",
    "mini-batch-words": "1024",
    workspace: "128",
    "max-length-factor": "2.0",
    "skip-cost": "true",
    "cpu-threads": "0",
    quiet: "true",
    "quiet-translation": "true",
    "gemm-precision": modelFileName.endsWith("intgemm8.bin") ? "int8shiftAll" : "int8shiftAlphaAll",
    alignment: "soft",
  }
  return `\n${Object.entries(options)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n`
}
