import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import defaultTemplateSource from '@fixtures/default-template.canvas.md?raw'
import { createViewerStore } from '@boardmark/viewer-shell'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { createBrowserDocumentBridge } from './document-bridge'

const openedSource = `---
type: canvas
version: 1
---

::: note #upload x=20 y=20
Uploaded Board
:::`

const brokenSource = `---
type: note
version: 1
---`

describe('Web App', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    delete window.showOpenFilePicker
    delete window.showSaveFilePicker
  })

  it('renders the bundled sample board on startup and shows save state', async () => {
    const store = createWebStore(async () => defaultTemplateSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')

    expect(screen.getByRole('button', { name: 'Open File' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(store.getState().edges[0]?.content).toBe('main thread')
    expect(screen.getByText(/Reset to the bundled sample board/)).toBeInTheDocument()
    expect(screen.getByText(/Unsaved draft/)).toBeInTheDocument()
  })

  it('opens a local .canvas.md file through the browser persistence bridge', async () => {
    const user = userEvent.setup()
    window.showOpenFilePicker = async () => [createFileHandle('uploaded.canvas.md', openedSource)]
    const store = createWebStore(async () => openedSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open File' }))

    await waitFor(() => expect(screen.getByText('Uploaded Board')).toBeInTheDocument())
    expect(screen.getByText(/Persisted document/)).toBeInTheDocument()
  })

  it('surfaces parse failures from broken uploads', async () => {
    const user = userEvent.setup()
    window.showOpenFilePicker = async () => [createFileHandle('broken.canvas.md', brokenSource)]
    const store = createWebStore(async () => brokenSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open File' }))

    await waitFor(() =>
      expect(screen.getByText(/Canvas repository could not parse/)).toBeInTheDocument()
    )
  })

  it('saves the startup draft through showSaveFilePicker', async () => {
    const user = userEvent.setup()
    window.showSaveFilePicker = async () => createFileHandle('saved.canvas.md', '')
    const store = createWebStore(async () => defaultTemplateSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText(/all changes saved/)).toBeInTheDocument())
  })
})

function createWebStore(readFileText: (file: File) => Promise<string>) {
  const bridge = createBrowserDocumentBridge({
    rootDocument: document,
    rootWindow: window,
    readFileText
  })

  return createViewerStore({
    documentPicker: bridge.picker,
    documentPersistenceBridge: bridge.persistence,
    documentRepository: bridge.repository,
    templateSource: defaultTemplateSource
  })
}

function createFileHandle(name: string, source: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    async createWritable() {
      return {
        async close() {},
        async write() {}
      } as unknown as FileSystemWritableFileStream
    },
    async getFile() {
      return new File([source], name, {
        type: 'text/markdown'
      })
    }
  } as unknown as FileSystemFileHandle
}
