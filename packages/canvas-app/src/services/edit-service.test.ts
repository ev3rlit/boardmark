import { describe, expect, it } from 'vitest'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import { createCanvasDocumentEditService } from '@canvas-app/services/edit-service'

const source = `---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
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

describe('canvas document edit service', () => {
  it('patches geometry metadata on inline headers', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'edit-test',
        name: 'edit.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const moved = editService.apply(source, recordResult.value, {
      kind: 'move-node',
      nodeId: 'welcome',
      x: 144,
      y: 180
    })
    const movedRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: moved._unsafeUnwrap().source,
      isTemplate: false
    })
    const resized = editService.apply(moved._unsafeUnwrap().source, movedRecord._unsafeUnwrap(), {
      kind: 'resize-node',
      nodeId: 'welcome',
      x: 144,
      y: 180,
      width: 420,
      height: 280
    })
    const resizedRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: resized._unsafeUnwrap().source,
      isTemplate: false
    })
    const reconnected = editService.apply(resized._unsafeUnwrap().source, resizedRecord._unsafeUnwrap(), {
      kind: 'update-edge-endpoints',
      edgeId: 'welcome-overview',
      from: 'overview',
      to: 'welcome'
    })

    expect(reconnected.isOk()).toBe(true)

    if (reconnected.isErr()) {
      return
    }

    expect(reconnected.value.source).toContain(
      '::: note { id: welcome, at: { x: 144, y: 180, w: 420, h: 280 } }'
    )
    expect(reconnected.value.source).toContain(
      '::: edge { id: welcome-overview, from: overview, to: welcome }'
    )
    expect(reconnected.value.source).toContain('Boardmark Viewer\n:::')
  })

  it('replaces body ranges without rewriting the whole object', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'body-test',
        name: 'body.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const noteResult = editService.apply(source, recordResult.value, {
      kind: 'replace-object-body',
      objectId: 'welcome',
      markdown: 'Updated note'
    })
    const noteRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: noteResult._unsafeUnwrap().source,
      isTemplate: false
    })
    const edgeResult = editService.apply(noteResult._unsafeUnwrap().source, noteRecord._unsafeUnwrap(), {
      kind: 'replace-edge-body',
      edgeId: 'welcome-overview',
      markdown: 'Updated edge'
    })

    expect(edgeResult.isOk()).toBe(true)

    if (edgeResult.isErr()) {
      return
    }

    expect(edgeResult.value.source).toContain('Updated note\n:::')
    expect(edgeResult.value.source).toContain('Updated edge\n:::')
    expect(edgeResult.value.source).toContain(
      '::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 } }'
    )
  })

  it('creates and deletes objects with object-local patches', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'structure-test',
        name: 'structure.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const createdNote = editService.apply(source, recordResult.value, {
      kind: 'create-note',
      anchorNodeId: 'welcome',
      x: 160,
      y: 132,
      width: 320,
      height: 220,
      markdown: 'New note'
    })
    const createdNoteRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: createdNote._unsafeUnwrap().source,
      isTemplate: false
    })
    const createdEdge = editService.apply(
      createdNote._unsafeUnwrap().source,
      createdNoteRecord._unsafeUnwrap(),
      {
        kind: 'create-edge',
        from: 'welcome',
        to: 'overview',
        markdown: ''
      }
    )
    const createdEdgeRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: createdEdge._unsafeUnwrap().source,
      isTemplate: false
    })
    const deletedEdge = editService.apply(createdEdge._unsafeUnwrap().source, createdEdgeRecord._unsafeUnwrap(), {
      kind: 'delete-edge',
      edgeId: 'welcome-overview'
    })
    const deletedEdgeRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: deletedEdge._unsafeUnwrap().source,
      isTemplate: false
    })

    expect(createdEdge.isOk()).toBe(true)
    expect(createdEdge._unsafeUnwrap().source).toContain(
      '::: edge { id: edge-1, from: welcome, to: overview }'
    )
    expect(deletedEdge.isOk()).toBe(true)
    expect(deletedEdge._unsafeUnwrap().source).not.toContain('::: edge { id: welcome-overview')

    const deletedNode = editService.apply(
      deletedEdge._unsafeUnwrap().source,
      deletedEdgeRecord._unsafeUnwrap(),
      {
        kind: 'delete-node',
        nodeId: 'welcome'
      }
    )

    expect(deletedNode.isOk()).toBe(true)

    if (deletedNode.isErr()) {
      return
    }

    expect(deletedNode.value.source).toContain(
      '::: note { id: note-1, at: { x: 160, y: 132, w: 320, h: 220 } }'
    )
    expect(deletedNode.value.source).not.toContain('::: note { id: welcome')
    expect(deletedNode.value.source).not.toContain('::: edge { id: edge-1, from: welcome, to: overview }')
  })

  it('creates component blocks with component keys and body payload', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'shape-test',
        name: 'shape.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const createdShape = editService.apply(source, recordResult.value, {
      kind: 'create-shape',
      anchorNodeId: 'welcome',
      body: 'Frame\n\n```yaml props\npalette: neutral\ntone: soft\n```',
      component: 'boardmark.shape.roundRect',
      x: 180,
      y: 164,
      width: 420,
      height: 280
    })

    expect(createdShape.isOk()).toBe(true)

    if (createdShape.isErr()) {
      return
    }

    expect(createdShape.value.source).toContain(
      '::: boardmark.shape.roundRect { id: shape-1, at: { x: 180, y: 164, w: 420, h: 280 } }'
    )
    expect(createdShape.value.source).toContain('Frame\n\n```yaml props\npalette: neutral\ntone: soft\n```\n:::')
  })

  it('creates header-only image blocks and updates image metadata', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'image-test',
        name: 'image.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const createdImage = editService.apply(source, recordResult.value, {
      kind: 'create-image',
      anchorNodeId: 'welcome',
      id: 'image-1',
      src: './welcome.assets/mockup.png',
      alt: 'Mockup',
      title: 'Welcome',
      lockAspectRatio: true,
      x: 220,
      y: 180,
      width: 480,
      height: 320
    })

    expect(createdImage.isOk()).toBe(true)

    if (createdImage.isErr()) {
      return
    }

    expect(createdImage.value.source).toContain(
      '::: image { id: image-1, src: "./welcome.assets/mockup.png", alt: Mockup, title: Welcome, lockAspectRatio: true, at: { x: 220, y: 180, w: 480, h: 320 } }'
    )

    const imageRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: createdImage.value.source,
      isTemplate: false
    })

    if (imageRecord.isErr()) {
      throw new Error(imageRecord.error.message)
    }

    const updatedImage = editService.apply(createdImage.value.source, imageRecord.value, {
      kind: 'update-image-metadata',
      nodeId: 'image-1',
      alt: 'Updated mockup',
      lockAspectRatio: false
    })

    expect(updatedImage.isOk()).toBe(true)
    expect(updatedImage._unsafeUnwrap().source).toContain(
      '::: image { id: image-1, src: "./welcome.assets/mockup.png", alt: "Updated mockup", title: Welcome, lockAspectRatio: false, at: { x: 220, y: 180, w: 480, h: 320 } }'
    )
  })
})
