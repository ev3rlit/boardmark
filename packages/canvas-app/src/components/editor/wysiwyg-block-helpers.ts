export function buildFencedMarkdown(language: string, source: string) {
  const normalizedSource = ensureTrailingNewline(source)
  return `\`\`\`${language}\n${normalizedSource}\`\`\`\n`
}

export function buildRawFencedMarkdown(input: {
  openingFence: string
  source: string
  closingFence: string
}) {
  const lines = [input.openingFence]

  if (input.source.length > 0) {
    lines.push(...input.source.replace(/\r\n/g, '\n').split('\n'))
  } else if (input.closingFence.length > 0) {
    lines.push('')
  }

  if (input.closingFence.length > 0) {
    lines.push(input.closingFence)
  }

  return lines.join('\n')
}

export function parseRawFencedMarkdown(rawMarkdown: string) {
  const normalizedMarkdown = rawMarkdown.replace(/\r\n/g, '\n')
  const lines = normalizedMarkdown.split('\n')

  if (lines.length === 0) {
    return {
      openingFence: '',
      source: '',
      closingFence: ''
    }
  }

  if (lines.length === 1) {
    return {
      openingFence: lines[0] ?? '',
      source: '',
      closingFence: ''
    }
  }

  return {
    openingFence: lines[0] ?? '',
    source: lines.slice(1, -1).join('\n'),
    closingFence: lines[lines.length - 1] ?? ''
  }
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
