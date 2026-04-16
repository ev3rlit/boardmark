import { describe, expect, it } from 'vitest'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import { createCanvasDocumentEditService } from '@canvas-app/services/edit-service'
import {
  readCanvasDocumentEditLabel,
  type CanvasDocumentEditIntent
} from '@canvas-app/services/edit-intents'
import { intentCompilers } from '@canvas-app/services/edit-intent-compilers'

const source = `---
type: canvas
version: 2
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }
Boardmark Viewer
:::

::: note { id: overview, at: { x: 380, y: 72, w: 320, h: 220 } }
Overview
:::

::: edge { id: welcome-overview, from: welcome, to: overview }
main thread
:::`

describe('canvas edit compiler registry', () => {
  it('registers every edit intent kind exactly once', () => {
    const expectedKinds: CanvasDocumentEditIntent['kind'][] = [
      'arrange-objects',
      'create-edge',
      'create-image',
      'create-note',
      'create-shape',
      'delete-edge',
      'delete-groups',
      'delete-node',
      'delete-objects',
      'duplicate-objects',
      'move-node',
      'move-nodes',
      'nudge-objects',
      'paste-objects',
      'replace-edge-body',
      'replace-image-source',
      'replace-object-body',
      'reset-node-height',
      'resize-node',
      'set-node-style-color',
      'set-objects-locked',
      'update-edge-endpoints',
      'update-image-metadata',
      'upsert-group'
    ]

    expect(Object.keys(intentCompilers).sort()).toEqual(expectedKinds.sort())
  })

  it('uses the shared label helper when creating transactions', () => {
    const record = readRecord(source)
    const intent: CanvasDocumentEditIntent = {
      kind: 'nudge-objects',
      nodeIds: ['welcome'],
      dx: 10,
      dy: 0
    }
    const service = createCanvasDocumentEditService()
    const result = service.compileTransaction(source, record, intent)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.label).toBe(readCanvasDocumentEditLabel(intent))
  })

  it('compiles move-nodes into a single transaction with one edit per moved node', () => {
    const record = readRecord(source)
    const intent: CanvasDocumentEditIntent = {
      kind: 'move-nodes',
      moves: [
        {
          nodeId: 'welcome',
          x: 140,
          y: 160
        },
        {
          nodeId: 'overview',
          x: 420,
          y: 180
        }
      ]
    }
    const service = createCanvasDocumentEditService()
    const result = service.compileTransaction(source, record, intent)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.label).toBe('Move node')
    expect(result.value.edits).toHaveLength(2)
  })

  it('keeps auto-height notes auto-sized when width-only resize preserves auto height', () => {
    const autoHeightSource = `---
type: canvas
version: 2
---

::: note { id: welcome, at: { x: 80, y: 72, w: 320 } }
Boardmark Viewer
:::`
    const record = readRecord(autoHeightSource)
    const intent: CanvasDocumentEditIntent = {
      kind: 'resize-node',
      nodeId: 'welcome',
      x: 96,
      y: 88,
      width: 420,
      height: 220,
      preserveAutoHeight: true
    }
    const service = createCanvasDocumentEditService()
    const result = service.compileTransaction(autoHeightSource, record, intent)

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.edits).toHaveLength(1)
    expect(result.value.edits[0]?.replacement).toContain('"w":420')
    expect(result.value.edits[0]?.replacement).not.toContain('"h":')
  })
})

function readRecord(inputSource: string) {
  const repository = createCanvasMarkdownDocumentRepository()
  const result = repository.readSource({
    locator: {
      kind: 'memory',
      key: 'registry-test',
      name: 'registry.canvas.md'
    },
    source: inputSource,
    isTemplate: false
  })

  if (result.isErr()) {
    throw new Error(result.error.message)
  }

  return result.value
}
