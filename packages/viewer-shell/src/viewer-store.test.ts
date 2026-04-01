import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasDocumentPicker,
  CanvasDocumentRepositoryGateway
} from '@boardmark/canvas-repository'
import type { CanvasAST } from '@boardmark/canvas-domain'
import { createViewerStore } from './viewer-store'

const templateSource = `---
type: canvas
version: 1
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note #welcome x=80 y=72
Boardmark Viewer
:::

::: note #overview x=380 y=72
Overview
:::

::: edge #welcome-overview from=welcome to=overview kind=curve
main thread
:::`

const openedSource = `---
type: canvas
version: 1
viewport:
  x: 40
  y: 18
  zoom: 1.2
---

::: note #open x=24 y=24
Opened Board
:::

::: note #next x=360 y=24
Next
:::

::: edge #open-next from=open to=next kind=curve
broken flow
:::`

function createPicker(): CanvasDocumentPicker {
  return {
    pickOpenLocator: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'file' as const,
        path: '/tmp/open.canvas.md'
      }
    })),
    pickSaveLocator: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'file' as const,
        path: '/tmp/saved.canvas.md'
      }
    }))
  }
}

function createRepository(): CanvasDocumentRepositoryGateway {
  return {
    readSource: vi.fn(async ({ locator, source, isTemplate }) => ({
      ok: true as const,
      value: {
        locator,
        name: locator.kind === 'file' ? 'saved.canvas.md' : locator.name,
        source,
        ast: readAst(source.includes('Opened Board') ? 'Opened Board' : 'Boardmark Viewer'),
        issues: source.includes('Opened Board')
          ? [
              {
                level: 'warning' as const,
                kind: 'invalid-edge' as const,
                message: 'Broken edge skipped.',
                line: 17
              }
            ]
          : [],
        isTemplate
      }
    })),
    read: vi.fn(async (locator) => ({
      ok: true as const,
      value: {
        locator,
        name: 'open.canvas.md',
        source: openedSource,
        ast: readAst('Opened Board', {
          x: 40,
          y: 18,
          zoom: 1.2
        }),
        issues: [
          {
            level: 'warning' as const,
            kind: 'invalid-edge' as const,
            message: 'Broken edge skipped.',
            line: 17
          }
        ],
        isTemplate: false
      }
    })),
    save: vi.fn(async ({ locator, source, isTemplate }) => ({
      ok: true as const,
      value: {
        locator,
        name: 'saved.canvas.md',
        source,
        ast: readAst(
          locator.kind === 'file' && locator.path === '/tmp/open.canvas.md'
            ? 'Opened Board'
            : 'Boardmark Viewer'
        ),
        issues: [],
        isTemplate
      }
    }))
  }
}

describe('viewer store', () => {
  it('hydrates from the startup template through the repository', async () => {
    const picker = createPicker()
    const repository = createRepository()
    const store = createViewerStore({
      documentPicker: picker,
      documentRepository: repository,
      templateSource
    })

    await store.getState().hydrateTemplate()

    expect(repository.readSource).toHaveBeenCalledWith({
      locator: {
        kind: 'memory',
        key: 'startup-template',
        name: 'bundled-template.canvas.md'
      },
      source: templateSource,
      isTemplate: true
    })
    expect(store.getState().document?.isTemplate).toBe(true)
    expect(store.getState().nodes).toHaveLength(2)
    expect(store.getState().loadState.status).toBe('ready')
  })

  it('restores the sample document state through resetToTemplate', async () => {
    const store = createViewerStore({
      documentPicker: createPicker(),
      documentRepository: createRepository(),
      templateSource
    })

    await store.getState().openDocument()
    expect(store.getState().parseIssues).toHaveLength(1)
    expect(store.getState().viewport).toEqual({
      x: 40,
      y: 18,
      zoom: 1.2
    })

    await store.getState().resetToTemplate()

    expect(store.getState().document?.name).toBe('bundled-template.canvas.md')
    expect(store.getState().parseIssues).toEqual([])
    expect(store.getState().viewport).toEqual({
      x: -180,
      y: -120,
      zoom: 0.92
    })
  })

  it('runs desktop create, open, and save flows through picker and repository', async () => {
    const picker = createPicker()
    const repository = createRepository()
    const store = createViewerStore({
      documentPicker: picker,
      documentRepository: repository,
      templateSource
    })

    await store.getState().createNewDocument()
    expect(picker.pickSaveLocator).toHaveBeenCalledWith('untitled.canvas.md')
    expect(repository.save).toHaveBeenCalledWith({
      locator: {
        kind: 'file',
        path: '/tmp/saved.canvas.md'
      },
      source: templateSource,
      isTemplate: false
    })

    await store.getState().openDocument()
    expect(picker.pickOpenLocator).toHaveBeenCalled()
    expect(repository.read).toHaveBeenCalledWith({
      kind: 'file',
      path: '/tmp/open.canvas.md'
    })

    await store.getState().saveCurrentDocument()
    expect(repository.save).toHaveBeenLastCalledWith({
      locator: {
        kind: 'file',
        path: '/tmp/open.canvas.md'
      },
      source: openedSource,
      isTemplate: false
    })
  })
})

function readAst(
  title: string,
  viewport = {
    x: -180,
    y: -120,
    zoom: 0.92
  }
): CanvasAST {
  return {
    frontmatter: {
      type: 'canvas',
      version: 1,
      viewport
    },
    nodes: [
      {
        id: title === 'Opened Board' ? 'open' : 'welcome',
        type: 'note',
        x: 80,
        y: 72,
        content: title,
        position: {
          start: { line: 1, offset: 0 },
          end: { line: 3, offset: 12 }
        }
      },
      {
        id: 'overview',
        type: 'note',
        x: 380,
        y: 72,
        content: 'Overview',
        position: {
          start: { line: 5, offset: 0 },
          end: { line: 7, offset: 12 }
        }
      }
    ],
    edges: [
      {
        id: 'welcome-overview',
        from: title === 'Opened Board' ? 'open' : 'welcome',
        to: 'overview',
        kind: 'curve',
        content: 'main thread',
        position: {
          start: { line: 9, offset: 0 },
          end: { line: 11, offset: 12 }
        }
      }
    ]
  }
}
