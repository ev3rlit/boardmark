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
      'nudge-objects',
      'paste-objects',
      'replace-edge-body',
      'replace-image-source',
      'replace-object-body',
      'resize-node',
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
