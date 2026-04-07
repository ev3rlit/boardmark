import { useRef } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { MarkdownContent } from '@boardmark/ui'
import {
  requestPendingSourceEntry
} from '@canvas-app/components/editor/caret-navigation/editor-navigation-plugin'
import {
  buildFencedMarkdown,
  buildRawFencedMarkdown,
  parseRawFencedMarkdown
} from '@canvas-app/components/editor/wysiwyg-block-helpers'
import {
  buildRawBlockSourceAttributes,
  handleRawBlockKeyDown,
  readNodePosition,
  requestRawBlockSourceEntry,
  useAutoSizeTextarea,
  useRawBlockEditingState
} from '@canvas-app/components/editor/views/raw-block-editor'
import { readOpeningCodeFenceLanguage } from '@canvas-app/markdown/fenced-block-guards'

type SpecialBlockCallbacks = {
  onExitToHost?: () => void
}

export function SpecialFencedBlockView(
  props: NodeViewProps & { callbacks?: SpecialBlockCallbacks }
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const kind = String(props.node.attrs.kind ?? 'mermaid') as 'mermaid' | 'sandpack'
  const source = String(props.node.attrs.source ?? '')
  const rawMarkdown = buildRawFencedMarkdown({
    openingFence: `\`\`\`${kind}`,
    source,
    closingFence: '```'
  })

  useAutoSizeTextarea(textareaRef, rawMarkdown)
  const { isEditing, setIsEditing } = useRawBlockEditingState({
    readCaretPosition({ caretPlacement }) {
      return caretPlacement === 'end' ? rawMarkdown.length : `\`\`\`${kind}`.length
    },
    props,
    textareaRef
  })

  return (
    <NodeViewWrapper className="canvas-wysiwyg-special-block nodrag nopan">
      {isEditing ? (
        <div className="canvas-wysiwyg-code-block__frame">
          <textarea
            ref={textareaRef}
            aria-label="Code block markdown"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="canvas-wysiwyg-code-block__textarea nodrag nopan nowheel"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-lpignore="true"
            spellCheck={false}
            {...buildRawBlockSourceAttributes('special', kind)}
            rows={Math.max(rawMarkdown.split(/\r\n|\r|\n/).length, 3)}
            value={rawMarkdown}
            onBlur={() => {
              setIsEditing(false)
            }}
            onChange={(event) => {
              updateSpecialBlockMarkdown(event.target.value, props)
            }}
            onFocus={() => {
              setIsEditing(true)
            }}
            onKeyDown={(event) => {
              handleRawBlockKeyDown({
                event,
                onEscapeToHost: props.callbacks?.onExitToHost,
                onValueChange(nextValue) {
                  updateSpecialBlockMarkdown(nextValue, props)
                },
                position: readNodePosition(props),
                setIsEditing,
                value: rawMarkdown,
                viewProps: props
              })
            }}
          />
        </div>
      ) : (
        <div
          className="canvas-wysiwyg-code-block__preview markdown-content nodrag nopan"
          onMouseDown={(event) => {
            event.preventDefault()
            setIsEditing(true)
            requestRawBlockSourceEntry(props)
          }}
        >
          <MarkdownContent content={buildFencedMarkdown(kind, source)} />
        </div>
      )}
    </NodeViewWrapper>
  )
}

function updateSpecialBlockMarkdown(
  rawMarkdown: string,
  props: NodeViewProps
) {
  const parsedMarkdown = parseRawFencedMarkdown(rawMarkdown)
  const language = readOpeningCodeFenceLanguage(parsedMarkdown.openingFence)

  if (language === 'mermaid' || language === 'sandpack') {
    props.updateAttributes({
      kind: language,
      source: parsedMarkdown.source
    })
    return
  }

  const position = readNodePosition(props)

  if (position === null) {
    return
  }

  props.editor.commands.command(({ tr }) => {
    tr.replaceRangeWith(
      position,
      position + props.node.nodeSize,
      props.editor.schema.nodes.wysiwygCodeBlock.create({
        openingFence: parsedMarkdown.openingFence,
        source: parsedMarkdown.source,
        closingFence: parsedMarkdown.closingFence
      })
    )
    tr.setSelection(NodeSelection.create(tr.doc, position))
    requestPendingSourceEntry(tr, position)
    return true
  })
}
