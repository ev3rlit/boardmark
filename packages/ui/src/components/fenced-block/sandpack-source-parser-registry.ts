import { sandpackJsonSourceParser } from './sandpack-json-source-parser'
import { sandpackNestedSourceParser } from './sandpack-nested-source-parser'
import type { SandpackSourceParser } from './sandpack-source-parser'
import type { SandpackParseResult } from './sandpack-source-types'

const sandpackSourceParsers: SandpackSourceParser[] = [
  sandpackJsonSourceParser,
  sandpackNestedSourceParser
]

export function composeSandpackSourceInput(input: { source: string; meta?: string }) {
  const source = input.source.replace(/\r\n/g, '\n').trim()
  const meta = input.meta?.trim()

  if (!meta) {
    return source
  }

  if (!source) {
    return meta
  }

  return `${meta}\n\n${source}`
}

export function getRegisteredSandpackSourceParsers() {
  return sandpackSourceParsers
}

export function parseSandpackSource(source: string): SandpackParseResult {
  const parser = sandpackSourceParsers.find((entry) => entry.canParse(source))

  if (!parser) {
    throw new Error('Unsupported sandpack source format.')
  }

  return {
    document: parser.parse(source),
    format: parser.format
  }
}
