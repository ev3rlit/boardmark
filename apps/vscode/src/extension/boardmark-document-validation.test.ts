import { describe, expect, it } from 'vitest'
import { validateBoardmarkDocument } from './boardmark-document-validation'

describe('validateBoardmarkDocument', () => {
  it('accepts markdown with Boardmark canvas frontmatter', () => {
    const result = validateBoardmarkDocument(`---
type: canvas
version: 2
---

::: note {"id":"intro","at":{"x":0,"y":0,"w":320,"h":220}}
Hello
:::
`, 'file:///workspace/board.md')

    expect(result).toEqual({ status: 'valid' })
  })

  it('rejects ordinary markdown without canvas frontmatter', () => {
    const result = validateBoardmarkDocument('# Ordinary Markdown\n', 'file:///workspace/readme.md')

    expect(result.status).toBe('invalid')

    if (result.status === 'invalid') {
      expect(result.message).toContain('type: canvas')
      expect(result.message).toContain('version')
    }
  })
})
