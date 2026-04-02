import { describe, expect, it } from 'vitest'
import { resolveCodeLanguage } from './language-registry'

describe('resolveCodeLanguage', () => {
  it('normalizes configured aliases to canonical language ids', () => {
    expect(resolveCodeLanguage('ts')).toEqual({
      kind: 'highlighted',
      language: 'typescript'
    })
    expect(resolveCodeLanguage('js')).toEqual({
      kind: 'highlighted',
      language: 'javascript'
    })
    expect(resolveCodeLanguage('yml')).toEqual({
      kind: 'highlighted',
      language: 'yaml'
    })
    expect(resolveCodeLanguage('terminal')).toEqual({
      kind: 'highlighted',
      language: 'shellsession'
    })
    expect(resolveCodeLanguage('patch')).toEqual({
      kind: 'highlighted',
      language: 'diff'
    })
  })

  it('returns plain fallback for missing and unsupported languages', () => {
    expect(resolveCodeLanguage()).toEqual({ kind: 'plain' })
    expect(resolveCodeLanguage('')).toEqual({ kind: 'plain' })
    expect(resolveCodeLanguage('mermaid')).toEqual({ kind: 'plain' })
    expect(resolveCodeLanguage('unknown-language')).toEqual({ kind: 'plain' })
  })
})
