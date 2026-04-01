import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import defaultTemplateSource from '@fixtures/default-template.canvas.md?raw'
import { createCanvasStore } from '@boardmark/canvas-app'
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
    const user = userEvent.setup()
    const store = createWebStore(async () => defaultTemplateSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('menuitem', { name: 'New file' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open file' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument()
    expect(store.getState().edges[0]?.content).toBe('main thread')
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().isDirty).toBe(true)
  })

  it('opens a local .canvas.md file through the browser persistence bridge', async () => {
    const user = userEvent.setup()
    window.showOpenFilePicker = async () => [createFileHandle('uploaded.canvas.md', openedSource)]
    const store = createWebStore(async () => openedSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))

    await waitFor(() => expect(screen.getByText('Uploaded Board')).toBeInTheDocument())
    expect(store.getState().documentState?.isPersisted).toBe(true)
    expect(store.getState().document?.name).toBe('uploaded.canvas.md')
  })

  it('surfaces parse failures from broken uploads', async () => {
    const user = userEvent.setup()
    window.showOpenFilePicker = async () => [createFileHandle('broken.canvas.md', brokenSource)]
    const store = createWebStore(async () => brokenSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))

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
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Save' }))

    await waitFor(() => expect(store.getState().saveState.status).toBe('saved'))
    expect(store.getState().isDirty).toBe(false)
  })

  it('shows drop active UI and replaces the current draft on drop', async () => {
    const store = createWebStore(async () => defaultTemplateSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')

    const shell = document.querySelector('main')
    expect(shell).not.toBeNull()
    const droppedFile = new File(
      [
        `---
type: canvas
version: 1
---

::: note #drop x=24 y=24
Dropped Board
:::`
      ],
      'dropped.canvas.md',
      { type: 'text/markdown' }
    )

    const dropData = createDropData([droppedFile])

    await act(async () => {
      fireEvent.dragEnter(shell as HTMLElement, dropData)
    })

    await waitFor(() => expect(screen.getByTestId('drop-overlay')).toBeInTheDocument())

    await act(async () => {
      await store.getState().openDroppedDocument({
        name: droppedFile.name,
        source: `---
type: canvas
version: 1
---

::: note #drop x=24 y=24
Dropped Board
:::`
      })
    })

    await waitFor(() => expect(store.getState().document?.name).toBe('dropped.canvas.md'))
    expect(store.getState().document?.name).toBe('dropped.canvas.md')
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().isDirty).toBe(true)
  })
})

function createWebStore(readFileText: (file: File) => Promise<string>) {
  const bridge = createBrowserDocumentBridge({
    rootDocument: document,
    rootWindow: window,
    readFileText
  })

  return createCanvasStore({
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

function createDropData(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file
      })),
      types: ['Files']
    }
  }
}
