import { describe, expect, it } from 'vitest'
import type { CanvasSourceRange } from '@boardmark/canvas-domain'
import { parseCanvasDocument } from './index'

describe('parseCanvasDocument', () => {
  it('parses inline-header nodes, edges, metadata, and raw body source maps', () => {
    const source = `---
type: canvas
version: 2
style:
  - https://styles.boardmark.dev/editorial@1.0.0
components:
  - https://components.boardmark.dev/core@1.0.0
defaultStyle: boardmark.editorial.soft
---

::: note { id: idea-a, at: { x: 100, y: 120, w: 320, h: 220 }, style: { themeRef: boardmark.editorial.soft, overrides: { fill: "#fff9db", text: "#1f2937" } } }
# Idea A

\`\`\`md
:::
\`\`\`
:::

::: boardmark.calender { id: calendar-q2, at: { x: 420, y: 240, w: 360, h: 260 } }
\`\`\`yaml props
range: "2026-Q2"
density: compact
\`\`\`
:::

::: edge { id: flow, from: idea-a, to: calendar-q2, style: { themeRef: boardmark.editorial.soft } }
\`\`\`yaml props
line: curve
\`\`\`
Connects **two** ideas.
:::`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.frontmatter.style).toEqual([
      'https://styles.boardmark.dev/editorial@1.0.0'
    ])
    expect(result.value.ast.frontmatter.components).toEqual([
      'https://components.boardmark.dev/core@1.0.0'
    ])
    expect(result.value.ast.frontmatter.defaultStyle).toBe('boardmark.editorial.soft')
    expect(result.value.ast.nodes).toHaveLength(2)

    const firstNode = result.value.ast.nodes[0]

    expect(firstNode?.component).toBe('note')
    expect(firstNode?.at).toEqual({ x: 100, y: 120, w: 320, h: 220 })
    expect(firstNode?.style).toEqual({
      themeRef: 'boardmark.editorial.soft',
      overrides: {
        fill: '#fff9db',
        text: '#1f2937'
      }
    })
    expect(firstNode?.body).toContain('```md')
    expect(readRangeText(source, firstNode?.sourceMap.headerLineRange)).toContain('::: note')
    expect(readRangeText(source, firstNode?.sourceMap.metadataRange)).toContain('id: idea-a')
    expect(readRangeText(source, firstNode?.sourceMap.bodyRange)).toContain('# Idea A')
    expect(firstNode?.sourceMap.objectRange.start.line).toBe(11)
    expect(firstNode?.sourceMap.closingLineRange.start.line).toBe(17)

    const secondNode = result.value.ast.nodes[1]

    expect(secondNode?.component).toBe('boardmark.calender')
    expect(secondNode?.body).toContain('```yaml props')

    expect(result.value.ast.edges).toEqual([
      expect.objectContaining({
        id: 'flow',
        from: 'idea-a',
        to: 'calendar-q2',
        body: expect.stringContaining('Connects **two** ideas.')
      })
    ])
    expect(readRangeText(source, result.value.ast.edges[0]?.sourceMap.metadataRange)).toBe(
      '{ id: flow, from: idea-a, to: calendar-q2, style: { themeRef: boardmark.editorial.soft } }'
    )
    expect(result.value.issues).toEqual([])
  })

  it('fails fatally when frontmatter is invalid', () => {
    const result = parseCanvasDocument(`---
type: note
version: 2
---
`)

    expect(result.isErr()).toBe(true)

    if (result.isOk()) {
      return
    }

    expect(result.error.kind).toBe('invalid-frontmatter')
  })

  it('skips invalid nodes and keeps valid objects', () => {
    const source = `---
type: canvas
version: 2
---

::: note { id: good, at: { x: 10, y: 20, w: 320, h: 220 } }
Good
:::

::: note { id: bad, at: { x: nope, y: 20, w: 320, h: 220 } }
Bad
:::

::: note
Missing metadata
:::
`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes.map((node) => node.id)).toEqual(['good'])
    expect(result.value.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'invalid-node' }),
        expect.objectContaining({ kind: 'invalid-node' })
      ])
    )
  })

  it('rejects unsupported top-level header keys like props', () => {
    const source = `---
type: canvas
version: 2
---

::: note { id: legacy, at: { x: 10, y: 20, w: 320, h: 220 }, props: { palette: amber } }
Legacy
:::
`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes).toEqual([])
    expect(result.value.issues).toEqual([
      expect.objectContaining({
        kind: 'invalid-node',
        message: expect.stringContaining('unsupported top-level keys: props')
      })
    ])
  })

  it('skips invalid edges and missing references individually', () => {
    const source = `---
type: canvas
version: 2
---

::: note { id: a, at: { x: 10, y: 10, w: 320, h: 220 } }
A
:::

::: note { id: b, at: { x: 220, y: 10, w: 320, h: 220 } }
B
:::

::: edge { id: valid, from: a, to: b }
Valid edge
:::

::: edge { id: missing, from: a, to: ghost }
Missing endpoint
:::

::: edge { id: broken, from: a }
Broken edge
:::
`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.edges.map((edge) => edge.id)).toEqual(['valid'])
    expect(result.value.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'invalid-edge', objectId: 'missing' }),
        expect.objectContaining({ kind: 'invalid-edge', objectId: 'broken' })
      ])
    )
  })

  it('ignores ::: markers inside fenced code blocks and preserves raw body', () => {
    const source = `---
type: canvas
version: 2
---

::: note { id: fenced, at: { x: 24, y: 32, w: 320, h: 220 } }
\`\`\`ts
const block = "::: not a directive"
\`\`\`

After fence.
:::
`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes[0]?.body).toBe('```ts\nconst block = "::: not a directive"\n```\n\nAfter fence.\n')
    expect(result.value.issues).toEqual([])
  })

  it('parses image nodes with assetPolicy frontmatter', () => {
    const source = `---
type: canvas
version: 2
assetPolicy: document-adjacent
---

::: image { id: hero-shot, src: "./hero.assets/hero-shot.png", alt: "Main capture", title: Hero, lockAspectRatio: true, at: { x: 240, y: 160, w: 420, h: 280 } }
:::`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.frontmatter.assetPolicy).toBe('document-adjacent')
    expect(result.value.ast.nodes[0]).toEqual(
      expect.objectContaining({
        component: 'image',
        src: './hero.assets/hero-shot.png',
        alt: 'Main capture',
        title: 'Hero',
        lockAspectRatio: true
      })
    )
  })

  it('rejects image nodes with body content', () => {
    const source = `---
type: canvas
version: 2
---

::: image { id: hero-shot, src: "./hero.assets/hero-shot.png", alt: "Main capture", lockAspectRatio: true, at: { x: 240, y: 160, w: 420, h: 280 } }
not allowed
:::`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes).toEqual([])
    expect(result.value.issues).toEqual([
      expect.objectContaining({
        kind: 'invalid-node',
        message: expect.stringContaining('must not define a body')
      })
    ])
  })
})

function readRangeText(source: string, range: CanvasSourceRange | undefined): string {
  if (!range) {
    return ''
  }

  return source.slice(range.start.offset, range.end.offset)
}
