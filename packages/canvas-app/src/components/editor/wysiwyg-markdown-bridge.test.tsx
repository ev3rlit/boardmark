import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TextSelection } from '@tiptap/pm/state'
import { WysiwygEditorSurface } from '@canvas-app/components/editor/wysiwyg-editor-surface'
import {
  createTransientWysiwygEditor,
  createWysiwygMarkdownBridge
} from '@canvas-app/components/editor/wysiwyg-markdown-bridge'

const { highlightCodeBlockMock } = vi.hoisted(() => ({
  highlightCodeBlockMock: vi.fn()
}))

vi.mock('@boardmark/ui', async () => {
  const actual = await vi.importActual<typeof import('@boardmark/ui')>('@boardmark/ui')

  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <div data-testid="markdown-content">{content}</div>
    ),
    highlightCodeBlock: highlightCodeBlockMock
  }
})

const BASELINE_MARKDOWN = `# Welcome

This is **bold** and *italic* with a [link](https://boardmark.dev).

- one
- two

> quoted`

const TABLE_AND_BLOCKS_MARKDOWN = `| Capability | Status | Notes |
| --- | :-: | ---: |
| Table | Active | semantic |

\`\`\`ts
const shipped = true
\`\`\`

\`\`\`mermaid
flowchart TD
  A[Start] --> B[Ship]
\`\`\`

<div class="boardmark-html-fallback">raw</div>
`

