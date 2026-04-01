import { describe, expect, it } from 'vitest'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import { createCanvasDocumentEditService } from '@canvas-app/services/edit-service'

const source = `---
type: canvas
version: 1
---

::: note #welcome x=80 y=72 w=320 color=yellow
Boardmark Viewer
:::

::: note #overview x=380 y=72
Overview
:::

::: edge #welcome-overview from=welcome to=overview kind=curve
main thread
:::`

describe('canvas document edit service', () => {
  it('patches geometry attributes on opening lines', () => {
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
      width: 420
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

    expect(reconnected.value.source).toContain('::: note #welcome x=144 y=180 w=420 color=yellow')
    expect(reconnected.value.source).toContain(
      '::: edge #welcome-overview from=overview to=welcome kind=curve'
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
    expect(edgeResult.value.source).toContain('::: note #welcome x=80 y=72 w=320 color=yellow')
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
    expect(createdEdge._unsafeUnwrap().source).toContain('::: edge #edge-1 from=welcome to=overview')
    expect(deletedEdge.isOk()).toBe(true)
    expect(deletedEdge._unsafeUnwrap().source).not.toContain('::: edge #welcome-overview')

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

    expect(deletedNode.value.source).toContain('::: note #note-1 x=160 y=132 w=320')
    expect(deletedNode.value.source).not.toContain('::: note #welcome')
    expect(deletedNode.value.source).not.toContain('::: edge #edge-1 from=welcome to=overview')
  })
})
