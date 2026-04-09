import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { moveVerticalSelection } from '@canvas-app/components/editor/caret-navigation/editor-navigation-plugin'
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

const CARET_NAVIGATION_MARKDOWN = `Before paragraph

\`\`\`ts
const shipped = true
\`\`\`

\`\`\`mermaid
flowchart TD
  A[Start] --> B[Ship]
\`\`\`

<div class="boardmark-html-fallback">raw</div>

After paragraph
`

const CARET_CODE_BLOCK_ONLY_MARKDOWN = `Before paragraph

\`\`\`ts
const shipped = true
\`\`\`

After paragraph
`

const TOP_LEVEL_CODE_BLOCK_ONLY_MARKDOWN = `\`\`\`ts
const shipped = true
\`\`\`
`

const BLOCKQUOTE_CODE_BLOCK_MARKDOWN = `asdfsaf

> \`\`\`typescript
> heloo world
> \`\`\`

after quote
`

const LIST_CODE_BLOCK_MARKDOWN = `before list

- intro

  \`\`\`typescript
  hello list
  \`\`\`

after list
`

const SOFT_LINE_BREAK_MARKDOWN = `first line
second line`

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

  it('upgrades legacy soft line breaks into visible hard breaks', () => {
    const editor = createTransientWysiwygEditor(SOFT_LINE_BREAK_MARKDOWN)

    try {
      expect(editor.getJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'first line' },
              { type: 'hardBreak' },
              { type: 'text', text: 'second line' }
            ]
          }
        ]
      })
      expect(editor.getMarkdown()).toBe('first line  \nsecond line')
    } finally {
      editor.destroy()
    }
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

    const specialSource = await openCodeBlockEditor('```mermaid')
    fireEvent.keyDown(specialSource, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Code block markdown' })).toBeNull()
    })

    const codeMarkdown = await openCodeBlockEditor('```ts')
    const codeLineStart = codeMarkdown.value.indexOf('const')

    codeMarkdown.focus()
    codeMarkdown.setSelectionRange(codeLineStart, codeLineStart)
    fireEvent.keyDown(codeMarkdown, { key: 'Tab', code: 'Tab' })

    await waitFor(() => {
      expect(codeMarkdown.value).toContain('\n  const shipped = true\n')
    })
  })

  it('promotes ``` into a structured code block as soon as the paragraph matches an opening fence', () => {
    const editor = createTransientWysiwygEditor('')

    try {
      editor.commands.insertContent('```')

      expect(editor.state.doc.firstChild?.type.name).toBe('wysiwygCodeBlock')
      expect(editor.getMarkdown()).toContain('```')
    } finally {
      editor.destroy()
    }
  })

  it('enters raw source immediately after ``` promotion and keeps subsequent typing inside the block', async () => {
    const editorRef = { current: null as Editor | null }
    render(
      <SurfaceHarness
        markdown=""
        onEditorChange={(editor) => {
          editorRef.current = editor
        }}
      />
    )

    const editor = await waitForEditor(editorRef)

    await act(async () => {
      editor.commands.insertContent('```')
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
      expect(codeMarkdown.value).toContain('```')
    })

    fireEvent.change(codeMarkdown, {
      target: {
        value: '```ts\nx\n```'
      }
    })

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```ts')
      expect(screen.getByTestId('markdown-value').textContent).toContain('x')
    })
  })

  it('renders a new code block with full fence height and editable raw markdown', async () => {
    render(<SurfaceHarness markdown={'```\n\n```'} />)

    const codeMarkdown = await openCodeBlockEditor('```')

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
      expect(codeMarkdown.selectionStart).toBe(3)
      expect(codeMarkdown.rows).toBeGreaterThanOrEqual(3)
      expect(screen.getByTestId('markdown-value').textContent).toContain('```')
      expect(screen.getByTestId('markdown-value').textContent).toContain('```')
    })

    fireEvent.change(codeMarkdown, {
      target: {
        value: '~~~tsx\nconst ready = true\n~~~'
      }
    })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-value').textContent).toContain('~~~tsx')
      expect(screen.getByTestId('markdown-value').textContent).toContain('const ready = true')
      expect(screen.getByTestId('markdown-value').textContent).toContain('\n~~~\n')
    })
  })

  it('keeps focus inside an existing raw code block when completing special fence names', async () => {
    const { rerender } = render(<SurfaceHarness markdown={'```sandpac\n\n```'} />)

    const sandpackBlock = await openCodeBlockEditor('```sandpac')

    fireEvent.focus(sandpackBlock)
    fireEvent.change(sandpackBlock, {
      target: {
        value: '```sandpack\n\n```'
      }
    })

    await waitFor(() => {
      expect(sandpackBlock).toHaveFocus()
      expect(screen.queryByRole('textbox', { name: 'sandpack source' })).toBeNull()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```sandpack')
    })

    rerender(<SurfaceHarness markdown={'```mermai\n\n```'} />)

    const mermaidBlock = await openCodeBlockEditor('```mermai')

    fireEvent.focus(mermaidBlock)
    fireEvent.change(mermaidBlock, {
      target: {
        value: '```mermaid\n\n```'
      }
    })

    await waitFor(() => {
      expect(mermaidBlock).toHaveFocus()
      expect(screen.queryByRole('textbox', { name: 'mermaid source' })).toBeNull()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```mermaid')
    })
  })

  it('promotes ```mermaid + Enter into a special fenced block and lets the language change', async () => {
    render(<SurfaceHarness markdown="```mermaid" />)

    const editor = await screen.findByRole('textbox', { name: 'Surface editor' })
    fireEvent.focus(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })

    const specialSource = await openCodeBlockEditor('```mermaid')

    await waitFor(() => {
      expect(specialSource).toHaveFocus()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```mermaid')
    })

    fireEvent.change(specialSource, {
      target: {
        value: '```sandpack\n\n```'
      }
    })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-value').textContent).toContain('```sandpack')
      expect(screen.getByTestId('markdown-value').textContent).toContain('```')
    })
  })

  it('converts a special fenced block into a general code block when the language becomes non-special', async () => {
    render(<SurfaceHarness markdown="```mermaid" />)

    const editor = await screen.findByRole('textbox', { name: 'Surface editor' })
    fireEvent.focus(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })

    const specialSource = await openCodeBlockEditor('```mermaid')

    await waitFor(() => {
      expect(specialSource).toHaveFocus()
    })

    fireEvent.change(specialSource, {
      target: {
        value: '```python\n\n```'
      }
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
      expect(screen.getByTestId('markdown-value').textContent).toContain('```python')
      expect(codeMarkdown.value).toContain('```python')
    })
  })

  it('moves from a paragraph into a fenced block with ArrowDown and enters raw source editing immediately', async () => {
    const editorRef = { current: null as Editor | null }
    render(
      <SurfaceHarness
        markdown={CARET_CODE_BLOCK_ONLY_MARKDOWN}
        onEditorChange={(editor) => {
          editorRef.current = editor
        }}
      />
    )

    const editor = await waitForEditor(editorRef)

    editor.commands.setTextSelection(findParagraphBoundary(editor, 'Before paragraph', 'end'))
    await act(async () => {
      moveVerticalSelection(editor.view, 'down')
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(NodeSelection)
      expect((editor.state.selection as NodeSelection).node.type.name).toBe('wysiwygCodeBlock')
      expect(codeMarkdown).toHaveFocus()
      expect(codeMarkdown.selectionStart).toBe(5)
      expect(codeMarkdown.selectionEnd).toBe(5)
    })
  })

  it('moves from a paragraph below into a fenced block with ArrowUp and enters near the closing fence', async () => {
    const editorRef = { current: null as Editor | null }
    render(
      <SurfaceHarness
        markdown={CARET_CODE_BLOCK_ONLY_MARKDOWN}
        onEditorChange={(editor) => {
          editorRef.current = editor
        }}
      />
    )

    const editor = await waitForEditor(editorRef)

    editor.commands.setTextSelection(findParagraphBoundary(editor, 'After paragraph', 'start'))
    await act(async () => {
      moveVerticalSelection(editor.view, 'up')
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(NodeSelection)
      expect((editor.state.selection as NodeSelection).node.type.name).toBe('wysiwygCodeBlock')
      expect(codeMarkdown).toHaveFocus()
      expect(codeMarkdown.selectionStart).toBe(codeMarkdown.value.length)
      expect(codeMarkdown.selectionEnd).toBe(codeMarkdown.value.length)
    })
  })

  it('enters a fenced code block inside a blockquote from the paragraph below with ArrowUp', async () => {
    const editorRef = { current: null as Editor | null }
    render(
      <SurfaceHarness
        markdown={BLOCKQUOTE_CODE_BLOCK_MARKDOWN}
        onEditorChange={(editor) => {
          editorRef.current = editor
        }}
      />
    )

    const editor = await waitForEditor(editorRef)

    editor.commands.setTextSelection(findParagraphBoundary(editor, 'after quote', 'start'))
    await act(async () => {
      moveVerticalSelection(editor.view, 'up')
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(NodeSelection)
      expect((editor.state.selection as NodeSelection).node.type.name).toBe('wysiwygCodeBlock')
      expect(codeMarkdown).toHaveFocus()
      expect(codeMarkdown.value).toContain('```typescript')
      expect(codeMarkdown.selectionStart).toBe(codeMarkdown.value.length)
    })
  })

  it('enters a fenced code block inside a list from the paragraph below with ArrowUp', async () => {
    const editorRef = { current: null as Editor | null }
    render(
      <SurfaceHarness
        markdown={LIST_CODE_BLOCK_MARKDOWN}
        onEditorChange={(editor) => {
          editorRef.current = editor
        }}
      />
    )

    const editor = await waitForEditor(editorRef)

    editor.commands.setTextSelection(findParagraphBoundary(editor, 'after list', 'start'))
    await act(async () => {
      moveVerticalSelection(editor.view, 'up')
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(NodeSelection)
      expect((editor.state.selection as NodeSelection).node.type.name).toBe('wysiwygCodeBlock')
      expect(codeMarkdown).toHaveFocus()
      expect(codeMarkdown.value).toContain('```typescript')
      expect(codeMarkdown.selectionStart).toBe(codeMarkdown.value.length)
    })
  })

  it('enters source editing from preview clicks and exits fenced blocks at vertical boundaries', async () => {
    const editorRef = { current: null as Editor | null }
    render(
      <SurfaceHarness
        markdown={CARET_CODE_BLOCK_ONLY_MARKDOWN}
        onEditorChange={(editor) => {
          editorRef.current = editor
        }}
      />
    )

    const editor = await waitForEditor(editorRef)
    const codeMarkdown = await openCodeBlockEditor('```ts')

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
    })

    codeMarkdown.setSelectionRange(0, 0)
    await act(async () => {
      fireEvent.keyDown(codeMarkdown, { key: 'ArrowUp', code: 'ArrowUp' })
    })

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(TextSelection)
      expect(editor.state.selection.$from.parent.textContent).toBe('Before paragraph')
      expect(screen.queryByRole('textbox', { name: 'Code block markdown' })).toBeNull()
    })

    const reopenedCodeMarkdown = await openCodeBlockEditor('```ts')
    reopenedCodeMarkdown.setSelectionRange(reopenedCodeMarkdown.value.length, reopenedCodeMarkdown.value.length)
    await act(async () => {
      fireEvent.keyDown(reopenedCodeMarkdown, { key: 'ArrowDown', code: 'ArrowDown' })
    })

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(TextSelection)
      expect(editor.state.selection.$from.parent.textContent).toBe('After paragraph')
      expect(screen.queryByRole('textbox', { name: 'Code block markdown' })).toBeNull()
    })
  })

  it('keeps focus inside a fenced block when ArrowUp cannot leave because there is no block above', async () => {
    render(<SurfaceHarness markdown={TOP_LEVEL_CODE_BLOCK_ONLY_MARKDOWN} />)

    const codeMarkdown = await openCodeBlockEditor('```ts')

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
    })

    codeMarkdown.setSelectionRange(0, 0)
    await act(async () => {
      fireEvent.keyDown(codeMarkdown, { key: 'ArrowUp', code: 'ArrowUp' })
    })

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
      expect(screen.getByRole('textbox', { name: 'Code block markdown' })).toBe(codeMarkdown)
    })
  })

  it('uses raw source editing for special and html fallback blocks and returns to host on Escape', async () => {
    const onCancel = vi.fn()
    render(<SurfaceHarness markdown={CARET_NAVIGATION_MARKDOWN} onCancel={onCancel} />)

    const specialSource = await openCodeBlockEditor('```mermaid')
    expect(specialSource).toHaveAccessibleName('Code block markdown')

    fireEvent.keyDown(specialSource, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    const htmlPreview = await screen.findByText('<div class="boardmark-html-fallback">raw</div>')
    fireEvent.mouseDown(htmlPreview)

    const htmlSource = await screen.findByRole('textbox', { name: 'HTML fallback source' })
    expect(htmlSource).toHaveFocus()

    fireEvent.keyDown(htmlSource, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(2)
    })
  })

  it('does not use ArrowRight to leave a block selection', async () => {
    render(<SurfaceHarness markdown={CARET_NAVIGATION_MARKDOWN} />)

    const codeMarkdown = await openCodeBlockEditor('```ts')
    codeMarkdown.setSelectionRange(3, 3)

    await act(async () => {
      fireEvent.keyDown(codeMarkdown, { key: 'ArrowRight', code: 'ArrowRight' })
    })

    expect(screen.getByRole('textbox', { name: 'Code block markdown' })).toBe(codeMarkdown)
  })

  it('renders legacy soft line breaks as visible breaks in the production surface', async () => {
    const { container } = render(<SurfaceHarness markdown={SOFT_LINE_BREAK_MARKDOWN} />)

    await waitFor(() => {
      expect(container.querySelector('.canvas-wysiwyg-surface__content br')).not.toBeNull()
    })
  })
})

