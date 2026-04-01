import { describe, expect, it } from 'vitest'
import type { CanvasSourceRange } from '@boardmark/canvas-domain'
import { parseCanvasDocument } from './index'

describe('parseCanvasDocument', () => {
  it('parses notes, edges, markdown content, and viewport defaults', () => {
    const source = `---
type: canvas
version: 1
---

::: note #idea-a x=100 y=120 w=320 h=220 color=yellow
# Idea A

\`\`\`ts
const a = 1
\`\`\`
:::

::: note #idea-b x=420 y=240 w=320 h=220
Idea B
:::

::: edge #flow from=idea-a to=idea-b kind=curve
Connects **two** ideas.
:::`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.frontmatter.viewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1
    })
    expect(result.value.ast.nodes).toHaveLength(2)
    const firstNode = result.value.ast.nodes[0]

    expect(firstNode?.type).toBe('note')

    if (!firstNode || firstNode.type !== 'note') {
      return
    }

    expect(firstNode.content).toContain('```ts')
    expect(readRangeText(source, firstNode.sourceMap.objectRange)).toBe(`::: note #idea-a x=100 y=120 w=320 h=220 color=yellow
# Idea A

\`\`\`ts
const a = 1
\`\`\`
:::`)
    expect(readRangeText(source, firstNode.sourceMap.openingLineRange)).toBe(
      '::: note #idea-a x=100 y=120 w=320 h=220 color=yellow'
    )
    expect(firstNode.w).toBe(320)
    expect(firstNode.h).toBe(220)
    expect(readRangeText(source, firstNode.sourceMap.bodyRange)).toBe(`# Idea A

\`\`\`ts
const a = 1
\`\`\`
`)
    expect(readRangeText(source, firstNode.sourceMap.closingLineRange)).toBe(':::')
    expect(firstNode.sourceMap.objectRange.start.line).toBe(6)
    expect(firstNode.sourceMap.closingLineRange.start.line).toBe(12)
    expect(result.value.ast.edges).toHaveLength(1)
    expect(readRangeText(source, result.value.ast.edges[0]?.sourceMap.openingLineRange)).toBe(
      '::: edge #flow from=idea-a to=idea-b kind=curve'
    )
    expect(readRangeText(source, result.value.ast.edges[0]?.sourceMap.bodyRange)).toBe(
      'Connects **two** ideas.\n'
    )
    expect(result.value.ast.edges[0]?.sourceMap.objectRange.start.line).toBe(18)
    expect(result.value.issues).toEqual([])
  })

  it('fails fatally when frontmatter is invalid', () => {
    const result = parseCanvasDocument(`---
type: note
version: 1
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
version: 1
---

::: note #good x=10 y=20 w=320 h=220
Good
:::

::: note #bad x=oops y=20 w=320 h=220
Bad
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
        expect.objectContaining({
          kind: 'invalid-node'
        })
      ])
    )
  })

  it('skips invalid edges and missing references individually', () => {
    const source = `---
type: canvas
version: 1
---

::: note #a x=10 y=10 w=320 h=220
A
:::

::: note #b x=220 y=10 w=320 h=220
B
:::

::: edge #valid from=a to=b kind=curve
Valid edge
:::

::: edge #missing from=a to=ghost
Missing endpoint
:::

::: edge #broken from=a
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

  it('records unsupported node types as issues', () => {
    const source = `---
type: canvas
version: 1
---

::: code #snippet x=10 y=20
console.log('skip')
:::
`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes).toEqual([])
    expect(result.value.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unsupported-node-type'
        })
      ])
    )
  })

  it('parses shape directives with renderer metadata and label body', () => {
    const source = `---
type: canvas
version: 1
---

::: shape #frame-a x=120 y=140 w=420 h=280 renderer=boardmark.shape.roundRect palette=neutral tone=soft
Frame
:::`

    const result = parseCanvasDocument(source)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes).toHaveLength(1)
    const firstNode = result.value.ast.nodes[0]

    expect(firstNode?.type).toBe('shape')

    if (!firstNode || firstNode.type !== 'shape') {
      return
    }

    expect(firstNode.rendererKey).toBe('boardmark.shape.roundRect')
    expect(firstNode.palette).toBe('neutral')
    expect(firstNode.tone).toBe('soft')
    expect(firstNode.label).toBe('Frame')
    expect(firstNode.w).toBe(420)
    expect(firstNode.h).toBe(280)
  })
})

function readRangeText(source: string, range: CanvasSourceRange | undefined): string {
  if (!range) {
    return ''
  }

  return source.slice(range.start.offset, range.end.offset)
}
