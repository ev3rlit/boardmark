import { describe, expect, it } from 'vitest'
import { resolveCodeTheme } from './theme-registry'

describe('resolveCodeTheme', () => {
  it('returns supported canonical theme ids as-is', () => {
    expect(resolveCodeTheme('vscode-dark-modern')).toBe('vscode-dark-modern')
    expect(resolveCodeTheme('vscode-light')).toBe('vscode-light')
    expect(resolveCodeTheme('one-dark')).toBe('one-dark')
    expect(resolveCodeTheme('one-light')).toBe('one-light')
    expect(resolveCodeTheme('github-dark')).toBe('github-dark')
  })

  it('normalizes known shiki theme aliases to the canonical ids', () => {
    expect(resolveCodeTheme('dark-plus')).toBe('vscode-dark-modern')
    expect(resolveCodeTheme('light-plus')).toBe('vscode-light')
    expect(resolveCodeTheme('one-dark-pro')).toBe('one-dark')
  })

  it('falls back to vscode-dark-modern for empty and unsupported input', () => {
    expect(resolveCodeTheme()).toBe('vscode-dark-modern')
    expect(resolveCodeTheme('')).toBe('vscode-dark-modern')
    expect(resolveCodeTheme('nord')).toBe('vscode-dark-modern')
  })
})