function SurfaceHarness({
  markdown,
  onCancel = () => undefined,
  onEditorChange
}: {
  markdown: string
  onCancel?: () => void
  onEditorChange?: (editor: Editor | null) => void
}) {
  const [value, setValue] = useState(markdown)

  return (
    <>
      <WysiwygEditorSurface
        ariaLabel="Surface editor"
        markdown={value}
        onBlockModeChange={() => undefined}
        onCancel={onCancel}
        onEditorChange={onEditorChange}
        onInteractionChange={() => undefined}
        onMarkdownChange={setValue}
      />
      <pre data-testid="markdown-value">{value}</pre>
    </>
  )
}

async function findMarkdownPreview(pattern: string) {
  await waitFor(() => {
    expect(screen.getAllByTestId('markdown-content').length).toBeGreaterThan(0)
  })

  const previews = screen.getAllByTestId('markdown-content')
  const match = previews.find((preview) => preview.textContent?.includes(pattern))

  if (!match) {
    throw new Error(`Expected a markdown preview containing "${pattern}" to exist.`)
  }

  return match
}

async function openCodeBlockEditor(pattern: string) {
  const existingEditor = screen.queryByRole('textbox', { name: 'Code block markdown' })

  if (existingEditor instanceof HTMLTextAreaElement) {
    return existingEditor
  }

  fireEvent.mouseDown(await findMarkdownPreview(pattern))
  return await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement
}

async function openSpecialBlockEditor(pattern: string) {
  const existingEditor = screen.queryByRole('textbox', { name: 'Code block markdown' })

  if (existingEditor instanceof HTMLTextAreaElement) {
    return existingEditor
  }

  fireEvent.mouseDown(await findMarkdownPreview(pattern))
  return await screen.findByRole('textbox', { name: 'Code block markdown' }) as HTMLTextAreaElement
}

function findParagraphBoundary(
  editor: Editor,
  paragraphText: string,
  edge: 'end' | 'start'
) {
  let boundaryPosition: number | null = null

  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'paragraph' || node.textContent !== paragraphText) {
      return true
    }

    boundaryPosition = edge === 'start' ? position + 1 : position + node.nodeSize - 1
    return false
  })

  if (boundaryPosition === null) {
    throw new Error(`Expected paragraph "${paragraphText}" to exist.`)
  }

  return boundaryPosition
}

async function waitForEditor(editorRef: { current: Editor | null }) {
  await waitFor(() => {
    expect(editorRef.current).not.toBeNull()
  })

  return editorRef.current as Editor
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
