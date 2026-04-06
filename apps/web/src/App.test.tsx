import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  EMPTY_CANVAS_DOCUMENT_NAME,
  EMPTY_CANVAS_SOURCE,
  createCanvasStore
} from '@boardmark/canvas-app'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { createBrowserDocumentBridge } from './document-bridge'

const openedSource = `---
type: canvas
version: 2
---

::: note { id: upload, at: { x: 20, y: 20, w: 320, h: 220 } }
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

  it('renders an empty startup canvas and shows save state', async () => {
    const user = userEvent.setup()
    const store = createWebStore(async () => EMPTY_CANVAS_SOURCE)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('menuitem', { name: 'New file' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open file' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument()
    expect(store.getState().nodes).toHaveLength(0)
    expect(store.getState().edges).toHaveLength(0)
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().isDirty).toBe(true)
  })

  it('opens a local .canvas.md file through the browser persistence bridge', async () => {
    const user = userEvent.setup()
    window.showOpenFilePicker = async () => [createFileHandle('uploaded.canvas.md', openedSource)]
    const store = createWebStore(async () => openedSource)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))
    await user.click(screen.getByRole('button', { name: "Don't save" }))

    await waitFor(() => expect(store.getState().document?.name).toBe('uploaded.canvas.md'))
    expect(store.getState().documentState?.isPersisted).toBe(true)
    expect(store.getState().document?.name).toBe('uploaded.canvas.md')
  })

  it('shows a custom unsaved-changes dialog before opening another file', async () => {
    const user = userEvent.setup()
    const showOpenFilePicker = vi.fn(async () => [createFileHandle('uploaded.canvas.md', openedSource)])
    window.showOpenFilePicker = showOpenFilePicker
    const store = createWebStore(async () => EMPTY_CANVAS_SOURCE)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Open another file?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Don't save" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeInTheDocument()
    expect(showOpenFilePicker).not.toHaveBeenCalled()
  })

  it('discards the current draft when opening another file without saving', async () => {
    const user = userEvent.setup()
    const showOpenFilePicker = vi.fn(async () => [createFileHandle('uploaded.canvas.md', openedSource)])
    window.showOpenFilePicker = showOpenFilePicker
    const store = createWebStore(async () => EMPTY_CANVAS_SOURCE)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))
    await user.click(screen.getByRole('button', { name: "Don't save" }))

    await waitFor(() => expect(store.getState().document?.name).toBe('uploaded.canvas.md'))
    expect(showOpenFilePicker).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(store.getState().document?.name).toBe('uploaded.canvas.md')
  })

  it('keeps the current draft when unsaved-changes dialog is cancelled', async () => {
    const user = userEvent.setup()
    const showOpenFilePicker = vi.fn(async () => [createFileHandle('uploaded.canvas.md', openedSource)])
    window.showOpenFilePicker = showOpenFilePicker
    const store = createWebStore(async () => EMPTY_CANVAS_SOURCE)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(showOpenFilePicker).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME)
    expect(store.getState().isDirty).toBe(true)
  })

  it('surfaces parse failures from broken uploads', async () => {
    const user = userEvent.setup()
    window.showOpenFilePicker = async () => [createFileHandle('broken.canvas.md', brokenSource)]
    const store = createWebStore(async () => brokenSource)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open file' }))
    await user.click(screen.getByRole('button', { name: "Don't save" }))

    await waitFor(() =>
      expect(screen.getByText(/Canvas repository could not parse/)).toBeInTheDocument()
    )
  })

  it('saves the startup draft through showSaveFilePicker', async () => {
    const user = userEvent.setup()
    window.showSaveFilePicker = async () => createFileHandle('saved.canvas.md', '')
    const store = createWebStore(async () => EMPTY_CANVAS_SOURCE)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Save' }))

    await waitFor(() => expect(store.getState().saveState.status).toBe('saved'))
    expect(store.getState().isDirty).toBe(false)
  })

  it('shows drop active UI and replaces the current draft on drop', async () => {
    const store = createWebStore(async () => EMPTY_CANVAS_SOURCE)

    render(<App store={store} />)

    await waitFor(() => expect(store.getState().document?.name).toBe(EMPTY_CANVAS_DOCUMENT_NAME))

    const shell = document.querySelector('main')
    expect(shell).not.toBeNull()
    const droppedFile = new File(
      [
        `---
type: canvas
version: 2
---

::: note { id: drop, at: { x: 24, y: 24, w: 320, h: 220 } }
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
version: 2
---

::: note { id: drop, at: { x: 24, y: 24, w: 320, h: 220 } }
Dropped Board
:::`
      })
    })

    await waitFor(() => expect(store.getState().document?.name).toBe('dropped.canvas.md'))
    expect(store.getState().document?.name).toBe('dropped.canvas.md')
    expect(store.getState().documentState?.isPersisted).toBe(false)
    expect(store.getState().isDirty).toBe(true)
  })

  it('renders the isolated WYSIWYG spike when the query param is present', () => {
    const previousUrl = window.location.href
    window.history.pushState({}, '', '/?spike=wysiwyg-phase0')

    try {
      render(<App store={createWebStore(async () => EMPTY_CANVAS_SOURCE)} />)

      expect(screen.getByRole('heading', { level: 1, name: /Tiptap markdown spike for Boardmark/i })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Sample document' })).toBeInTheDocument()
    } finally {
      window.history.pushState({}, '', previousUrl)
    }
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
    templateSource: EMPTY_CANVAS_SOURCE
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
