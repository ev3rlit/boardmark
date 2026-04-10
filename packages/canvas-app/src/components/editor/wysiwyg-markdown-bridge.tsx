import { Editor, Node, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core'
import Code from '@tiptap/extension-code'
import Link from '@tiptap/extension-link'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  buildFencedMarkdown,
  buildRawFencedMarkdown,
  ensureTrailingNewline
} from '@canvas-app/components/editor/wysiwyg-block-helpers'
import {
  requestPendingSourceEntry,
  WysiwygEditorNavigation
} from '@canvas-app/components/editor/caret-navigation/editor-navigation-plugin'
import { CodeBlockNodeView } from '@canvas-app/components/editor/views/code-block-node-view'
import { HtmlFallbackBlockView } from '@canvas-app/components/editor/views/html-fallback-block-view'
import { SpecialFencedBlockView } from '@canvas-app/components/editor/views/special-fenced-block-view'
import {
  readFenceToken,
  readOpeningCodeFenceLanguage
} from '@canvas-app/markdown/fenced-block-guards'

type MarkdownCodeToken = {
  type: 'code'
  lang?: string
  text?: string
} & Record<string, unknown>

type MarkdownHtmlToken = {
  type: 'html'
  raw?: string
  text?: string
} & Record<string, unknown>

const CODE_BLOCK_DATA_ATTRIBUTE = 'data-canvas-wysiwyg-code-block'
const SPECIAL_BLOCK_DATA_ATTRIBUTE = 'data-canvas-wysiwyg-special-block'
const HTML_BLOCK_DATA_ATTRIBUTE = 'data-canvas-wysiwyg-html-block'
const WysiwygInlineCode = Code.extend({
  priority: 90,
  excludes: ''
})
const WysiwygHardBreak = Node.create({
  name: 'hardBreak',
  markdownTokenName: 'br',
  inline: true,
  group: 'inline',
  selectable: false,
  linebreakReplacement: true,
  addOptions() {
    return {
      HTMLAttributes: {},
      keepMarks: true
    }
  },
  parseHTML() {
    return [{ tag: 'br' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['br', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
  renderText() {
    return '\n'
  },
  renderMarkdown() {
    return '\n'
  },
  parseMarkdown() {
    return {
      type: 'hardBreak'
    }
  },
  addCommands() {
    return {
      setHardBreak:
        () =>
        ({ commands, chain, editor, state }) => {
          return commands.first([
            () => commands.exitCode(),
            () =>
              commands.command(() => {
                const { selection, storedMarks } = state

                if (selection.$from.parent.type.spec.isolating) {
                  return false
                }

                const marks = storedMarks || (selection.$to.parentOffset && selection.$from.marks())

                return chain()
                  .insertContent({ type: this.name })
                  .command(({ dispatch, tr }) => {
                    if (dispatch && marks && this.options.keepMarks) {
                      const filteredMarks = marks.filter((mark) =>
                        editor.extensionManager.splittableMarks.includes(mark.type.name)
                      )

                      tr.ensureMarks(filteredMarks)
                    }

                    return true
                  })
                  .run()
              })
          ])
        }
    }
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.setHardBreak(),
      'Shift-Enter': () => this.editor.commands.setHardBreak()
    }
  }
})

type WysiwygMarkdownBridgeCallbacks = {
  onExitToHost?: () => void
}

export type WysiwygMarkdownBridge = {
  extensions: AnyExtension[]
  fromMarkdown: (markdown: string) => JSONContent
  roundTrip: (markdown: string) => string
  toMarkdown: (content: JSONContent) => string
}

export function createWysiwygMarkdownBridge(
  callbacks: WysiwygMarkdownBridgeCallbacks = {}
): WysiwygMarkdownBridge {
  const extensions = createWysiwygExtensions(callbacks)
  const manager = new MarkdownManager({
    extensions,
    indentation: {
      style: 'space',
      size: 2
    }
  })

  return {
    extensions,
    fromMarkdown(markdown) {
      const normalizedMarkdown = normalizeDirectiveEndingBoundaries(markdown)
      const preparedMarkdown = preserveExtraBlankLinesForWysiwyg(normalizedMarkdown)

      return normalizeSoftLineBreaksInContent(
        normalizeBlankPlaceholderParagraphsInContent(
          manager.parse(preparedMarkdown.markdown),
          preparedMarkdown.placeholder
        )
      )
    },
    toMarkdown(content) {
      return normalizeDirectiveEndingBoundaries(
        manager.serialize(normalizeInlineMarkOrderInContent(content))
      )
    },
    roundTrip(markdown) {
      return normalizeDirectiveEndingBoundaries(
        manager.serialize(
          normalizeInlineMarkOrderInContent(
            manager.parse(normalizeDirectiveEndingBoundaries(markdown))
          )
        )
      )
    }
  }
}

export function createWysiwygExtensions(
  callbacks: WysiwygMarkdownBridgeCallbacks = {}
): AnyExtension[] {
  const specialBlockCallbacks = {
    onExitToHost: callbacks.onExitToHost
  }

  return [
    WysiwygEditorNavigation.configure({
      callbacks: specialBlockCallbacks
    }),
    StarterKit.configure({
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      link: false,
      strike: false
    }),
    WysiwygInlineCode,
    WysiwygHardBreak,
    Link.configure({
      autolink: false,
      enableClickSelection: true,
      openOnClick: false
    }),
    Table.configure({
      renderWrapper: true,
      resizable: false
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList.configure({
      HTMLAttributes: { 'data-type': 'taskList' }
    }),
    TaskItem.configure({
      nested: false,
      HTMLAttributes: { 'data-type': 'taskItem' }
    }),
    WysiwygCodeBlock.configure({
      callbacks: specialBlockCallbacks
    }),
    WysiwygSpecialFencedBlock.configure({
      callbacks: specialBlockCallbacks
    }),
    WysiwygHtmlFallbackBlock.configure({
      callbacks: specialBlockCallbacks
    }),
    Markdown.configure({
      indentation: {
        style: 'space',
        size: 2
      }
    })
  ]
}

export function createTransientWysiwygEditor(markdown: string) {
  const bridge = createWysiwygMarkdownBridge()

  return new Editor({
    element: document.createElement('div'),
    extensions: bridge.extensions,
    content: bridge.fromMarkdown(markdown)
  })
}

function normalizeDirectiveEndingBoundaries(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  let lastContentLineIndex = lines.length - 1

  while (lastContentLineIndex >= 0 && lines[lastContentLineIndex]!.trim().length === 0) {
    lastContentLineIndex -= 1
  }

  if (lastContentLineIndex < 0) {
    return normalized
  }

  const lastContentLine = lines[lastContentLineIndex]!

  if (!isWrappedDirectiveEndingLine(lastContentLine)) {
    return normalized
  }

  lines[lastContentLineIndex] = ':::'

  if (lastContentLineIndex > 0 && lines[lastContentLineIndex - 1]!.trim().length > 0) {
    lines.splice(lastContentLineIndex, 0, '')
  }

  return lines.join('\n')
}

function isWrappedDirectiveEndingLine(line: string) {
  return /^[ \t]*(?:(?:>\s*)|(?:(?:[-+*]|\d+[.)])\s+))+:::\s*$/.test(line)
}

function preserveExtraBlankLinesForWysiwyg(markdown: string): {
  markdown: string
  placeholder: string | null
} {
  const lines = markdown.split('\n')
  const placeholder = createBlankParagraphPlaceholder(markdown)
  const output: string[] = []
  let blankLineCount = 0
  let fenceMarker: '```' | '~~~' | null = null
  let insertedPlaceholder = false

  const flushBlankLines = (nextLineHasContent: boolean) => {
    if (blankLineCount === 0) {
      return
    }

    if (fenceMarker !== null || output.length === 0 || !nextLineHasContent) {
      for (let index = 0; index < blankLineCount; index += 1) {
        output.push('')
      }
      blankLineCount = 0
      return
    }

    output.push('')

    const extraParagraphCount = Math.ceil((blankLineCount - 1) / 2)

    for (let index = 0; index < extraParagraphCount; index += 1) {
      output.push(placeholder)
      output.push('')
      insertedPlaceholder = true
    }

    blankLineCount = 0
  }

  for (const line of lines) {
    const fenceToken = readFenceToken(line)

    if (fenceToken !== null) {
      flushBlankLines(true)
      fenceMarker = fenceMarker === fenceToken ? null : fenceToken
      output.push(line)
      continue
    }

    if (line.trim().length === 0) {
      blankLineCount += 1
      continue
    }

    flushBlankLines(true)
    output.push(line)
  }

  flushBlankLines(false)

  return {
    markdown: output.join('\n'),
    placeholder: insertedPlaceholder ? placeholder : null
  }
}

function createBlankParagraphPlaceholder(markdown: string) {
  const basePlaceholder = 'BOARDMARKEMPTYPARAGRAPHTOKEN'
  let placeholder = basePlaceholder
  let suffix = 1

  while (markdown.includes(placeholder)) {
    placeholder = `${basePlaceholder}_${suffix}`
    suffix += 1
  }

  return placeholder
}

function normalizeBlankPlaceholderParagraphsInContent(
  content: JSONContent,
  placeholder: string | null
): JSONContent {
  if (placeholder === null) {
    return content
  }

  return normalizeBlankPlaceholderParagraphInNode(content, placeholder)
}

function normalizeBlankPlaceholderParagraphInNode(
  node: JSONContent,
  placeholder: string
): JSONContent {
  if (isBlankPlaceholderParagraph(node, placeholder)) {
    return {
      ...node,
      content: undefined
    }
  }

  if (!node.content) {
    return node
  }

  return {
    ...node,
    content: node.content.map((child) =>
      normalizeBlankPlaceholderParagraphInNode(child, placeholder)
    )
  }
}

function isBlankPlaceholderParagraph(node: JSONContent, placeholder: string) {
  if (node.type !== 'paragraph' || node.content?.length !== 1) {
    return false
  }

  const [child] = node.content

  return child?.type === 'text' && child.text === placeholder && !child.marks?.length
}

function normalizeSoftLineBreaksInContent(content: JSONContent): JSONContent {
  return {
    ...content,
    content: normalizeSoftLineBreaksInNodes(content.content)
  }
}

function normalizeInlineMarkOrderInContent(content: JSONContent): JSONContent {
  return normalizeInlineMarkOrderInNode(content)
}

function normalizeInlineMarkOrderInNode(node: JSONContent): JSONContent {
  return {
    ...node,
    content: normalizeInlineMarkOrderInNodes(node.content),
    marks: normalizeInlineMarkOrderInMarks(node.marks)
  }
}

function normalizeInlineMarkOrderInNodes(
  nodes: JSONContent[] | undefined
): JSONContent[] | undefined {
  if (!nodes) {
    return nodes
  }

  return nodes.map((node) => normalizeInlineMarkOrderInNode(node))
}

function normalizeInlineMarkOrderInMarks(
  marks: JSONContent['marks']
): JSONContent['marks'] {
  if (!marks || marks.length < 2) {
    return marks
  }

  return [...marks].sort((left, right) => {
    if (left.type === 'code' && right.type !== 'code') {
      return -1
    }

    if (left.type !== 'code' && right.type === 'code') {
      return 1
    }

    return 0
  })
}

function normalizeSoftLineBreaksInNodes(
  nodes: JSONContent[] | undefined
): JSONContent[] | undefined {
  if (!nodes) {
    return nodes
  }

  const normalizedNodes: JSONContent[] = []

  for (const node of nodes) {
    const expandedNode = expandSoftLineBreaksInNode(node)

    if (Array.isArray(expandedNode)) {
      normalizedNodes.push(...expandedNode)
      continue
    }

    normalizedNodes.push(expandedNode)
  }

  return normalizedNodes
}

function expandSoftLineBreaksInNode(node: JSONContent): JSONContent | JSONContent[] {
  if (node.type === 'text' && typeof node.text === 'string' && node.text.includes('\n')) {
    return splitTextNodeOnSoftLineBreaks(node)
  }

  if (!node.content) {
    return node
  }

  return {
    ...node,
    content: normalizeSoftLineBreaksInNodes(node.content)
  }
}

function splitTextNodeOnSoftLineBreaks(node: JSONContent): JSONContent[] {
  const text = typeof node.text === 'string' ? node.text : ''
  const segments = text.split('\n')
  const normalizedNodes: JSONContent[] = []

  segments.forEach((segment, index) => {
    if (segment.length > 0) {
      normalizedNodes.push({
        ...node,
        text: segment
      })
    }

    if (index < segments.length - 1) {
      normalizedNodes.push({
        type: 'hardBreak'
      })
    }
  })

  return normalizedNodes
}

const WysiwygCodeBlock = Node.create({
  name: 'wysiwygCodeBlock',
  group: 'block',
  atom: true,
  code: true,
  selectable: true,
  isolating: true,
  defining: true,
  addOptions() {
    return {
      callbacks: {} as WysiwygMarkdownBridgeCallbacks
    }
  },
  addAttributes() {
    return {
      openingFence: {
        default: '```'
      },
      source: {
        default: ''
      },
      closingFence: {
        default: '```'
      }
    }
  },
  parseHTML() {
    return [{ tag: `[${CODE_BLOCK_DATA_ATTRIBUTE}]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [CODE_BLOCK_DATA_ATTRIBUTE]: '' })]
  },
  markdownTokenName: 'code',
  parseMarkdown(token, helpers) {
    const codeToken = token as MarkdownCodeToken

    if (codeToken.lang === 'mermaid' || codeToken.lang === 'sandpack') {
      return []
    }

    return helpers.createNode('wysiwygCodeBlock', {
      openingFence: `\`\`\`${codeToken.lang ?? ''}`,
      source: codeToken.text ?? '',
      closingFence: '```'
    })
  },
  renderMarkdown(node) {
    return `${buildRawFencedMarkdown({
      openingFence: String(node.attrs?.openingFence ?? '```'),
      source: String(node.attrs?.source ?? ''),
      closingFence: String(node.attrs?.closingFence ?? '```')
    })}\n`
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null
          }

          const { selection } = newState
          const { $from, empty } = selection

          if (!empty || $from.parent.type.name !== 'paragraph') {
            return null
          }

          const language = readOpeningCodeFenceLanguage($from.parent.textContent)

          if (language === null || $from.parentOffset !== $from.parent.content.size) {
            return null
          }

          const insertPosition = $from.before()
          const specialNodeType = newState.schema.nodes.wysiwygSpecialFencedBlock
          const replacementNode = language === 'mermaid' || language === 'sandpack'
            ? specialNodeType?.create({
                kind: language,
                source: ''
              })
            : this.type.create({
                openingFence: `\`\`\`${language}`,
                source: '',
                closingFence: '```'
              })

          if (!replacementNode) {
            return null
          }

          const transaction = newState.tr.replaceRangeWith(
            insertPosition,
            $from.after(),
            replacementNode
          )
          transaction.setSelection(NodeSelection.create(transaction.doc, insertPosition))
          requestPendingSourceEntry(transaction, insertPosition)
          return transaction
        }
      })
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => (
      <CodeBlockNodeView
        {...props}
        callbacks={this.options.callbacks}
      />
    ))
  }
})

