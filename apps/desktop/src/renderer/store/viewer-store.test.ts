import { describe, expect, it, vi } from 'vitest'
import defaultTemplateSource from '@fixtures/default-template.canvas.md?raw'
import type { DocumentGateway } from '@boardmark/canvas-domain'
import { createViewerStore } from './viewer-store'

function createGateway(): DocumentGateway {
  return {
    newFileFromTemplate: vi.fn(async () => ({
      ok: true as const,
      value: {
        path: '/tmp/new.canvas.md',
        source: defaultTemplateSource
      }
    })),
    openFile: vi.fn(async () => ({
      ok: true as const,
      value: {
        path: '/tmp/open.canvas.md',
        source: defaultTemplateSource.replace('Boardmark Viewer', 'Opened Board')
      }
    })),
    saveFile: vi.fn(async ({ path, content }) => ({
      ok: true as const,
      value: {
        path: path ?? '/tmp/saved.canvas.md',
        source: content
      }
    }))
  }
}

describe('viewer store', () => {
  it('hydrates from the startup template and keeps parse issues', () => {
    const store = createViewerStore(createGateway())

    store.getState().hydrateTemplate(defaultTemplateSource)

    expect(store.getState().document?.isTemplate).toBe(true)
    expect(store.getState().nodes).toHaveLength(6)
    expect(store.getState().edges).toHaveLength(5)
    expect(store.getState().loadState.status).toBe('ready')
  })

  it('changes tool mode and viewport state', () => {
    const store = createViewerStore(createGateway())

    store.getState().setToolMode('pan')
    store.getState().setViewport({ x: 40, y: -10, zoom: 1.24 })
    store.getState().setSelectedNodeId('welcome')

    expect(store.getState().toolMode).toBe('pan')
    expect(store.getState().viewport.x).toBe(40)
    expect(store.getState().viewport.y).toBe(-10)
    expect(store.getState().viewport.zoom).toBe(1.24)
    expect(store.getState().selectedNodeId).toBe('welcome')
  })

  it('saves a template-backed document through the gateway when no path exists', async () => {
    const gateway = createGateway()
    const store = createViewerStore(gateway)

    store.getState().hydrateTemplate(defaultTemplateSource)
    await store.getState().saveCurrentDocument()

    expect(gateway.saveFile).toHaveBeenCalledWith({
      path: null,
      content: defaultTemplateSource
    })
    expect(store.getState().document?.path).toBe('/tmp/saved.canvas.md')
    expect(store.getState().document?.isTemplate).toBe(false)
  })

  it('loads a file returned by open file', async () => {
    const gateway = createGateway()
    const store = createViewerStore(gateway)

    await store.getState().openDocumentFromDisk()

    expect(gateway.openFile).toHaveBeenCalled()
    expect(store.getState().document?.path).toBe('/tmp/open.canvas.md')
    expect(store.getState().nodes[0]?.content).toContain('Opened Board')
  })
})
