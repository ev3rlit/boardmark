import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMermaidDiagram } from '../lib/mermaid-renderer'
import { MermaidDiagram } from './mermaid-diagram'

vi.mock('../lib/mermaid-renderer', () => ({
  renderMermaidDiagram: vi.fn()
}))

const renderMermaidDiagramMock = vi.mocked(renderMermaidDiagram)

describe('MermaidDiagram', () => {
  beforeEach(() => {
    renderMermaidDiagramMock.mockReset()
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
})
