import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import defaultTemplateSource from '@fixtures/default-template.canvas.md?raw'
import type { DocumentGateway } from '@boardmark/canvas-domain'
import { App } from './App'
import { createViewerStore } from '../store/viewer-store'

function createGateway(overrides: Partial<DocumentGateway> = {}): DocumentGateway {
  return {
    newFileFromTemplate: async () => ({
      ok: true,
      value: {
        path: '/tmp/new.canvas.md',
        source: defaultTemplateSource.replace('Boardmark Viewer', 'New Canvas')
      }
    }),
    openFile: async () => ({
      ok: true,
      value: {
        path: '/tmp/open.canvas.md',
        source: defaultTemplateSource.replace('Boardmark Viewer', 'Open Canvas')
      }
    }),
    saveFile: async ({ path, content }) => ({
      ok: true,
      value: {
        path: path ?? '/tmp/saved.canvas.md',
        source: content
      }
    }),
    ...overrides
  }
}

describe('App', () => {
  it('shows the startup template and the required controls', async () => {
    const store = createViewerStore(createGateway())

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')

    expect(screen.getAllByRole('button', { name: 'Open File' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pan' })).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument()
    expect(screen.getByText(/bundled template/)).toBeInTheDocument()
    expect(screen.getByText(/Existing boards open from the file menu/)).toBeInTheDocument()
    expect(screen.getByRole('application')).toBeInTheDocument()
  })

  it('runs new file, open file, and save flows through the UI', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    const store = createViewerStore(gateway)

    render(<App store={store} />)

    await screen.findByText('Boardmark Viewer')

    await user.click(screen.getByRole('button', { name: 'New File' }))
    await waitFor(() => expect(screen.getByText('New Canvas')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Open File' }))
    await waitFor(() => expect(screen.getByText('Open Canvas')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(store.getState().document?.path).toBe('/tmp/open.canvas.md'))
  })
})
