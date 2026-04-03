import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('desktop CSP', () => {
  it('allows wasm compilation without enabling unsafe-eval', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'apps/desktop/index.html'),
      'utf8'
    )

    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval' http://localhost:*")
    expect(html).not.toContain("'unsafe-eval'")
  })
})
