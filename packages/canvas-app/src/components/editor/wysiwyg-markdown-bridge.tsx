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
const HTML_BREAK_SENTINEL = 'BOARDMARKHTMLBREAKTOKEN'
const EMPTY_PARAGRAPH_MARKDOWN = '&nbsp;'
const NBSP_CHAR = '\u00A0'
const WysiwygInlineCode = Code.extend({
  priority: 90,
  excludes: ''
})
const WysiwygParagraph = Node.create({
  name: 'paragraph',
  priority: 1000,
  group: 'block',
  content: 'inline*',
  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },
  parseHTML() {
    return [{ tag: 'p' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
  parseMarkdown(token, helpers) {
    const paragraphToken = token as { tokens?: Array<Record<string, unknown>> }
    const tokens = paragraphToken.tokens ?? []

    if (tokens.length === 1 && tokens[0]?.type === 'image') {
      return helpers.parseChildren([tokens[0]])
    }

    const content = helpers.parseInline(tokens)
    const hasExplicitEmptyParagraphMarker =
      tokens.length === 1
      && tokens[0]?.type === 'text'
      && (
        tokens[0]?.raw === EMPTY_PARAGRAPH_MARKDOWN
        || tokens[0]?.text === EMPTY_PARAGRAPH_MARKDOWN
        || tokens[0]?.raw === NBSP_CHAR
        || tokens[0]?.text === NBSP_CHAR
      )

    if (
      hasExplicitEmptyParagraphMarker
      && content.length === 1
      && content[0]?.type === 'text'
      && (content[0]?.text === EMPTY_PARAGRAPH_MARKDOWN || content[0]?.text === NBSP_CHAR)
    ) {
      return helpers.createNode('paragraph', undefined, [])
    }

    return helpers.createNode('paragraph', undefined, content)
  },
  renderMarkdown(node, helpers) {
    if (!node) {
      return ''
    }

    const content = Array.isArray(node.content) ? node.content : []

    if (content.length === 0) {
      return ''
    }

    return helpers.renderChildren(content)
  }
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
    return '<br>'
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
  isDocumentEqual: (left: JSONContent, right: JSONContent) => boolean
  readDocumentSnapshotKey: (content: JSONContent) => string
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
      return parseMarkdownForWysiwyg(manager, markdown)
    },
    isDocumentEqual(left, right) {
      return readWysiwygDocumentSnapshotKey(left) === readWysiwygDocumentSnapshotKey(right)
    },
    readDocumentSnapshotKey(content) {
      return readWysiwygDocumentSnapshotKey(content)
    },
    toMarkdown(content) {
      return serializeMarkdownForWysiwyg(manager, content)
    },
    roundTrip(markdown) {
      return serializeMarkdownForWysiwyg(
        manager,
        normalizeExplicitHardBreaksInContent(
          manager.parse(
            normalizeSoftHtmlBreaksForWysiwyg(
              normalizeDirectiveEndingBoundaries(markdown)
            )
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
      paragraph: false,
      strike: false
    }),
    WysiwygParagraph,
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

export function readWysiwygDocumentSnapshotKey(content: JSONContent) {
  return JSON.stringify(content)
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

function normalizeSoftHtmlBreaksForWysiwyg(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const output: string[] = []
  let fenceMarker: '```' | '~~~' | null = null

  for (const line of lines) {
    const fenceToken = readFenceToken(line)

    if (fenceToken !== null) {
      fenceMarker = fenceMarker === fenceToken ? null : fenceToken
      output.push(line)
      continue
    }

    if (fenceMarker !== null || !line.includes('<br')) {
      output.push(line)
      continue
    }

    const lineWithoutBreaks = line.replace(/<br\s*\/?>/gi, '')

    if (lineWithoutBreaks.includes('<') || lineWithoutBreaks.includes('>')) {
      output.push(line)
      continue
    }

    output.push(line.replace(/<br\s*\/?>/gi, HTML_BREAK_SENTINEL))
  }

  return output.join('\n')
}

function parseMarkdownForWysiwyg(manager: MarkdownManager, markdown: string) {
  const normalizedMarkdown = normalizeSoftHtmlBreaksForWysiwyg(
    normalizeDirectiveEndingBoundaries(markdown)
  )

  return normalizeLegacySoftLineBreaksInContent(
    normalizeExplicitHardBreaksInContent(
      manager.parse(normalizedMarkdown)
    )
  )
}

function serializeMarkdownForWysiwyg(manager: MarkdownManager, content: JSONContent) {
  return normalizeDirectiveEndingBoundaries(
    manager.serialize(
      normalizeEmptyParagraphsInContent(
        normalizeInlineMarkOrderInContent(content)
      )
    )
  )
}

function isWrappedDirectiveEndingLine(line: string) {
  return /^[ \t]*(?:(?:>\s*)|(?:(?:[-+*]|\d+[.)])\s+))+:::\s*$/.test(line)
}

function normalizeLegacySoftLineBreaksInContent(content: JSONContent): JSONContent {
  return {
    ...content,
    content: normalizeLegacySoftLineBreaksInNodes(content.content)
  }
}

function normalizeExplicitHardBreaksInContent(content: JSONContent): JSONContent {
  return {
    ...content,
    content: normalizeExplicitHardBreaksInNodes(content.content)
  }
}

function normalizeInlineMarkOrderInContent(content: JSONContent): JSONContent {
  return normalizeInlineMarkOrderInNode(content)
}

function normalizeEmptyParagraphsInContent(content: JSONContent): JSONContent {
  return {
    ...content,
    content: normalizeTopLevelEmptyParagraphs(content.content)
  }
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

function normalizeTopLevelEmptyParagraphs(
  nodes: JSONContent[] | undefined
): JSONContent[] | undefined {
  if (!nodes) {
    return nodes
  }

  const normalizedNodes = nodes.filter((node) => {
    if (node.type !== 'paragraph') {
      return true
    }

    return hasRenderableParagraphContent(node)
  })

  return normalizedNodes.length > 0 ? normalizedNodes : undefined
}

function hasRenderableParagraphContent(node: JSONContent) {
  return (node.content ?? []).some((child) => {
    if (child.type === 'hardBreak') {
      return true
    }

    return child.type !== 'text' || typeof child.text !== 'string' || child.text.length > 0
  })
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

function normalizeLegacySoftLineBreaksInNodes(
  nodes: JSONContent[] | undefined
): JSONContent[] | undefined {
  if (!nodes) {
    return nodes
  }

  const normalizedNodes: JSONContent[] = []

  for (const node of nodes) {
    const expandedNode = normalizeLegacySoftLineBreaksInNode(node)

    if (Array.isArray(expandedNode)) {
      normalizedNodes.push(...expandedNode)
      continue
    }

    normalizedNodes.push(expandedNode)
  }

  return normalizedNodes
}

function normalizeExplicitHardBreaksInNodes(
  nodes: JSONContent[] | undefined
): JSONContent[] | undefined {
  if (!nodes) {
    return nodes
  }

  const normalizedNodes: JSONContent[] = []

  for (const node of nodes) {
    const normalizedNode = normalizeExplicitHardBreaksInNode(node)

    if (Array.isArray(normalizedNode)) {
      normalizedNodes.push(...normalizedNode)
      continue
    }

    normalizedNodes.push(normalizedNode)
  }

  return normalizedNodes
}

function normalizeLegacySoftLineBreaksInNode(node: JSONContent): JSONContent | JSONContent[] {
  if (
    node.type === 'text'
    && typeof node.text === 'string'
    && node.text.includes('\n')
  ) {
    return [
      {
        ...node,
        text: node.text.replace(/\n/g, ' ')
      }
    ]
  }

  if (!node.content) {
    return node
  }

  return {
    ...node,
    content: normalizeLegacySoftLineBreaksInNodes(node.content)
  }
}

function normalizeExplicitHardBreaksInNode(node: JSONContent): JSONContent | JSONContent[] {
  if (
    node.type === 'text'
    && typeof node.text === 'string'
    && node.text.includes(HTML_BREAK_SENTINEL)
  ) {
    const segments = node.text.split(HTML_BREAK_SENTINEL)
    const normalizedNodes: JSONContent[] = []

    segments.forEach((segment, index) => {
      const normalizedSegment = segment.replace(/^\n/, '')

      if (normalizedSegment.length > 0) {
        normalizedNodes.push({
          ...node,
          text: normalizedSegment
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

  if (!node.content) {
    return node
  }

  return {
    ...node,
    content: normalizeExplicitHardBreaksInNodes(node.content)
  }
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
    return buildRawFencedMarkdown({
      openingFence: String(node.attrs?.openingFence ?? '```'),
      source: String(node.attrs?.source ?? ''),
      closingFence: String(node.attrs?.closingFence ?? '```')
    })
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
