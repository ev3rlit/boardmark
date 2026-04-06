import { describe, expect, it } from 'vitest'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import { createCanvasDocumentEditService } from '@canvas-app/services/edit-service'

const source = `---
type: canvas
version: 2
---

::: group { id: ideation-group, z: 1 }
~~~yaml members
nodes:
  - welcome
~~~
:::

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, z: 2 }
Boardmark Viewer
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 }, z: 3 }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview, z: 4 }
main thread
:::`

const sparseBringForwardSource = `---
type: canvas
version: 2
---

::: note { id: alpha, at: { x: 80, y: 72, w: 200, h: 120 }, z: 100 }
Alpha
:::

::: note { id: beta, at: { x: 320, y: 72, w: 200, h: 120 }, z: 200 }
Beta
:::

::: note { id: gamma, at: { x: 560, y: 72, w: 200, h: 120 }, z: 500 }
Gamma
:::

::: note { id: delta, at: { x: 800, y: 72, w: 200, h: 120 }, z: 900 }
Delta
:::`

const localRenumberSource = `---
type: canvas
version: 2
---

::: note { id: alpha, at: { x: 80, y: 72, w: 200, h: 120 }, z: 100 }
Alpha
:::

::: note { id: beta, at: { x: 320, y: 72, w: 200, h: 120 }, z: 150 }
Beta
:::

::: note { id: gamma, at: { x: 560, y: 72, w: 200, h: 120 }, z: 200 }
Gamma
:::

::: note { id: delta, at: { x: 800, y: 72, w: 200, h: 120 }, z: 201 }
Delta
:::`

const contiguousSelectionSource = `---
type: canvas
version: 2
---

::: note { id: alpha, at: { x: 80, y: 72, w: 200, h: 120 }, z: 100 }
Alpha
:::

::: note { id: beta, at: { x: 320, y: 72, w: 200, h: 120 }, z: 150 }
Beta
:::

::: note { id: charlie, at: { x: 560, y: 72, w: 200, h: 120 }, z: 250 }
Charlie
:::

::: note { id: delta, at: { x: 800, y: 72, w: 200, h: 120 }, z: 300 }
Delta
:::

::: note { id: epsilon, at: { x: 1040, y: 72, w: 200, h: 120 }, z: 700 }
Epsilon
:::`

const mixedOrderingSource = `---
type: canvas
version: 2
---

::: group { id: cluster, z: 100 }
~~~yaml members
nodes: []
~~~
:::

::: note { id: card, at: { x: 80, y: 72, w: 240, h: 160 }, z: 200 }
Card
:::

::: edge { id: card-link, from: card, to: after, z: 300 }
Link
:::

::: note { id: after, at: { x: 360, y: 72, w: 240, h: 160 }, z: 301 }
After
:::`

