import { err, ok, type Result } from 'neverthrow'

export type ParsedObjectHeader = {
  format: 'json' | 'legacy'
  value: Record<string, unknown>
}

export function parseJsonObjectHeader(source: string): Result<Record<string, unknown>, string> {
  try {
    const parsed = JSON.parse(source)

    if (!isRecord(parsed)) {
      return err('Object header must be a JSON object.')
    }

    return ok(parsed)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Object header JSON could not be parsed.')
  }
}

export function parseObjectHeader(source: string): Result<ParsedObjectHeader, string> {
  const jsonResult = parseJsonObjectHeader(source)

  if (jsonResult.isOk()) {
    return ok({
      format: 'json',
      value: jsonResult.value
    })
  }

  const legacyResult = parseLegacyObjectHeader(source)

  if (legacyResult.isOk()) {
    return ok({
      format: 'legacy',
      value: legacyResult.value
    })
  }

  return err(legacyResult.error)
}

export function stringifyObjectHeader(value: Record<string, unknown>) {
  return JSON.stringify(stripUndefinedValues(value))
}

function parseLegacyObjectHeader(source: string): Result<Record<string, unknown>, string> {
  try {
    const parser = new LegacyObjectHeaderParser(source)
    const value = parser.parse()

    if (!isRecord(value)) {
      return err('Object header must be an object.')
    }

    return ok(value)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Legacy object header could not be parsed.')
  }
}

class LegacyObjectHeaderParser {
  private index = 0

  constructor(private readonly source: string) {}

  parse(): Record<string, unknown> {
    this.skipWhitespace()
    const value = this.parseObject()
    this.skipWhitespace()

    if (!this.isAtEnd()) {
      throw new Error('Unexpected trailing content in object header.')
    }

    return value
  }

  private parseObject(): Record<string, unknown> {
    this.expect('{')
    const object: Record<string, unknown> = {}
    this.skipWhitespace()

    while (!this.tryConsume('}')) {
      const key = this.parseKey()
      this.skipWhitespace()
      this.expect(':')
      this.skipWhitespace()
      object[key] = this.parseValue()
      this.skipWhitespace()

      if (!this.tryConsume(',')) {
        this.skipWhitespace()
        this.expect('}')
        break
      }

      this.skipWhitespace()

      if (this.tryConsume('}')) {
        break
      }
    }

    return object
  }

  private parseArray(): unknown[] {
    this.expect('[')
    const values: unknown[] = []
    this.skipWhitespace()

    while (!this.tryConsume(']')) {
      values.push(this.parseValue())
      this.skipWhitespace()

      if (!this.tryConsume(',')) {
        this.skipWhitespace()
        this.expect(']')
        break
      }

      this.skipWhitespace()

      if (this.tryConsume(']')) {
        break
      }
    }

    return values
  }

  private parseValue(): unknown {
    this.skipWhitespace()
    const char = this.peek()

    if (!char) {
      throw new Error('Unexpected end of object header.')
    }

    if (char === '{') {
      return this.parseObject()
    }

    if (char === '[') {
      return this.parseArray()
    }

    if (char === '"' || char === '\'') {
      return this.parseQuotedString()
    }

    const bareValue = this.parseBareValue()

    if (bareValue === 'true') {
      return true
    }

    if (bareValue === 'false') {
      return false
    }

    if (bareValue === 'null') {
      return null
    }

    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(bareValue)) {
      return Number(bareValue)
    }

    return bareValue
  }

  private parseKey() {
    this.skipWhitespace()
    const char = this.peek()

    if (char === '"' || char === '\'') {
      return this.parseQuotedString()
    }

    const start = this.index

    while (!this.isAtEnd()) {
      const current = this.peek()

      if (!current || current === ':' || /\s/.test(current)) {
        break
      }

      this.index += 1
    }

    const value = this.source.slice(start, this.index)

    if (!value) {
      throw new Error('Expected an object header key.')
    }

    return value
  }

  private parseBareValue() {
    const start = this.index

    while (!this.isAtEnd()) {
      const current = this.peek()

      if (!current || current === ',' || current === '}' || current === ']' || /\s/.test(current)) {
        break
      }

      this.index += 1
    }

    const value = this.source.slice(start, this.index)

    if (!value) {
      throw new Error('Expected an object header value.')
    }

    return value
  }

  private parseQuotedString() {
    const quote = this.peek()

    if (quote !== '"' && quote !== '\'') {
      throw new Error('Expected a quoted string.')
    }

    this.index += 1
    let value = ''
    let escaped = false

    while (!this.isAtEnd()) {
      const char = this.peek()

      if (!char) {
        break
      }

      this.index += 1

      if (escaped) {
        value += char
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === quote) {
        return value
      }

      value += char
    }

    throw new Error('Unterminated string in object header.')
  }

  private expect(expected: string) {
    if (!this.tryConsume(expected)) {
      throw new Error(`Expected "${expected}" in object header.`)
    }
  }

  private tryConsume(expected: string) {
    if (this.source[this.index] !== expected) {
      return false
    }

    this.index += 1
    return true
  }

  private skipWhitespace() {
    while (!this.isAtEnd() && /\s/.test(this.source[this.index] ?? '')) {
      this.index += 1
    }
  }

  private peek() {
    return this.source[this.index]
  }

  private isAtEnd() {
    return this.index >= this.source.length
  }
}

function stripUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedValues(entry))
  }

  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedValues(entry)])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