const WysiwygSpecialFencedBlock = Node.create({
  name: 'wysiwygSpecialFencedBlock',
  group: 'block',
  atom: true,
  selectable: true,
  isolating: true,
  defining: true,
  addOptions() {
    return {
      callbacks: {} as WysiwygMarkdownBridgeCallbacks
    }
  },
  addAttributes() {
    return {
      kind: {
        default: 'mermaid'
      },
      source: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [{ tag: `[${SPECIAL_BLOCK_DATA_ATTRIBUTE}]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [SPECIAL_BLOCK_DATA_ATTRIBUTE]: '' })]
  },
  markdownTokenName: 'code',
  parseMarkdown(token, helpers) {
    const codeToken = token as MarkdownCodeToken

    if (codeToken.lang !== 'mermaid' && codeToken.lang !== 'sandpack') {
      return []
    }

    return helpers.createNode('wysiwygSpecialFencedBlock', {
      kind: codeToken.lang,
      source: codeToken.text ?? ''
    })
  },
  renderMarkdown(node) {
    return buildFencedMarkdown(node.attrs?.kind ?? 'mermaid', node.attrs?.source ?? '')
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state
        const { $from, empty } = selection

        if (!empty || $from.parent.type.name !== 'paragraph') {
          return false
        }

        const kind = readOpeningCodeFenceLanguage($from.parent.textContent)

        if ((kind !== 'mermaid' && kind !== 'sandpack') || $from.parentOffset !== $from.parent.content.size) {
          return false
        }

        const insertPosition = $from.before()

        return this.editor.commands.command(({ tr }) => {
          tr.replaceRangeWith(
            insertPosition,
            $from.after(),
            this.type.create({
              kind,
              source: ''
            })
          )
          tr.setSelection(NodeSelection.create(tr.doc, insertPosition))
          requestPendingSourceEntry(tr, insertPosition)
          return true
        })
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => (
      <SpecialFencedBlockView
        {...props}
        callbacks={this.options.callbacks}
      />
    ))
  }
})

const WysiwygHtmlFallbackBlock = Node.create({
  name: 'wysiwygHtmlFallbackBlock',
  group: 'block',
  atom: true,
  selectable: true,
  isolating: true,
  defining: true,
  addOptions() {
    return {
      callbacks: {} as WysiwygMarkdownBridgeCallbacks
    }
  },
  addAttributes() {
    return {
      kind: {
        default: 'html'
      },
      raw: {
        default: ''
      }
    }
  },
  parseHTML() {
    return [{ tag: `[${HTML_BLOCK_DATA_ATTRIBUTE}]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [HTML_BLOCK_DATA_ATTRIBUTE]: '' })]
  },
  markdownTokenName: 'html',
  parseMarkdown(token, helpers) {
    const htmlToken = token as MarkdownHtmlToken
    const raw = htmlToken.raw ?? htmlToken.text

    if (!raw || !raw.trim()) {
      return []
    }

    return helpers.createNode('wysiwygHtmlFallbackBlock', {
      kind: 'html',
      raw
    })
  },
  renderMarkdown(node) {
    return ensureTrailingNewline(node.attrs?.raw ?? '')
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => (
      <HtmlFallbackBlockView
        {...props}
        callbacks={this.options.callbacks}
      />
    ))
  }
})
