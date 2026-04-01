import { errAsync, ok, type Result, type ResultAsync } from 'neverthrow'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentLocator,
  CanvasDocumentRepository,
  CanvasDocumentRepositoryError
} from '@boardmark/canvas-repository'
import { createBrowserDocumentBridge } from './document-bridge'

const uploadedSource = `---
type: canvas
version: 1
---

::: note #upload x=20 y=20
Uploaded Board
:::`

describe('browser document bridge', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('stores browser-selected files behind memory locators and replays them through readSource', async () => {
    const readSource = vi.fn((input) =>
      ok({
        locator: input.locator,
        name: input.locator.name,
        source: input.source,
        ast: {
          frontmatter: {
            type: 'canvas' as const,
            version: 1
          },
          nodes: [],
          edges: []
        },
        issues: [],
        isTemplate: input.isTemplate
      })
    )
    const bridge = createBrowserDocumentBridge({
      rootDocument: document,
      rootWindow: window,
      readFileText: async () => uploadedSource,
      documentRepository: createDocumentRepository(readSource)
    })

    const locatorPromise = bridge.picker.pickOpenLocator()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['ignored'], 'opened.canvas.md', {
      type: 'text/markdown'
    })

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file]
    })

    fireEvent.change(input)

    const locatorResult = await locatorPromise
    expect(locatorResult.ok).toBe(true)

    if (!locatorResult.ok) {
      return
    }

    expect(locatorResult.value).toEqual({
      kind: 'memory',
      key: 'browser-open-0',
      name: 'opened.canvas.md'
    })

    const readResult = await bridge.repository.read(locatorResult.value)
    expect(readResult.ok).toBe(true)
    expect(readSource).toHaveBeenCalledWith({
      locator: locatorResult.value,
      source: uploadedSource,
      isTemplate: false
    })
  })

  it('returns explicit unsupported save failures', async () => {
    const bridge = createBrowserDocumentBridge({
      rootDocument: document,
      rootWindow: window,
      documentRepository: createDocumentRepository(vi.fn(() => ok(readRecord())))
    })

    await expect(bridge.picker.pickSaveLocator()).resolves.toEqual({
      ok: false,
      error: {
        code: 'save-failed',
        message: 'Save is not supported in the browser shell.'
      }
    })

    await expect(
      bridge.repository.save({
        locator: {
          kind: 'memory',
          key: 'browser-open-0',
          name: 'opened.canvas.md'
        },
        source: uploadedSource,
        isTemplate: false
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: 'unsupported-source',
        message:
          'Canvas repository does not support persistence for "opened.canvas.md" in the browser shell.'
      }
    })
  })
})

function createDocumentRepository(
  readSource: (
    input: {
      locator: CanvasDocumentLocator
      source: string
      isTemplate: boolean
    }
  ) => Result<ReturnType<typeof readRecord>, CanvasDocumentRepositoryError>
): CanvasDocumentRepository {
  return {
    read: () =>
      errAsync({
        kind: 'unsupported-source',
        message: 'Not used in browser bridge tests.'
      }),
    readSource,
    save: () =>
      errAsync({
        kind: 'unsupported-source',
        message: 'Not used in browser bridge tests.'
      })
  }
}

function readRecord() {
  return {
    locator: {
      kind: 'memory' as const,
      key: 'browser-open-0',
      name: 'opened.canvas.md'
    },
    name: 'opened.canvas.md',
    source: uploadedSource,
    ast: {
      frontmatter: {
        type: 'canvas' as const,
        version: 1
      },
      nodes: [],
      edges: []
    },
    issues: [],
    isTemplate: false
  }
}
