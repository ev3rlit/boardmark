import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fromPromise } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import {
  createCanvasMarkdownDocumentRepository
} from './index'

describe('canvas document repository', () => {
  it('returns a document aggregate for in-memory source input', () => {
    const repository = createCanvasMarkdownDocumentRepository()
    const result = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'startup-template',
        name: 'template.canvas.md'
      },
      source: `---
type: canvas
version: 2
---

::: note { id: idea, at: { x: 10, y: 20, w: 320, h: 220 } }
Idea
:::`,
      isTemplate: true
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.name).toBe('template.canvas.md')
    expect(result.value.ast.nodes).toHaveLength(1)
    expect(result.value.ast.nodes[0]?.sourceMap.headerLineRange.start.line).toBe(6)
    expect(result.value.ast.nodes[0]?.sourceMap.bodyRange.start.line).toBe(7)
    expect(result.value.issues).toEqual([])
    expect(result.value.isTemplate).toBe(true)
  })

  it('reports fatal parse failures at the repository boundary', () => {
    const repository = createCanvasMarkdownDocumentRepository()
    const result = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'broken',
        name: 'broken.canvas.md'
      },
      source: `---
type: note
version: 2
---`,
      isTemplate: false
    })

    expect(result.isErr()).toBe(true)

    if (result.isOk()) {
      return
    }

    expect(result.error.kind).toBe('parse-failed')
    expect(result.error.message).toContain('broken.canvas.md')
  })

  it('keeps partial parse issues while returning a valid aggregate', () => {
    const repository = createCanvasMarkdownDocumentRepository()
    const result = repository.readSource({
      locator: {
        kind: 'memory',
        key: 'partial',
        name: 'partial.canvas.md'
      },
      source: `---
type: canvas
version: 2
---

::: note { id: good, at: { x: 10, y: 20, w: 320, h: 220 } }
Good
:::

::: note { id: bad, at: { x: nope, y: 20, w: 320, h: 220 } }
Bad
:::

::: edge { id: missing, from: good, to: ghost }
Broken
:::`,
      isTemplate: false
    })

    expect(result.isOk()).toBe(true)

    if (result.isErr()) {
      return
    }

    expect(result.value.ast.nodes.map((node) => node.id)).toEqual(['good'])
    expect(result.value.ast.edges).toEqual([])
    expect(result.value.issues).toHaveLength(2)
  })

  it('saves and reads the same document through file-backed access', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'boardmark-repository-'))
    const path = join(directory, 'roundtrip.canvas.md')
    const repository = createCanvasMarkdownDocumentRepository({
      readFile(filePath) {
        return fromPromise(readFile(filePath, 'utf8'), (error) => ({
          kind: 'read-failed' as const,
          message: error instanceof Error ? error.message : `Could not read "${filePath}".`
        }))
      },
      writeFile(filePath, source) {
        return fromPromise(writeFile(filePath, source, 'utf8'), (error) => ({
          kind: 'write-failed' as const,
          message: error instanceof Error ? error.message : `Could not write "${filePath}".`
        }))
      }
    })

    try {
      const saveResult = await repository.save({
        locator: {
          kind: 'file',
          path
        },
        source: `---
type: canvas
version: 2
---

::: note { id: saved, at: { x: 30, y: 40, w: 320, h: 220 } }
Saved
:::`,
        isTemplate: false
      })

      expect(saveResult.isOk()).toBe(true)

      const readResult = await repository.read({
        kind: 'file',
        path
      })

      expect(readResult.isOk()).toBe(true)

      if (saveResult.isErr() || readResult.isErr()) {
        return
      }

      expect(readResult.value.source).toBe(saveResult.value.source)
      expect(readResult.value.ast.nodes.map((node) => node.id)).toEqual(['saved'])
      expect(readResult.value.name).toBe('roundtrip.canvas.md')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
