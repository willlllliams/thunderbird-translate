export const LAYERS: Record<string, string[]>
export const TYPE_ONLY_LAYERS: Set<string>
export function withoutComments(text: string): string
export function importsOf(text: string): { spec: string; line: number; typeOnly: boolean }[]
export function checkImports(dir?: string): { problems: string[]; checked: number }
