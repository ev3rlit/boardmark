import { Editor, Node, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { NodeSelection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { CanvasEditingBlockMode } from '@canvas-app/store/canvas-store-types'
import {
  buildFencedMarkdown,
  buildRawFencedMarkdown,
  ensureTrailingNewline
} from '@canvas-app/components/editor/wysiwyg-block-helpers'
import { CodeBlockNodeView } from '@canvas-app/components/editor/views/code-block-node-view'
import { HtmlFallbackBlockView } from '@canvas-app/components/editor/views/html-fallback-block-view'
import { SpecialFencedBlockView } from '@canvas-app/components/editor/views/special-fenced-block-view'
import { readOpeningCodeFenceLanguage } from '@canvas-app/markdown/fenced-block-guards'

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

type WysiwygMarkdownBridgeCallbacks = {
  onBlockModeChange?: (mode: CanvasEditingBlockMode) => void
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
      return manager.parse(normalizeDirectiveEndingBoundaries(markdown))
    },
    toMarkdown(content) {
      return normalizeDirectiveEndingBoundaries(manager.serialize(content))
    },
    roundTrip(markdown) {
      return normalizeDirectiveEndingBoundaries(
        manager.serialize(manager.parse(normalizeDirectiveEndingBoundaries(markdown)))
      )
    }
  }
}

export function createWysiwygExtensions(
  callbacks: WysiwygMarkdownBridgeCallbacks = {}
): AnyExtension[] {
  const specialBlockCallbacks = {
    onBlockModeChange: callbacks.onBlockModeChange
  }

  return [
    StarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false
    }),
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
    WysiwygCodeBlock,
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
  return new Editor({
    element: document.createElement('div'),
    extensions: createWysiwygExtensions(),
    content: normalizeDirectiveEndingBoundaries(markdown),
    contentType: 'markdown'
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

const WysiwygCodeBlock = Node.create({
  name: 'wysiwygCodeBlock',
  group: 'block',
  atom: true,
  code: true,
  selectable: true,
  isolating: true,
  defining: true,
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
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state
        const { $from, empty } = selection

        if (!empty || $from.parent.type.name !== 'paragraph') {
          return false
        }

        const language = readOpeningCodeFenceLanguage($from.parent.textContent)

        if (language === null || $from.parentOffset !== $from.parent.content.size) {
          return false
        }

        const insertPosition = $from.before()

        return this.editor.commands.command(({ tr }) => {
          tr.replaceRangeWith(
            insertPosition,
            $from.after(),
            this.type.create({
              openingFence: `\`\`\`${language}`,
              source: '',
              closingFence: '```'
            })
          )
          tr.setSelection(NodeSelection.create(tr.doc, insertPosition))
          return true
        })
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
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
