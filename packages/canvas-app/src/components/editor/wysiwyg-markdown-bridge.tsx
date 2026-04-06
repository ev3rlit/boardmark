import { Editor, Node, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { CanvasEditingBlockMode } from '@canvas-app/store/canvas-store-types'
import { buildFencedMarkdown, ensureTrailingNewline } from '@canvas-app/components/editor/wysiwyg-block-helpers'
import { CodeBlockNodeView } from '@canvas-app/components/editor/views/code-block-node-view'
import { HtmlFallbackBlockView } from '@canvas-app/components/editor/views/html-fallback-block-view'
import { SpecialFencedBlockView } from '@canvas-app/components/editor/views/special-fenced-block-view'

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
      return manager.parse(markdown)
    },
    toMarkdown(content) {
      return manager.serialize(content)
    },
    roundTrip(markdown) {
      return manager.serialize(manager.parse(markdown))
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
    content: markdown,
    contentType: 'markdown'
  })
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
      language: {
        default: ''
      },
      source: {
        default: ''
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
      language: codeToken.lang ?? '',
      source: codeToken.text ?? ''
    })
  },
  renderMarkdown(node) {
    return buildFencedMarkdown(node.attrs?.language ?? '', node.attrs?.source ?? '')
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
