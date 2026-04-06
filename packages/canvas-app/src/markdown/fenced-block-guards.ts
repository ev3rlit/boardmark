const OPENING_CODE_BLOCK_PATTERN = /^```([A-Za-z0-9_-]+)?$/

export function readFenceToken(line: string): '```' | '~~~' | null {
  if (line.startsWith('```')) {
    return '```'
  }

  if (line.startsWith('~~~')) {
    return '~~~'
  }

  return null
}

export function hasUnclosedFencedBlock(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let fenceMarker: '```' | '~~~' | null = null

  for (const line of lines) {
    const token = readFenceToken(line)

    if (!token) {
      continue
    }

    fenceMarker = fenceMarker === token ? null : token
  }

  return fenceMarker !== null
}

export function readOpeningCodeFenceLanguage(value: string) {
  const match = OPENING_CODE_BLOCK_PATTERN.exec(value.trim())

  if (!match) {
    return null
  }

  return match[1] ?? ''
}
