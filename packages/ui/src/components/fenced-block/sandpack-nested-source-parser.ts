import { inferSandpackFileLanguage, type SandpackFile } from './sandpack-source-types'
import type { SandpackSourceParser } from './sandpack-source-parser'
import {
  normalizeSandpackDocument,
  parseSandpackJsonOptions
} from './sandpack-source-document'

export const sandpackNestedSourceParser: SandpackSourceParser = {
  format: 'nested',
  canParse(source) {
    try {
      const normalizedSource = normalizeSource(source)
      const parsed = parseNestedSource(normalizedSource)
      return parsed.files.length > 0
    } catch {
      return false
    }
  },
  parse(source) {
    const normalizedSource = normalizeSource(source)
    const parsed = parseNestedSource(normalizedSource)

    return normalizeSandpackDocument({
      template: parsed.options.template,
      files: parsed.files,
      dependencies: parsed.options.dependencies,
      layout: parsed.options.layout,
      readOnly: parsed.options.readOnly
    })
  }
}

type ParsedNestedSource = {
  files: SandpackFile[]
  options: ReturnType<typeof parseSandpackJsonOptions>
}

function parseNestedSource(source: string): ParsedNestedSource {
  const { optionsSource, sourceAfterOptions } = readLeadingOptionsBlock(source)
  const options = optionsSource ? parseSandpackJsonOptions(optionsSource) : {}
  const files = parseNestedFiles(sourceAfterOptions)

  if (files.length === 0) {
    throw new Error('Sandpack nested source must include at least one file block.')
  }

  return {
    files,
    options
  }
}

function readLeadingOptionsBlock(source: string) {
  const trimmedStartIndex = readNextNonWhitespaceIndex(source, 0)

  if (trimmedStartIndex === source.length || source[trimmedStartIndex] !== '{') {
    return {
      optionsSource: '',
      sourceAfterOptions: source.slice(trimmedStartIndex)
    }
  }

  const endIndex = findBalancedObjectEnd(source, trimmedStartIndex)

  return {
    optionsSource: source.slice(trimmedStartIndex, endIndex),
    sourceAfterOptions: source.slice(readNextNonWhitespaceIndex(source, endIndex), source.length)
  }
}

function parseNestedFiles(source: string) {
  const lines = source.split('\n')
  const files: SandpackFile[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]?.trim()

    if (!line) {
      index += 1
      continue
    }

    const openingFence = readFileFence(lines[index] ?? '')

    if (!openingFence) {
      throw new Error(`Unexpected sandpack content "${lines[index] ?? ''}".`)
    }

    const codeLines: string[] = []
    let hasClosingFence = false
    index += 1

    while (index < lines.length) {
      const currentLine = lines[index] ?? ''

      if (isClosingFence(currentLine, openingFence.fence)) {
        files.push({
          name: openingFence.path,
          code: codeLines.join('\n'),
          language: inferSandpackFileLanguage(openingFence.path)
        })
        index += 1
        hasClosingFence = true
        break
      }

      codeLines.push(currentLine)
      index += 1
    }

    if (!hasClosingFence) {
      throw new Error(`File block "${openingFence.path}" is missing a closing fence.`)
    }
  }

  return files
}

function readFileFence(line: string) {
  const match = /^(?<fence>`{3,})(?<path>[^\r\n`]+)\s*$/.exec(line)

  if (!match?.groups) {
    return null
  }

  const path = match.groups.path.trim()

  if (!path) {
    throw new Error('Sandpack file fence must include a file path.')
  }

  return {
    fence: match.groups.fence,
    path
  }
}

function isClosingFence(line: string, expectedFence: string) {
  return line.trim() === expectedFence
}

function findBalancedObjectEnd(source: string, startIndex: number) {
  let depth = 0
  let quote: '"' | '\'' | null = null
  let escaped = false

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]

    if (!char) {
      break
    }

    if (quote) {
      if (!escaped && char === quote) {
        quote = null
      }

      escaped = !escaped && char === '\\'
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      escaped = false
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        return index + 1
      }
    }
  }

  throw new Error('Sandpack options block is missing a closing brace.')
}

function normalizeSource(source: string) {
  return source.replace(/\r\n/g, '\n').trim()
}

function readNextNonWhitespaceIndex(source: string, startIndex: number) {
  let index = startIndex

  while (index < source.length && /\s/.test(source[index] ?? '')) {
    index += 1
  }

  return index
}
