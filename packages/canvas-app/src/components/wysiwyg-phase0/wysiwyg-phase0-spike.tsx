import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { Editor as CoreEditor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/react'
import { MarkdownContent } from '@boardmark/ui'
import { WYSIWYG_PHASE0_SAMPLES } from './wysiwyg-phase0-samples'
import { createWysiwygPhase0MarkdownBridge } from './wysiwyg-phase0-markdown-bridge'
import { normalizeMarkdownForComparison } from './wysiwyg-phase0-helpers'
import type { WysiwygPhase0Finding } from './wysiwyg-phase0-types'

export function WysiwygPhase0Spike() {
  const bridge = useMemo(() => createWysiwygPhase0MarkdownBridge(), [])
  const [selectedSampleId, setSelectedSampleId] = useState(WYSIWYG_PHASE0_SAMPLES[0]?.id ?? '')
  const selectedSample = useMemo(
    () =>
      WYSIWYG_PHASE0_SAMPLES.find((sample) => sample.id === selectedSampleId) ??
      WYSIWYG_PHASE0_SAMPLES[0],
    [selectedSampleId]
  )
  const [markdown, setMarkdown] = useState(selectedSample?.markdown ?? '')
  const deferredMarkdown = useDeferredValue(markdown)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: bridge.extensions,
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'markdown-content wysiwyg-phase0-editor__content'
      }
    },
    onUpdate({ editor: nextEditor }) {
      setMarkdown(nextEditor.getMarkdown())
    }
  })

  useEffect(() => {
    if (!selectedSample) {
      return
    }

    setMarkdown(selectedSample.markdown)

    if (!editor) {
      return
    }

    if (editor.getMarkdown() === selectedSample.markdown) {
      return
    }

    editor.commands.setContent(selectedSample.markdown, {
      contentType: 'markdown'
    })
  }, [editor, selectedSample])

  const findings = useMemo(
    () => readSpikeFindings(selectedSample?.markdown ?? '', markdown),
    [markdown, selectedSample]
  )

  if (!selectedSample) {
    return null
  }

  return (
    <div className="wysiwyg-phase0-shell">
      <header className="wysiwyg-phase0-hero">
        <div className="wysiwyg-phase0-hero__copy">
          <p className="wysiwyg-phase0-kicker">WYSIWYG Phase 0</p>
          <h1>Tiptap markdown spike for Boardmark</h1>
          <p>
            This isolated web-only surface checks whether Tiptap can keep markdown canonical while
            covering the agreed v1 subset, special fenced blocks, and block-local HTML fallback.
          </p>
        </div>
        <div className="wysiwyg-phase0-hero__meta">
          <span>Query param: <code>?spike=wysiwyg-phase0</code></span>
          <span>Production CanvasScene remains untouched.</span>
        </div>
      </header>

      <section className="wysiwyg-phase0-toolbar">
        <label className="wysiwyg-phase0-sample-picker">
          <span>Sample document</span>
          <select
            aria-label="Sample document"
            value={selectedSample.id}
            onChange={(event) => setSelectedSampleId(event.target.value)}
          >
            {WYSIWYG_PHASE0_SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.name}
              </option>
            ))}
          </select>
        </label>
        <div className="wysiwyg-phase0-toolbar__actions">
          <ToolbarButton label="Bold" onClick={() => applyBold(editor)} />
          <ToolbarButton label="Italic" onClick={() => applyItalic(editor)} />
          <ToolbarButton
            label="Link"
            onClick={() => {
              const href = window.prompt('Link URL', 'https://boardmark.dev')

              if (!href) {
                return
              }

              applyLink(editor, href)
            }}
          />
          <ToolbarButton label="Add Row" onClick={() => addTableRow(editor)} />
          <ToolbarButton
            label="Add Column"
            onClick={() => addTableColumn(editor)}
          />
          <ToolbarButton
            label="Align Center"
            onClick={() => alignCurrentTableCell(editor, 'center')}
          />
          <ToolbarButton
            label="Toggle Header"
            onClick={() => toggleTableHeader(editor)}
          />
        </div>
      </section>

      <main className="wysiwyg-phase0-grid">
        <section className="wysiwyg-phase0-panel wysiwyg-phase0-panel--editor">
          <div className="wysiwyg-phase0-panel__header">
            <div>
              <p className="wysiwyg-phase0-panel__eyebrow">Editable surface</p>
              <h2>{selectedSample.name}</h2>
            </div>
            <p className="wysiwyg-phase0-panel__description">{selectedSample.description}</p>
          </div>
          <div className="wysiwyg-phase0-editor">{editor ? <EditorContent editor={editor} /> : null}</div>
        </section>

        <section className="wysiwyg-phase0-panel">
          <div className="wysiwyg-phase0-panel__header">
            <div>
              <p className="wysiwyg-phase0-panel__eyebrow">Markdown output</p>
              <h2>Serialized fragment</h2>
            </div>
          </div>
          <pre className="wysiwyg-phase0-markdown-output">
            <code>{deferredMarkdown}</code>
          </pre>
        </section>

        <section className="wysiwyg-phase0-panel">
          <div className="wysiwyg-phase0-panel__header">
            <div>
              <p className="wysiwyg-phase0-panel__eyebrow">Preview parity</p>
              <h2>Rendered output</h2>
            </div>
          </div>
          <div className="wysiwyg-phase0-preview markdown-content">
            <MarkdownContent content={deferredMarkdown} />
          </div>
        </section>

        <section className="wysiwyg-phase0-panel">
          <div className="wysiwyg-phase0-panel__header">
            <div>
              <p className="wysiwyg-phase0-panel__eyebrow">Findings</p>
              <h2>Phase 0 checkpoints</h2>
            </div>
          </div>
          <ul className="wysiwyg-phase0-findings">
            {findings.map((finding) => (
              <li key={finding.id} data-status={finding.status}>
                <strong>{finding.label}</strong>
                <span>{finding.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

function ToolbarButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className="wysiwyg-phase0-inline-button" onClick={onClick}>
      {label}
    </button>
  )
}

function readSpikeFindings(sampleMarkdown: string, currentMarkdown: string): WysiwygPhase0Finding[] {
  const normalizedInput = normalizeMarkdownForComparison(sampleMarkdown)
  const normalizedOutput = normalizeMarkdownForComparison(currentMarkdown)
  const matches = normalizedInput === normalizedOutput

  return [
    {
      id: 'round-trip',
      label: 'Markdown bridge',
      status: matches ? 'pass' : 'warning',
      detail: matches
        ? 'Sample currently round-trips without structural diff.'
        : 'Serialized markdown differs from the sample. Review table alignment or custom block formatting.'
    },
    {
      id: 'code-block',
      label: 'Code block editing',
      status: currentMarkdown.includes('```') ? 'pass' : 'warning',
      detail: currentMarkdown.includes('```')
        ? 'Custom code block node keeps fenced output and exposes textarea-based editing.'
        : 'No fenced block is present in the current output.'
    },
    {
      id: 'special-block',
      label: 'Special fenced blocks',
      status: /```(mermaid|sandpack)/.test(currentMarkdown) ? 'pass' : 'warning',
      detail: /```(mermaid|sandpack)/.test(currentMarkdown)
        ? 'Special blocks remain fenced and use preview/source toggle in the editor.'
        : 'Current document does not include a mermaid or sandpack block.'
    },
    {
      id: 'html-fallback',
      label: 'HTML fallback',
      status: /<[^>]+>/.test(currentMarkdown) ? 'pass' : 'warning',
      detail: /<[^>]+>/.test(currentMarkdown)
        ? 'Raw HTML stays local to its block and is serialized as raw source.'
        : 'Current document does not include an HTML fallback block.'
    }
  ]
}

export function readWysiwygPhase0Markdown(editor: CoreEditor | null) {
  return editor?.getMarkdown() ?? ''
}

export function applyBold(editor: CoreEditor | null) {
  editor?.chain().toggleBold().run()
}

export function applyItalic(editor: CoreEditor | null) {
  editor?.chain().toggleItalic().run()
}

export function applyLink(editor: CoreEditor | null, href: string) {
  editor?.chain().extendMarkRange('link').setLink({ href }).run()
}

export function addTableRow(editor: CoreEditor | null) {
  if (editor === null || !ensureTableSelection(editor)) {
    return
  }

  editor.chain().addRowAfter().run()
}

export function addTableColumn(editor: CoreEditor | null) {
  if (editor === null || !ensureTableSelection(editor)) {
    return
  }

  editor.chain().addColumnAfter().run()
}

export function alignCurrentTableCell(
  editor: CoreEditor | null,
  align: 'left' | 'center' | 'right'
) {
  if (editor === null || !ensureTableSelection(editor)) {
    return
  }

  editor.chain().setCellAttribute('align', align).run()
}

export function toggleTableHeader(editor: CoreEditor | null) {
  if (editor === null || !ensureTableSelection(editor)) {
    return
  }

  editor.chain().toggleHeaderRow().run()
}

function ensureTableSelection(editor: CoreEditor | null) {
  if (!editor) {
    return false
  }

  if (isSelectionInsideTable(editor)) {
    return true
  }

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
    return false
  }

  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, cellPosition))
  )

  return true
}

function isSelectionInsideTable(editor: CoreEditor) {
  for (let depth = editor.state.selection.$from.depth; depth >= 0; depth -= 1) {
    const role = editor.state.selection.$from.node(depth).type.spec.tableRole

    if (role === 'table' || role === 'row' || role === 'cell' || role === 'header_cell') {
      return true
    }
  }

  return false
}
