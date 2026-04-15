import { describe, expect, it } from 'vitest'
import { createCanvasMarkdownDocumentRepository } from '@boardmark/canvas-repository'
import {
  buildInsertEdit,
  buildPatchedDirectiveHeaderLine,
  createObjectDeleteEdit,
  replaceBodyRange
} from '@canvas-app/services/edit-compiler-helpers'

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

describe('canvas edit compiler helpers', () => {
  it('patches directive headers without rewriting the whole object', () => {
    const record = readRecord(source)
    const welcome = record.ast.nodes.find((node) => node.id === 'welcome')

    if (!welcome) {
      throw new Error('Missing welcome node.')
    }

    const result = buildPatchedDirectiveHeaderLine(
      source,
      welcome.sourceMap.headerLineRange,
      'note',
      (metadata) => ({
        ...metadata,
        z: 8
      })
    )

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value).toBe('::: note {"id":"welcome","at":{"x":80,"y":72,"w":320,"h":220},"z":8}')
  })

  it('creates body replacement edits with body anchors', () => {
    const record = readRecord(source)
    const welcome = record.ast.nodes.find((node) => node.id === 'welcome')

    const result = replaceBodyRange(
      {
        record,
        source
      },
      welcome,
      'node',
      'Alpha\nBeta'
    )

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.anchor).toEqual({
      kind: 'body',
      objectId: 'welcome',
      objectKind: 'node'
    })
    expect(result.value.lineDeltaBehavior).toBe('change')
    expect(result.value.replacement).toBe('Alpha\nBeta\n')
  })

  it('creates insert and delete edits with the existing anchor semantics', () => {
    const record = readRecord(source)
    const welcome = record.ast.nodes.find((node) => node.id === 'welcome')

    if (!welcome) {
      throw new Error('Missing welcome node.')
    }

    const insertResult = buildInsertEdit(
      {
        record,
        source
      },
      'welcome',
      '::: note { id: note-1, at: { x: 120, y: 120, w: 320, h: 220 } }\nNew\n:::'
    )

    expect(insertResult.isOk()).toBe(true)

    if (insertResult.isErr()) {
      return
    }

    expect(insertResult.value.anchor).toEqual({
      kind: 'after-object',
      objectId: 'welcome',
      objectKind: 'node'
    })
    expect(insertResult.value.structuralImpact).toBe('structure')

    const deleteEdit = createObjectDeleteEdit(
      source,
      'node',
      'welcome',
      welcome.sourceMap.objectRange
    )

    expect(deleteEdit.anchor).toEqual({
      kind: 'object',
      objectId: 'welcome',
      objectKind: 'node'
    })
    expect(deleteEdit.lineDeltaBehavior).toBe('change')
    expect(deleteEdit.structuralImpact).toBe('structure')
  })
})

function readRecord(inputSource: string) {
  const repository = createCanvasMarkdownDocumentRepository()
  const result = repository.readSource({
    locator: {
      kind: 'memory',
      key: 'helper-test',
      name: 'helper.canvas.md'
    },
    source: inputSource,
    isTemplate: false
  })

  if (result.isErr()) {
    throw new Error(result.error.message)
  }

  return result.value
}
