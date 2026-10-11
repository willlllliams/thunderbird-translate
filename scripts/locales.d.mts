export type LocaleTable = Record<string, string>
export type MessagesJson = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>

export function readLocaleSources(dir?: string): Record<string, LocaleTable>
export function placeholderNumbers(text: string): string[]
export function literalTokens(text: string): string[]
export function checkLocales(sources: Record<string, LocaleTable>): string[]
export function toMessagesJson(table: LocaleTable): MessagesJson
export function writeLocales(outDir: string, sources?: Record<string, LocaleTable>): string[]
