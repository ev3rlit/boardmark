export function buildFencedMarkdown(language: string, source: string) {
  return `\`\`\`${language}\n${source}\n\`\`\``
}

export function ensureTrailingNewline(value: string) {
  return value.endsWith('\n') ? value : `${value}\n`
}

export function readLineNumbers(source: string) {
  return source.split('\n').map((_, index) => index + 1)
}

export function readCodeLanguageLabel(language: string | null | undefined) {
  return language && language.trim() ? language : 'plain text'
}

export function normalizeMarkdownForComparison(markdown: string) {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