describe('WysiwygMarkdownBridge', () => {
  it('round-trips the supported baseline subset and custom blocks', () => {
    const bridge = createWysiwygMarkdownBridge()

    expect(bridge.roundTrip(BASELINE_MARKDOWN)).toContain('# Welcome')
    expect(bridge.roundTrip(TABLE_AND_BLOCKS_MARKDOWN)).toContain('```mermaid')
    expect(bridge.roundTrip(TABLE_AND_BLOCKS_MARKDOWN)).toContain('<div class="boardmark-html-fallback">raw</div>')
    expect(bridge.roundTrip(TABLE_AND_BLOCKS_MARKDOWN)).toMatch(/\|\s*Capability\s*\|\s*Status\s*\|\s*Notes\s*\|/)
  })

  it('normalizes trailing ::: out of list and blockquote children', () => {
    const bridge = createWysiwygMarkdownBridge()

    expect(bridge.roundTrip('- item\n- :::')).toBe('- item\n\n:::')
    expect(bridge.roundTrip('> quote\n:::')).toBe('> quote\n\n:::')
    expect(bridge.roundTrip('> quote\n> :::')).toBe('> quote\n\n:::')
  })

  it('supports table commands through the production bridge editor', () => {
    const editor = createTransientWysiwygEditor(TABLE_AND_BLOCKS_MARKDOWN)

    try {
      setSelectionInsideTable(editor)
      editor.chain().addRowAfter().run()
      editor.chain().addColumnAfter().run()
      editor.chain().setCellAttribute('align', 'center').run()
      editor.chain().toggleHeaderRow().run()

      const markdown = editor.getMarkdown()

      expect(markdown.split('\n').filter((line) => line.startsWith('|')).length).toBeGreaterThanOrEqual(4)
      expect(markdown).toContain(':------:')
      expect(markdown).toContain('--------:')
    } finally {
      editor.destroy()
    }
  })

  it('supports special block escape and code block tab indentation in the production surface', async () => {
    highlightCodeBlockMock.mockResolvedValue({
      kind: 'plain',
      lines: ['const shipped = true'],
      theme: 'plain'
    })

    render(<SurfaceHarness markdown={TABLE_AND_BLOCKS_MARKDOWN} />)

    const toggle = await screen.findByRole('button', { name: 'Edit source' })
    fireEvent.click(toggle)

    const specialSource = await screen.findByRole('textbox', { name: 'mermaid source' })
    fireEvent.keyDown(specialSource, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'mermaid source' })).toBeNull()
    })

    const codeSource = await screen.findByRole('textbox', { name: 'Code block source' }) as HTMLTextAreaElement
    codeSource.focus()
    codeSource.setSelectionRange(0, 0)
    fireEvent.keyDown(codeSource, { key: 'Tab', code: 'Tab' })

    await waitFor(() => {
      expect(codeSource.value.startsWith('  const shipped = true')).toBe(true)
    })
  })

  it('promotes ``` + Enter into a structured code block and focuses the source textarea', async () => {
    render(<SurfaceHarness markdown="```ts" />)

    const editor = await screen.findByRole('textbox', { name: 'Surface editor' })
    fireEvent.focus(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })

    const codeSource = await screen.findByRole('textbox', { name: 'Code block source' })
    const codeLanguage = await screen.findByRole('textbox', { name: 'Code block language' })

    await waitFor(() => {
      expect(codeSource).toHaveFocus()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```ts')
      expect(screen.getByTestId('markdown-value').textContent).toContain('```')
    })

    fireEvent.change(codeLanguage, {
      target: {
        value: 'tsx'
      }
    })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-value').textContent).toContain('```tsx')
    })

    expect(codeLanguage).toHaveValue('tsx')
    expect(codeSource.closest('.canvas-wysiwyg-code-block')).toHaveTextContent('```')
  })

  it('promotes ```mermaid + Enter into a special fenced block and lets the language change', async () => {
    render(<SurfaceHarness markdown="```mermaid" />)

    const editor = await screen.findByRole('textbox', { name: 'Surface editor' })
    fireEvent.focus(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })

    const specialSource = await screen.findByRole('textbox', { name: 'mermaid source' })
    const languageInput = await screen.findByLabelText('Special fenced block language')

    await waitFor(() => {
      expect(specialSource).toHaveFocus()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```mermaid')
    })

    fireEvent.change(languageInput, {
      target: {
        value: 'sandpack'
      }
    })
    fireEvent.keyDown(languageInput, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-value').textContent).toContain('```sandpack')
      expect(screen.getByTestId('markdown-value').textContent).toContain('```')
    })

    expect(languageInput).toHaveValue('sandpack')
  })

  it('converts a special fenced block into a general code block when the language becomes non-special', async () => {
    render(<SurfaceHarness markdown="```mermaid" />)

    const editor = await screen.findByRole('textbox', { name: 'Surface editor' })
    fireEvent.focus(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })

    const specialLanguageInput = await screen.findByLabelText('Special fenced block language')

    fireEvent.change(specialLanguageInput, {
      target: {
        value: 'python'
      }
    })
    fireEvent.keyDown(specialLanguageInput, { key: 'Enter', code: 'Enter' })

    const codeSource = await screen.findByRole('textbox', { name: 'Code block source' })
    const codeLanguage = await screen.findByRole('textbox', { name: 'Code block language' })

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'mermaid source' })).toBeNull()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```python')
      expect(codeLanguage).toHaveValue('python')
      expect(codeSource).toHaveFocus()
    })
  })
})

function SurfaceHarness({ markdown }: { markdown: string }) {
  const [value, setValue] = useState(markdown)

  return (
    <>
      <WysiwygEditorSurface
        ariaLabel="Surface editor"
        markdown={value}
        onBlockModeChange={() => undefined}
        onCancel={() => undefined}
        onInteractionChange={() => undefined}
        onMarkdownChange={setValue}
      />
      <pre data-testid="markdown-value">{value}</pre>
    </>
  )
}

function setSelectionInsideTable(
  editor: ReturnType<typeof createTransientWysiwygEditor>,
) {
  let cellPosition: number | null = null

  editor.state.doc.descendants((node, position) => {
    const tableRole = node.type.spec.tableRole

    if (tableRole === 'cell' || tableRole === 'header_cell') {
      cellPosition = position + 2
      return false
    }

    return true
  })

  if (cellPosition === null) {
    throw new Error('Expected a table cell to exist in the editor document.')
  }

  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, cellPosition)
    )
  )
}
