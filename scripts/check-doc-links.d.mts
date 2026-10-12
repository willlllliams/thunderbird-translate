export function slug(heading: string): string
export function anchorsOfText(text: string): Set<string>
export function checkLinks(dir?: string): { problems: string[]; checked: number }
export function pathOfSpan(span: string, directories: ReadonlySet<string>): string | null
export function checkCodePaths(dir?: string): { problems: string[]; checked: number }
