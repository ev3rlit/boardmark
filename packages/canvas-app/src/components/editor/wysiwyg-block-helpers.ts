export function buildFencedMarkdown(language: string, source: string) {
  const normalizedSource = ensureTrailingNewline(source)
  return `\`\`\`${language}\n${normalizedSource}\`\`\`\n`
}

export function ensureTrailingNewline(value: string) {
  return value.endsWith('\n') ? value : `${value}\n`
}

export function readCodeLanguageLabel(language: string) {
  if (!language) {
    return 'plain'
  }

  return language
}

export function readLineNumbers(source: string) {
  const lineCount = source.length === 0 ? 1 : source.split(/\r\n|\r|\n/).length
  return Array.from({ length: lineCount }, (_, index) => index + 1)
}
