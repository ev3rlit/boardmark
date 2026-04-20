import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMermaidDiagram } from '../lib/mermaid-renderer'
import { MarkdownContentImageActionsProvider } from './fenced-block/image-actions-context'
import { MermaidDiagram } from './mermaid-diagram'

const { exportMermaidBlockImageMock } = vi.hoisted(() => ({
  exportMermaidBlockImageMock: vi.fn()
}))

vi.mock('../lib/mermaid-renderer', () => ({
  renderMermaidDiagram: vi.fn()
}))

vi.mock('./fenced-block/image-export', () => ({
  exportCodeBlockImage: vi.fn(),
  exportMermaidBlockImage: exportMermaidBlockImageMock
}))

const renderMermaidDiagramMock = vi.mocked(renderMermaidDiagram)

describe('MermaidDiagram', () => {
  beforeEach(() => {
    renderMermaidDiagramMock.mockReset()
    exportMermaidBlockImageMock.mockReset()
    renderMermaidDiagramMock.mockResolvedValue({
      svg: '<svg><text>diagram</text></svg>'
    })
    exportMermaidBlockImageMock.mockResolvedValue({
      blob: new Blob(['png'], { type: 'image/png' }),
      fileName: 'boardmark-mermaid-diagram.png',
      mimeType: 'image/png'
    })
  })

  it('renders svg output after loading completes', async () => {
    renderMermaidDiagramMock.mockResolvedValue({
      svg: '<svg><text>diagram</text></svg>'
    })

    const { container } = render(
      <MermaidDiagram source={`flowchart TD
A[Start] --> B[Ship]`} />
    )

    expect(screen.getByText('Rendering Mermaid diagram...')).toBeInTheDocument()

    const diagram = await screen.findByRole('img', { name: 'Mermaid diagram: flowchart TD' })

    expect(diagram).toBeInTheDocument()
    expect(container.querySelector('.mermaid-diagram svg')).not.toBeNull()

    await waitFor(() => {
      expect(renderMermaidDiagramMock).toHaveBeenCalledWith(
        'flowchart TD\nA[Start] --> B[Ship]',
        expect.stringContaining('boardmark-mermaid-')
      )
    })
  })

  it('renders an error card with the source when rendering fails', async () => {
    renderMermaidDiagramMock.mockRejectedValue(new Error('Parse error on line 2'))

    render(
      <MermaidDiagram source={`flowchart TD
A[Start] -->`} />
    )

    expect(await screen.findByText('Mermaid diagram could not be rendered.')).toBeInTheDocument()
    expect(screen.getByText('Parse error on line 2')).toBeInTheDocument()
    expect(screen.getByText(/A\[Start\] -->/)).toBeInTheDocument()
  })

  it('shows export image affordance only after the diagram is ready', async () => {
    const exportImageMock = vi.fn().mockResolvedValue({ status: 'saved' as const })

    render(
      <MarkdownContentImageActionsProvider
        actions={{
          canCopyImageToClipboard: () => true,
          copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
          exportImage: exportImageMock
        }}
      >
        <MermaidDiagram source={`flowchart TD
A[Start] --> B[Ship]`} />
      </MarkdownContentImageActionsProvider>
    )

    expect(screen.queryByRole('button', { name: 'Export image' })).toBeNull()

    const diagram = await screen.findByRole('img', { name: 'Mermaid diagram: flowchart TD' })
    const diagramSurface = diagram.closest('.mermaid-diagram')

    expect(diagramSurface).not.toBeNull()

    fireEvent.mouseEnter(diagramSurface as HTMLElement)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export image' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Export image' }))
    expect(screen.getByRole('menuitem', { name: 'Export PNG' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export JPG' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy image to clipboard' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export PNG' }))

    await waitFor(() => {
      expect(exportMermaidBlockImageMock).toHaveBeenCalledTimes(1)
      expect(exportImageMock).toHaveBeenCalledWith(
        {
          blob: expect.any(Blob),
          fileName: 'boardmark-mermaid-diagram.png',
          mimeType: 'image/png'
        },
        'png'
      )
    })
  })

  it('hides export affordance for loading and error Mermaid states', async () => {
    let resolveRender: ((value: { svg: string }) => void) | undefined

    renderMermaidDiagramMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRender = resolve
        })
    )

    const { rerender } = render(
      <MarkdownContentImageActionsProvider
        actions={{
          canCopyImageToClipboard: () => true,
          copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
          exportImage: vi.fn().mockResolvedValue({ status: 'saved' as const })
        }}
      >
        <MermaidDiagram source={`flowchart TD
A[Start] --> B[Ship]`} />
      </MarkdownContentImageActionsProvider>
    )

    expect(screen.queryByRole('button', { name: 'Export image' })).toBeNull()

    if (!resolveRender) {
      throw new Error('Expected loading Mermaid render to expose a resolver.')
    }

    resolveRender({
      svg: '<svg width="320" height="200"><text>diagram</text></svg>'
    })

    const readyDiagram = await screen.findByRole('img', { name: 'Mermaid diagram: flowchart TD' })
    fireEvent.mouseEnter(readyDiagram.closest('.mermaid-diagram') as HTMLElement)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export image' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Export image' }))
    expect(screen.getByRole('menuitem', { name: 'Export PNG' })).toBeInTheDocument()

    renderMermaidDiagramMock.mockRejectedValueOnce(new Error('Parse error on line 2'))

    rerender(
      <MarkdownContentImageActionsProvider
        actions={{
          canCopyImageToClipboard: () => true,
          copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
          exportImage: vi.fn().mockResolvedValue({ status: 'saved' as const })
        }}
      >
        <MermaidDiagram source={`flowchart TD
A[Start] -->`} />
      </MarkdownContentImageActionsProvider>
    )

    expect(await screen.findByText('Mermaid diagram could not be rendered.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export image' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Export PNG' })).toBeNull()
  })
})
