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
