export const LAYERS: Record<string, string[]>
export const TYPE_ONLY_LAYERS: Set<string>
export const VARIANT_LAYERS: Record<string, string>
export function tokensOf(text: string): { kind: number; value: string; start: number }[]
export function importsOf(text: string): { spec: string; line: number; typeOnly: boolean; computed?: true }[]
export function checkImports(dir?: string): { problems: string[]; checked: number }
