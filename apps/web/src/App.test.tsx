import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  })

  it('renders the bundled sample board on startup and hides save', async () => {
    const store = createWebStore(async () => defaultTemplateSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')

    expect(screen.getByRole('button', { name: 'Open File' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(store.getState().edges[0]?.content).toBe('main thread')
    expect(screen.getByText(/Reset to the bundled sample board/)).toBeInTheDocument()
  })

  it('opens a local .canvas.md file through the browser bridge', async () => {
    const user = userEvent.setup()
    const store = createWebStore(async () => openedSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open File' }))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['ignored'], 'uploaded.canvas.md', {
      type: 'text/markdown'
    })

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file]
    })

    fireEvent.change(input)

    await waitFor(() => expect(screen.getByText('Uploaded Board')).toBeInTheDocument())
  })

  it('surfaces parse failures from broken uploads', async () => {
    const user = userEvent.setup()
    const store = createWebStore(async () => brokenSource)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')
    await user.click(screen.getByRole('button', { name: 'Open File' }))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['ignored'], 'broken.canvas.md', {
      type: 'text/markdown'
    })

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file]
    })

    fireEvent.change(input)

    await waitFor(() =>
      expect(screen.getByText(/Canvas repository could not parse "broken.canvas.md"/)).toBeInTheDocument()
    )
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
    documentRepository: bridge.repository,
    templateSource: defaultTemplateSource
  })
}
