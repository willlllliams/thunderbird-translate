export const LAYERS: Record<string, string[]>
export const E2E_IMPORTERS: Set<string>
export function withoutComments(text: string): string
export function importsOf(text: string): { spec: string; line: number }[]
export function checkImports(dir?: string): { problems: string[]; checked: number }
