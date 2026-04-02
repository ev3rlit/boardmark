import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

import { MarkdownContent } from './markdown-content'

describe('MarkdownContent', () => {
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
    expect(container.querySelector('pre code.hljs.language-ts')).not.toBeNull()
    expect(screen.getByText('code')).toContainHTML('<code>code</code>')
  })
})
