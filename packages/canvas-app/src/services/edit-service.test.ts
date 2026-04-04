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

  it('duplicates selected objects with regenerated ids and remapped edges', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'duplicate-test',
        name: 'duplicate.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const duplicateResult = editService.apply(source, recordResult.value, {
      kind: 'duplicate-objects',
      nodeIds: ['welcome', 'overview'],
      edgeIds: ['welcome-overview'],
      offsetX: 16,
      offsetY: 16
    })

    expect(duplicateResult.isOk()).toBe(true)

    if (duplicateResult.isErr()) {
      return
    }

    expect(duplicateResult.value.source).toContain(
      '::: note { id: note-1, at: { x: 96, y: 88, w: 320, h: 220 }, z: 1 }'
    )
    expect(duplicateResult.value.source).toContain(
      '::: note { id: note-2, at: { x: 396, y: 88, w: 320, h: 220 }, z: 2 }'
    )
    expect(duplicateResult.value.source).toContain(
      '::: edge { id: edge-1, from: note-1, to: note-2, z: 3 }'
    )

    const reparsedResult = repository.readSource({
      locator: recordResult.value.locator,
      source: duplicateResult.value.source,
      isTemplate: false
    })

    expect(reparsedResult.isOk()).toBe(true)
    expect(reparsedResult._unsafeUnwrap().ast.nodes).toHaveLength(4)
    expect(reparsedResult._unsafeUnwrap().ast.edges).toHaveLength(2)
  })

  it('nudges multiple node headers without rewriting unrelated objects', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'nudge-test',
        name: 'nudge.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const nudgeResult = editService.apply(source, recordResult.value, {
      kind: 'nudge-objects',
      nodeIds: ['welcome', 'overview'],
      dx: 10,
      dy: -2
    })

    expect(nudgeResult.isOk()).toBe(true)

    if (nudgeResult.isErr()) {
      return
    }

    expect(nudgeResult.value.source).toContain(
      '::: note { id: welcome, at: { x: 90, y: 70, w: 320, h: 220 } }'
    )
    expect(nudgeResult.value.source).toContain(
      '::: note { id: overview, at: { x: 390, y: 70, w: 320, h: 220 } }'
    )
    expect(nudgeResult.value.source).toContain(
      '::: edge { id: welcome-overview, from: welcome, to: overview }'
    )
  })

  it('accepts z, locked, and group membership fields during reparsing', () => {
    const repository = createCanvasMarkdownDocumentRepository()
    const sourceWithGroups = `---
type: canvas
version: 2
---

::: group { id: ideation-group, z: 40, locked: true }
~~~yaml members
nodes:
  - welcome
~~~
:::

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, z: 10, locked: true }
Boardmark Viewer
:::

::: edge { id: welcome-self, from: welcome, to: welcome, z: 12, locked: true }
locked edge
:::`

    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'group-parse-test',
        name: 'group.canvas.md'
      },
      source: sourceWithGroups,
      isTemplate: false
    })

    expect(recordResult.isOk()).toBe(true)

    if (recordResult.isErr()) {
      return
    }

    expect(recordResult.value.ast.groups).toEqual([
      expect.objectContaining({
        id: 'ideation-group',
        z: 40,
        locked: true,
        members: {
          nodeIds: ['welcome']
        }
      })
    ])
    expect(recordResult.value.ast.nodes[0]).toEqual(
      expect.objectContaining({
        id: 'welcome',
        z: 10,
        locked: true
      })
    )
    expect(recordResult.value.ast.edges[0]).toEqual(
      expect.objectContaining({
        id: 'welcome-self',
        z: 12,
        locked: true
      })
    )
  })

  it('creates and updates group directives with yaml membership blocks', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'upsert-group-test',
        name: 'upsert-group.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const createdGroup = editService.apply(source, recordResult.value, {
      kind: 'upsert-group',
      groupId: 'group-1',
      nodeIds: ['welcome', 'overview'],
      z: 40
    })

    expect(createdGroup.isOk()).toBe(true)
    expect(createdGroup._unsafeUnwrap().source).toContain(
      '::: group { id: group-1, z: 40 }'
    )
    expect(createdGroup._unsafeUnwrap().source).toContain(
      '~~~yaml members\nnodes:\n  - welcome\n  - overview\n~~~'
    )

    const createdRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: createdGroup._unsafeUnwrap().source,
      isTemplate: false
    })

    const updatedGroup = editService.apply(createdGroup._unsafeUnwrap().source, createdRecord._unsafeUnwrap(), {
      kind: 'upsert-group',
      groupId: 'group-1',
      nodeIds: ['overview'],
      z: 41
    })

    expect(updatedGroup.isOk()).toBe(true)
    expect(updatedGroup._unsafeUnwrap().source).toContain(
      '::: group { id: group-1, z: 41 }'
    )
    expect(updatedGroup._unsafeUnwrap().source).toContain(
      '~~~yaml members\nnodes:\n  - overview\n~~~'
    )
  })

  it('deletes group directives without deleting member nodes', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const groupedSource = `${source}

::: group { id: group-1, z: 10 }
~~~yaml members
nodes:
  - welcome
~~~
:::`
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'delete-groups-test',
        name: 'delete-groups.canvas.md'
      },
      source: groupedSource,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const deletedGroups = editService.apply(groupedSource, recordResult.value, {
      kind: 'delete-groups',
      groupIds: ['group-1']
    })

    expect(deletedGroups.isOk()).toBe(true)
    expect(deletedGroups._unsafeUnwrap().source).not.toContain('::: group { id: group-1')
    expect(deletedGroups._unsafeUnwrap().source).toContain('::: note { id: welcome')
  })

  it('pastes grouped payloads with regenerated ids and remapped endpoints', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'paste-group-test',
        name: 'paste-group.canvas.md'
      },
      source,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const pasteResult = editService.apply(source, recordResult.value, {
      kind: 'paste-objects',
      payload: {
        groups: [
          {
            id: 'ideation-group',
            z: 10,
            members: {
              nodeIds: ['welcome', 'overview']
            }
          }
        ],
        nodes: [
          {
            id: 'welcome',
            component: 'note',
            at: { x: 80, y: 72, w: 320, h: 220 },
            body: 'Boardmark Viewer\n',
            z: 1
          },
          {
            id: 'overview',
            component: 'note',
            at: { x: 380, y: 72, w: 320, h: 220 },
            body: 'Overview\n',
            z: 2
          }
        ],
        edges: [
          {
            id: 'welcome-overview',
            from: 'welcome',
            to: 'overview',
            body: 'main thread\n',
            z: 3
          }
        ],
        origin: { x: 80, y: 72 }
      },
      anchorX: 600,
      anchorY: 400,
      inPlace: false
    })

    expect(pasteResult.isOk()).toBe(true)
    expect(pasteResult._unsafeUnwrap().source).toContain(
      '::: group { id: group-1, z: 1 }'
    )
    expect(pasteResult._unsafeUnwrap().source).toContain(
      '~~~yaml members\nnodes:\n  - note-1\n  - note-2\n~~~'
    )
    expect(pasteResult._unsafeUnwrap().source).toContain(
      '::: note { id: note-1, at: { x: 600, y: 400, w: 320, h: 220 }, z: 2 }'
    )
    expect(pasteResult._unsafeUnwrap().source).toContain(
      '::: edge { id: edge-1, from: note-1, to: note-2, z: 4 }'
    )

    const reparsedResult = repository.readSource({
      locator: recordResult.value.locator,
      source: pasteResult._unsafeUnwrap().source,
      isTemplate: false
    })

    expect(reparsedResult.isOk()).toBe(true)
    expect(reparsedResult._unsafeUnwrap().ast.groups).toHaveLength(1)
  })

  it('arranges selected top-level objects with z-only header patches and reparses the result', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const layeredSource = `---
type: canvas
version: 2
---

::: group { id: ideation-group, z: 1 }
~~~yaml members
nodes:
  - nested
~~~
:::

::: note { id: nested, at: { x: 40, y: 40, w: 240, h: 180 }, z: 2 }
Nested
:::

::: note { id: welcome, at: { x: 320, y: 72, w: 320, h: 220 }, z: 3 }
Boardmark Viewer
:::

::: edge { id: welcome-nested, from: welcome, to: nested, z: 4 }
main thread
:::`
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'arrange-test',
        name: 'arrange.canvas.md'
      },
      source: layeredSource,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const bringToFront = editService.apply(layeredSource, recordResult.value, {
      kind: 'arrange-objects',
      groupIds: ['ideation-group'],
      nodeIds: [],
      edgeIds: ['welcome-nested'],
      mode: 'bring-to-front'
    })

    expect(bringToFront.isOk()).toBe(true)
    expect(bringToFront._unsafeUnwrap().source).toContain(
      '::: group { id: ideation-group, z: 5 }'
    )
    expect(bringToFront._unsafeUnwrap().source).toContain(
      '::: edge { id: welcome-nested, from: welcome, to: nested, z: 6 }'
    )

    const bringToFrontRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: bringToFront._unsafeUnwrap().source,
      isTemplate: false
    })

    expect(bringToFrontRecord.isOk()).toBe(true)

    const sendBackward = editService.apply(bringToFront._unsafeUnwrap().source, bringToFrontRecord._unsafeUnwrap(), {
      kind: 'arrange-objects',
      nodeIds: ['welcome'],
      edgeIds: [],
      mode: 'send-backward'
    })

    expect(sendBackward.isOk()).toBe(true)
    expect(sendBackward._unsafeUnwrap().source).toContain(
      '::: note { id: welcome, at: { x: 320, y: 72, w: 320, h: 220 }, z: 1 }'
    )

    const reparsedResult = repository.readSource({
      locator: recordResult.value.locator,
      source: sendBackward._unsafeUnwrap().source,
      isTemplate: false
    })

    expect(reparsedResult.isOk()).toBe(true)
    expect(reparsedResult._unsafeUnwrap().ast.groups[0]).toEqual(
      expect.objectContaining({
        id: 'ideation-group',
        z: 3
      })
    )
    expect(reparsedResult._unsafeUnwrap().ast.nodes.find((node) => node.id === 'welcome')).toEqual(
      expect.objectContaining({
        z: 1
      })
    )
  })

  it('sets and clears locked metadata on groups, nodes, and edges without writing locked false', () => {
    const editService = createCanvasDocumentEditService()
    const repository = createCanvasMarkdownDocumentRepository()
    const groupSource = `---
type: canvas
version: 2
---

::: group { id: ideation-group, z: 10 }
~~~yaml members
nodes:
  - welcome
~~~
:::

::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, z: 11 }
Boardmark Viewer
:::

::: edge { id: welcome-self, from: welcome, to: welcome, z: 12 }
main thread
:::`
    const recordResult = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'lock-test',
        name: 'lock.canvas.md'
      },
      source: groupSource,
      isTemplate: false
    })

    if (recordResult.isErr()) {
      throw new Error(recordResult.error.message)
    }

    const locked = editService.apply(groupSource, recordResult.value, {
      kind: 'set-objects-locked',
      groupIds: ['ideation-group'],
      nodeIds: ['welcome'],
      edgeIds: ['welcome-self'],
      locked: true
    })

    expect(locked.isOk()).toBe(true)
    expect(locked._unsafeUnwrap().source).toContain(
      '::: group { id: ideation-group, z: 10, locked: true }'
    )
    expect(locked._unsafeUnwrap().source).toContain(
      '::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, z: 11, locked: true }'
    )
    expect(locked._unsafeUnwrap().source).toContain(
      '::: edge { id: welcome-self, from: welcome, to: welcome, z: 12, locked: true }'
    )

    const lockedRecord = repository.readSource({
      locator: recordResult.value.locator,
      source: locked._unsafeUnwrap().source,
      isTemplate: false
    })

    const unlocked = editService.apply(locked._unsafeUnwrap().source, lockedRecord._unsafeUnwrap(), {
      kind: 'set-objects-locked',
      groupIds: ['ideation-group'],
      nodeIds: ['welcome'],
      edgeIds: ['welcome-self'],
      locked: false
    })

    expect(unlocked.isOk()).toBe(true)
    expect(unlocked._unsafeUnwrap().source).toContain(
      '::: group { id: ideation-group, z: 10 }'
    )
    expect(unlocked._unsafeUnwrap().source).toContain(
      '::: note { id: welcome, at: { x: 80, y: 72, w: 320, h: 220 }, z: 11 }'
    )
    expect(unlocked._unsafeUnwrap().source).toContain(
      '::: edge { id: welcome-self, from: welcome, to: welcome, z: 12 }'
    )
    expect(unlocked._unsafeUnwrap().source).not.toContain('locked: false')
  })
})
