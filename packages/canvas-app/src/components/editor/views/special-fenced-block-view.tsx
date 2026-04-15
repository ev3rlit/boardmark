import { useRef } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import {
  composeSandpackSourceInput,
  parseSandpackSource,
  serializeSandpackSourceBody,
  MarkdownContent
} from '@boardmark/ui'
import {
  requestPendingSourceEntry
} from '@canvas-app/components/editor/caret-navigation/editor-navigation-plugin'
import {
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
  const openingFence = String(props.node.attrs.openingFence ?? `\`\`\`${kind}`)
  const source = String(props.node.attrs.source ?? '')
  const closingFence = String(props.node.attrs.closingFence ?? '```')
  const rawMarkdown = buildRawFencedMarkdown({
    openingFence,
    source,
    closingFence
  })

  useAutoSizeTextarea(textareaRef, rawMarkdown)
  const { isEditing, setIsEditing } = useRawBlockEditingState({
    readCaretPosition({ caretPlacement }) {
      return caretPlacement === 'end' ? rawMarkdown.length : openingFence.length
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
          <MarkdownContent content={ensurePreviewMarkdown(rawMarkdown)} />
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
    const normalizedSandpack = language === 'sandpack'
      ? normalizeSandpackBlock(parsedMarkdown)
      : parsedMarkdown

    props.updateAttributes({
      closingFence: normalizedSandpack.closingFence,
      kind: language,
      openingFence: normalizedSandpack.openingFence,
      source: normalizedSandpack.source
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

function ensurePreviewMarkdown(markdown: string) {
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`
}

function normalizeSandpackBlock(parsedMarkdown: {
  closingFence: string
  openingFence: string
  source: string
}) {
  const meta = readSandpackFenceMeta(parsedMarkdown.openingFence)

  try {
    const parsed = parseSandpackSource(
      composeSandpackSourceInput({
        source: parsedMarkdown.source,
        meta
      })
    )

    return {
      closingFence: '````',
      openingFence: '````sandpack',
      source: serializeSandpackSourceBody(parsed.document)
    }
  } catch {
    return parsedMarkdown
  }
}

function readSandpackFenceMeta(openingFence: string) {
  const trimmedFence = openingFence.trim()
  const language = readOpeningCodeFenceLanguage(trimmedFence)

  if (language !== 'sandpack') {
    return undefined
  }

  const languageIndex = trimmedFence.indexOf(language)

  if (languageIndex < 0) {
    return undefined
  }

  const meta = trimmedFence.slice(languageIndex + language.length).trim()
  return meta.length > 0 ? meta : undefined
}