describe('canvas document edit service compiler', () => {
  it('compiles nudge-objects into header edits without structural impact', () => {
    const record = readRecord(source, 'nudge.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(source, record, {
      kind: 'nudge-objects',
      nodeIds: ['welcome', 'overview'],
      dx: 10,
      dy: -2
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.intentKind).toBe('nudge-objects')
    expect(result.value.edits).toHaveLength(2)
    expect(result.value.edits).toEqual([
      expect.objectContaining({
        anchor: {
          kind: 'header-line',
          objectId: 'welcome',
          objectKind: 'node'
        },
        lineDeltaBehavior: 'preserve',
        structuralImpact: 'none'
      }),
      expect.objectContaining({
        anchor: {
          kind: 'header-line',
          objectId: 'overview',
          objectKind: 'node'
        },
        lineDeltaBehavior: 'preserve',
        structuralImpact: 'none'
      })
    ])
    expect(result.value.edits[0]?.replacement).toContain('x: 90')
    expect(result.value.edits[1]?.replacement).toContain('x: 390')
  })

  it('compiles arrange-objects into z-only header edits', () => {
    const record = readRecord(source, 'arrange.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(source, record, {
      kind: 'arrange-objects',
      groupIds: ['ideation-group'],
      nodeIds: ['overview'],
      edgeIds: ['welcome-overview'],
      mode: 'bring-to-front'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.intentKind).toBe('arrange-objects')
    expect(result.value.edits).toHaveLength(3)
    expect(result.value.edits.map((edit) => edit.anchor)).toEqual([
      { kind: 'header-line', objectId: 'ideation-group', objectKind: 'group' },
      { kind: 'header-line', objectId: 'overview', objectKind: 'node' },
      { kind: 'header-line', objectId: 'welcome-overview', objectKind: 'edge' }
    ])
    expect(result.value.edits.every((edit) => edit.lineDeltaBehavior === 'preserve')).toBe(true)
    expect(result.value.edits.every((edit) => edit.structuralImpact === 'none')).toBe(true)
    expect(readReplacementZ(result.value.edits[0]!)).toBe(104)
    expect(readReplacementZ(result.value.edits[1]!)).toBe(204)
    expect(readReplacementZ(result.value.edits[2]!)).toBe(304)
  })

  it('patches only selected objects when bring-forward has enough z gap', () => {
    const record = readRecord(sparseBringForwardSource, 'relative-gap.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(sparseBringForwardSource, record, {
      kind: 'arrange-objects',
      nodeIds: ['beta'],
      edgeIds: [],
      mode: 'bring-forward'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits).toHaveLength(1)
    expect(result.value.edits[0]?.anchor).toEqual({
      kind: 'header-line',
      objectId: 'beta',
      objectKind: 'node'
    })
    expect(readReplacementZ(result.value.edits[0]!)).toBeGreaterThan(500)
    expect(readReplacementZ(result.value.edits[0]!)).toBeLessThan(900)
    expect(result.value.edits.every((edit) => edit.anchor.kind === 'header-line')).toBe(true)
  })

  it('limits local renumbering to the boundary window when the immediate gap is exhausted', () => {
    const record = readRecord(localRenumberSource, 'relative-local.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(localRenumberSource, record, {
      kind: 'arrange-objects',
      nodeIds: ['beta'],
      edgeIds: [],
      mode: 'bring-forward'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits.map((edit) => edit.anchor)).toEqual([
      { kind: 'header-line', objectId: 'gamma', objectKind: 'node' },
      { kind: 'header-line', objectId: 'beta', objectKind: 'node' }
    ])
    expect(readReplacementZ(result.value.edits[0]!)).toBeGreaterThan(100)
    expect(readReplacementZ(result.value.edits[0]!)).toBeLessThan(readReplacementZ(result.value.edits[1]!))
    expect(readReplacementZ(result.value.edits[1]!)).toBeLessThan(201)
  })

  it('preserves contiguous selection order inside a one-slot bring-forward move', () => {
    const record = readRecord(contiguousSelectionSource, 'relative-block.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(contiguousSelectionSource, record, {
      kind: 'arrange-objects',
      nodeIds: ['beta', 'charlie'],
      edgeIds: [],
      mode: 'bring-forward'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits).toHaveLength(2)
    expect(result.value.edits.map((edit) => edit.anchor)).toEqual([
      { kind: 'header-line', objectId: 'beta', objectKind: 'node' },
      { kind: 'header-line', objectId: 'charlie', objectKind: 'node' }
    ])
    expect(readReplacementZ(result.value.edits[0]!)).toBeGreaterThan(300)
    expect(readReplacementZ(result.value.edits[0]!)).toBeLessThan(readReplacementZ(result.value.edits[1]!))
    expect(readReplacementZ(result.value.edits[1]!)).toBeLessThan(700)
  })

  it('keeps one-slot semantics for mixed top-level kinds and still emits header-line edits only', () => {
    const record = readRecord(mixedOrderingSource, 'mixed-order.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(mixedOrderingSource, record, {
      kind: 'arrange-objects',
      nodeIds: ['card'],
      edgeIds: [],
      mode: 'bring-forward'
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits.map((edit) => edit.anchor)).toEqual([
      { kind: 'header-line', objectId: 'card-link', objectKind: 'edge' },
      { kind: 'header-line', objectId: 'card', objectKind: 'node' }
    ])
    expect(readReplacementZ(result.value.edits[0]!)).toBeGreaterThan(100)
    expect(readReplacementZ(result.value.edits[0]!)).toBeLessThan(readReplacementZ(result.value.edits[1]!))
    expect(readReplacementZ(result.value.edits[1]!)).toBeLessThan(301)
    expect(result.value.edits.every((edit) => edit.anchor.kind === 'header-line')).toBe(true)
    expect(result.value.edits.every((edit) => edit.lineDeltaBehavior === 'preserve')).toBe(true)
    expect(result.value.edits.every((edit) => edit.structuralImpact === 'none')).toBe(true)
  })

  it('compiles set-objects-locked into header edits for explicit targets', () => {
    const record = readRecord(source, 'lock.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(source, record, {
      kind: 'set-objects-locked',
      groupIds: ['ideation-group'],
      nodeIds: ['welcome'],
      edgeIds: ['welcome-overview'],
      locked: true
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits).toHaveLength(3)
    expect(result.value.edits).toEqual([
      expect.objectContaining({
        anchor: { kind: 'header-line', objectId: 'ideation-group', objectKind: 'group' },
        lineDeltaBehavior: 'preserve',
        structuralImpact: 'none'
      }),
      expect.objectContaining({
        anchor: { kind: 'header-line', objectId: 'welcome', objectKind: 'node' },
        lineDeltaBehavior: 'preserve',
        structuralImpact: 'none'
      }),
      expect.objectContaining({
        anchor: { kind: 'header-line', objectId: 'welcome-overview', objectKind: 'edge' },
        lineDeltaBehavior: 'preserve',
        structuralImpact: 'none'
      })
    ])
  })

  it('compiles delete-objects into structural object removals including implicit edges', () => {
    const record = readRecord(source, 'delete.canvas.md')
    const editService = createCanvasDocumentEditService()
    const result = editService.compileTransaction(source, record, {
      kind: 'delete-objects',
      groupIds: ['ideation-group'],
      nodeIds: [],
      edgeIds: []
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits.map((edit) => edit.anchor)).toEqual([
      { kind: 'object', objectId: 'ideation-group', objectKind: 'group' },
      { kind: 'object', objectId: 'welcome', objectKind: 'node' },
      { kind: 'object', objectId: 'welcome-overview', objectKind: 'edge' }
    ])
    expect(result.value.edits.every((edit) => edit.structuralImpact === 'structure')).toBe(true)
    expect(result.value.edits.every((edit) => edit.lineDeltaBehavior === 'change')).toBe(true)
  })
})

function readRecord(source: string, name: string) {
  const repository = createCanvasMarkdownDocumentRepository()
  const recordResult = repository.readSource({
    locator: {
      kind: 'memory',
      key: name,
      name
    },
    source,
    isTemplate: false
  })

  if (recordResult.isErr()) {
    throw new Error(recordResult.error.message)
  }

  return recordResult.value
}

function readReplacementZ(edit: { replacement: string }) {
  const match = /z:\s*(-?\d+)/.exec(edit.replacement)

  if (!match) {
    throw new Error(`Missing z value in replacement: ${edit.replacement}`)
  }

  return Number(match[1])
}
