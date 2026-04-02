import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { highlightCodeBlockMock } = vi.hoisted(() => ({
  highlightCodeBlockMock: vi.fn()
}))

vi.mock('./mermaid-diagram', () => ({
  MermaidDiagram: ({ source }: { source: string }) => (
    <div
      data-testid="mermaid-diagram"
      data-source={source}
    >
      {source}
    </div>
  )
}))

vi.mock('../code-highlight', () => ({
  highlightCodeBlock: highlightCodeBlockMock,
  resolveCodeLanguage: vi.fn(),
  resolveCodeTheme: vi.fn(() => 'vscode-dark-modern')
}))

import { MarkdownContent } from './markdown-content'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

describe('MarkdownContent', () => {
  beforeEach(() => {
    highlightCodeBlockMock.mockReset()
    highlightCodeBlockMock.mockResolvedValue({
      kind: 'highlighted',
      language: 'typescript',
      lines: [
        {
          tokens: [
            { content: 'const', color: '#c586c0' },
            { content: ' shipped = true', color: '#d4d4d4' }
          ]
        }
      ],
      theme: 'vscode-dark-modern'
    })
  })

  it('renders CommonMark and GFM syntax together', () => {
    const { container } = render(
      <MarkdownContent
        content={`# 제목 1

## 제목 2

### 제목 3

#### 제목 4

##### 제목 5

###### 제목 6

자동 링크 https://boardmark.dev 와 ~~취소선~~

- [x] 완료된 작업
- [ ] 남은 작업

| 문법 | 상태 |
| --- | --- |
| table | ok |

각주 문장[^1]

[^1]: 각주 본문`}
      />
    )

    expect(screen.getByRole('heading', { level: 1, name: '제목 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '제목 2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '제목 3' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: '제목 4' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 5, name: '제목 5' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 6, name: '제목 6' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://boardmark.dev' })).toHaveAttribute(
      'href',
      'https://boardmark.dev'
    )
    expect(container.querySelector('del')).not.toBeNull()
    expect(container.querySelector('.markdown-table-wrap table')).not.toBeNull()

    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
    expect(container.querySelector('[data-footnotes]')).not.toBeNull()
  })

  it('renders mermaid fenced blocks through the diagram component and preserves other code blocks', async () => {
    const { container } = render(
      <MarkdownContent
        content={`\`\`\`mermaid
flowchart TD
    A[Start] --> B[Ship]
\`\`\`

\`\`\`ts
const shipped = true
\`\`\`

인라인 \`code\``}
      />
    )

    const diagram = await screen.findByTestId('mermaid-diagram')
    expect(diagram).toHaveAttribute(
      'data-source',
      'flowchart TD\n    A[Start] --> B[Ship]'
    )
    expect(container.querySelector('pre [data-testid="mermaid-diagram"]')).toBeNull()
    expect(await screen.findByText('const')).toBeInTheDocument()
    expect(container.querySelector('pre code.language-ts.markdown-code-block__code')).not.toBeNull()
    expect(screen.getByText('code')).toContainHTML('<code>code</code>')
    expect(highlightCodeBlockMock).toHaveBeenCalledTimes(1)
    expect(highlightCodeBlockMock).toHaveBeenCalledWith({
      code: 'const shipped = true',
      language: 'ts'
    })
  })

  it('shows block-local loading state without delaying surrounding markdown', async () => {
    const deferredHighlight = createDeferred<{
      kind: 'highlighted'
      language: 'typescript'
      lines: Array<{ tokens: Array<{ content: string; color?: string }> }>
      theme: 'vscode-dark-modern'
    }>()

    highlightCodeBlockMock.mockReturnValue(deferredHighlight.promise)

    render(
      <MarkdownContent
        content={`# Ready

\`\`\`ts
const delayed = true
\`\`\``}
      />
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Ready' })).toBeInTheDocument()
    expect(screen.getByText('Loading code')).toBeInTheDocument()

    deferredHighlight.resolve({
      kind: 'highlighted',
      language: 'typescript',
      lines: [
        {
          tokens: [
            { content: 'const', color: '#c586c0' },
            { content: ' delayed = true', color: '#d4d4d4' }
          ]
        }
      ],
      theme: 'vscode-dark-modern'
    })

    expect(await screen.findByText('const')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading code')).toBeNull()
    })
  })

  it('renders plain fallback blocks from the shared adapter result', async () => {
    highlightCodeBlockMock.mockResolvedValue({
      kind: 'plain',
      lines: ['plain fallback'],
      theme: 'vscode-dark-modern'
    })

    const { container } = render(
      <MarkdownContent
        content={`\`\`\`
plain fallback
\`\`\``}
      />
    )

    expect(await screen.findByText('plain fallback')).toBeInTheDocument()
    expect(container.querySelector('.markdown-code-block__line')).not.toBeNull()
  })

  it('renders local markdown images through the async image resolver', async () => {
    render(
      <MarkdownContent
        content="![Mockup](./welcome.assets/mockup.png)"
        imageResolver={async () => ({
          status: 'resolved',
          src: 'file:///tmp/mockup.png'
        })}
      />
    )

    expect(await screen.findByRole('img', { name: 'Mockup' })).toHaveAttribute(
      'src',
      'file:///tmp/mockup.png'
    )
  })
})

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | null = null

  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  if (!resolve) {
    throw new Error('Expected deferred promise resolver to be assigned.')
  }

  return {
    promise,
    resolve
  }
}
