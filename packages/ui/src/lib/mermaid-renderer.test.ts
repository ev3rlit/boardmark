import { beforeEach, describe, expect, it, vi } from 'vitest'

const { initializeMock, renderMock } = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  renderMock: vi.fn()
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock
  }
}))

describe('mermaid-renderer', () => {
  beforeEach(() => {
    vi.resetModules()
    initializeMock.mockReset()
    renderMock.mockReset()
    renderMock.mockResolvedValue({
      svg: '<svg><text>diagram</text></svg>'
    })
  })

  it('initializes Mermaid with global htmlLabels disabled for SVG-safe rendering', async () => {
    const { renderMermaidDiagram } = await import('./mermaid-renderer')

    await renderMermaidDiagram('flowchart TD\nA[Start] --> B[Ship]', 'boardmark-mermaid-test')

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlLabels: false,
        flowchart: expect.objectContaining({
          useMaxWidth: false
        })
      })
    )
  })
})
