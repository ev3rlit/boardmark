import { describe, expect, it } from 'vitest'
import { highlightCodeBlock } from './adapter'

describe('highlightCodeBlock', () => {
  it('returns highlighted token lines for supported languages', async () => {
    const result = await highlightCodeBlock({
      code: 'const answer = 42',
      language: 'ts'
    })

    expect(result.kind).toBe('highlighted')

    if (result.kind !== 'highlighted') {
      return
    }

    expect(result.theme).toBe('vscode-dark-modern')
    expect(result.language).toBe('typescript')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.tokens.some((token) => token.content === 'const')).toBe(true)
    expect(result.lines[0]?.tokens.some((token) => typeof token.color === 'string')).toBe(true)
  })

  it('returns plain lines for unsupported languages', async () => {
    const result = await highlightCodeBlock({
      code: 'just text',
      language: 'mermaid'
    })

    expect(result).toEqual({
      kind: 'plain',
      lines: ['just text'],
      theme: 'vscode-dark-modern'
    })
  })

  it('returns plain lines when the language is omitted', async () => {
    const result = await highlightCodeBlock({
      code: 'no language fence'
    })

    expect(result).toEqual({
      kind: 'plain',
      lines: ['no language fence'],
      theme: 'vscode-dark-modern'
    })
  })
})
