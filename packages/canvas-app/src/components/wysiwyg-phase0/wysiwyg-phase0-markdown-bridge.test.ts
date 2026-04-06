import { describe, expect, it } from 'vitest'
import { TextSelection } from '@tiptap/pm/state'
import { WYSIWYG_PHASE0_SAMPLES } from './wysiwyg-phase0-samples'
import {
  createTransientWysiwygPhase0Editor,
  createWysiwygPhase0MarkdownBridge
} from './wysiwyg-phase0-markdown-bridge'
import { normalizeMarkdownForComparison } from './wysiwyg-phase0-helpers'
import {
  addTableColumn,
  addTableRow,
  alignCurrentTableCell,
  toggleTableHeader
} from './wysiwyg-phase0-spike'

describe('WysiwygPhase0MarkdownBridge', () => {
  it('round-trips the baseline subset without changing structure', () => {
    const bridge = createWysiwygPhase0MarkdownBridge()
    const sample = WYSIWYG_PHASE0_SAMPLES.find((entry) => entry.id === 'baseline')

    expect(sample).toBeDefined()
    expect(normalizeMarkdownForComparison(bridge.roundTrip(sample!.markdown))).toBe(
      normalizeMarkdownForComparison(sample!.markdown)
    )
  })

  it('preserves table alignment markers and special fenced blocks', () => {
    const bridge = createWysiwygPhase0MarkdownBridge()
    const tableSample = WYSIWYG_PHASE0_SAMPLES.find((entry) => entry.id === 'code-table')
    const specialSample = WYSIWYG_PHASE0_SAMPLES.find((entry) => entry.id === 'special-fallback')

    expect(bridge.roundTrip(tableSample!.markdown)).toMatch(/\|\s*:?-+\s*\|\s*:-+:\s*\|\s*-+:\s*\|/)

    const specialRoundTrip = bridge.roundTrip(specialSample!.markdown)
    expect(specialRoundTrip).toContain('```mermaid')
    expect(specialRoundTrip).toContain('```sandpack')
    expect(specialRoundTrip).toContain('<div class="boardmark-html-fallback">')
  })

  it('applies toolbar-style marks and table commands through the same editor surface', () => {
    const baselineSample = WYSIWYG_PHASE0_SAMPLES.find((entry) => entry.id === 'baseline')
    const tableSample = WYSIWYG_PHASE0_SAMPLES.find((entry) => entry.id === 'code-table')

    const baselineEditor = createTransientWysiwygPhase0Editor(baselineSample!.markdown)
    try {
      setSelectionForText(baselineEditor, 'bold')
      baselineEditor.commands.toggleBold()
      setSelectionForText(baselineEditor, 'italic')
      baselineEditor.commands.toggleItalic()
      setSelectionForText(baselineEditor, 'link')
      baselineEditor.commands.setLink({ href: 'https://example.com/docs' })

      const markdown = baselineEditor.getMarkdown()
      expect(markdown).toContain('**bold,**')
      expect(markdown).toContain('*italic,*')
      expect(markdown).toContain('[link.](https://example.com/docs)')
    } finally {
      baselineEditor.destroy()
    }

    const tableEditor = createTransientWysiwygPhase0Editor(tableSample!.markdown)
    try {
      addTableRow(tableEditor)
      addTableColumn(tableEditor)
      alignCurrentTableCell(tableEditor, 'center')
      toggleTableHeader(tableEditor)

      const markdown = tableEditor.getMarkdown()
      expect(markdown.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(6)
      expect(markdown).toMatch(/\|\s*:?-+\s*\|\s*:-+:\s*\|\s*-+:\s*\|\s*---\s*\|/)
    } finally {
      tableEditor.destroy()
    }
  })
})

function setSelectionForText(
  editor: ReturnType<typeof createTransientWysiwygPhase0Editor>,
  text: string
) {
  let nextSelection: { from: number; to: number } | null = null

  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) {
      return true
    }

    const matchIndex = node.text.indexOf(text)

    if (matchIndex === -1) {
      return true
    }

    nextSelection = {
      from: position + matchIndex + 1,
      to: position + matchIndex + text.length + 1
    }
    return false
  })

  if (!nextSelection) {
    throw new Error(`Text not found for selection: ${text}`)
  }

  const selection = nextSelection as { from: number; to: number }
  const transaction = editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, selection.from, selection.to)
  )

  editor.view.dispatch(transaction)
}
