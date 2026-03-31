import { describe, expect, it } from 'vitest'
import { parseCanvasDocument } from './index'

describe('parseCanvasDocument', () => {
  it('parses notes, edges, markdown content, and viewport defaults', () => {
    const source = `---
type: canvas
version: 1
---

::: note #idea-a x=100 y=120 color=yellow
# Idea A

\`\`\`ts
const a = 1
\`\`\`
:::

::: note #idea-b x=420 y=240
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
    expect(result.value.ast.nodes[0]?.content).toContain('```ts')
    expect(result.value.ast.edges).toHaveLength(1)
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

::: note #good x=10 y=20
Good
:::

::: note #bad x=oops y=20
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

::: note #a x=10 y=10
A
:::

::: note #b x=220 y=10
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
})
