import { Editor, type AnyExtension, type JSONContent } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import {
  WysiwygCodeBlock,
  WysiwygHtmlFallbackBlock,
  WysiwygSpecialFencedBlock
} from './wysiwyg-phase0-extensions'

export type WysiwygPhase0MarkdownBridge = {
  fromMarkdown: (markdown: string) => JSONContent
  toMarkdown: (content: JSONContent) => string
  roundTrip: (markdown: string) => string
  extensions: AnyExtension[]
}

export function createWysiwygPhase0MarkdownBridge(): WysiwygPhase0MarkdownBridge {
  const extensions = createWysiwygPhase0Extensions()
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

export function createWysiwygPhase0Extensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false
    }),
    Link.configure({
      autolink: false,
      openOnClick: false,
      enableClickSelection: true
    }),
    Table.configure({
      renderWrapper: true,
      resizable: false
    }),
    TableRow,
    TableHeader,
    TableCell,
    WysiwygCodeBlock,
    WysiwygSpecialFencedBlock,
    WysiwygHtmlFallbackBlock,
    Markdown.configure({
      indentation: {
        style: 'space',
        size: 2
      }
    })
  ]
}

export function createTransientWysiwygPhase0Editor(markdown: string) {
  return new Editor({
    element: document.createElement('div'),
    extensions: createWysiwygPhase0Extensions(),
    content: markdown,
    contentType: 'markdown'
  })
}
