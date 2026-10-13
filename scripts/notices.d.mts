export interface PackageDeclaration {
  license: string
  licenseFile?: string
  source?: string
}
export interface PackageNotice {
  name: string
  version: string
  license: string
  copyright: string
  text: string
  source?: string
  repository?: string
}
export const PACKAGES: Record<string, PackageDeclaration>
export const TEXTS: Record<"apache" | "marian" | "ecdict", { file: string; source: string }>
export const CC_BY_SA_URL: string
export const MPL_URL: string
export const ECDICT_COPYRIGHT: string
export const NOTO_COPYRIGHT: string
export const OFL_URL: string
export function bundledPackages(inputs: string[]): Map<string, string>
export function copyrightLine(text: string): string | null
export function packageNotices(options: { root: string; inputs: string[]; packages?: Record<string, PackageDeclaration> }): PackageNotice[]
export function thirdPartyNotices(options: { root: string; inputs: string[]; version: string; packages?: Record<string, PackageDeclaration> }): string
