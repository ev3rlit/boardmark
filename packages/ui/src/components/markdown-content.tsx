import { type ComponentProps } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { MermaidDiagram } from './mermaid-diagram'

type MarkdownContentProps = {
  content: string
  className?: string
}

type MarkdownCodeProps = ComponentProps<'code'> & {
  node?: unknown
}

type MarkdownPreProps = ComponentProps<'pre'> & {
  node?: unknown
}

type MarkdownHastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: {
    className?: unknown
  }
  children?: MarkdownHastNode[]
}

const markdownComponents: Components = {
  table({ children }) {
    return (
      <div className="markdown-table-wrap">
        <table>{children}</table>
      </div>
    )
  },
  pre({ children, node, ...props }: MarkdownPreProps) {
    const mermaidSource = readMermaidSourceFromNode(node)

    if (mermaidSource) {
      return <MermaidDiagram source={mermaidSource} />
    }

    return <pre {...props}>{children}</pre>
  },
  code({ children, className, node: _node, ...props }: MarkdownCodeProps) {
    return (
      <code
        className={className}
        {...props}
      >
        {children}
      </code>
    )
  }
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function readCodeLanguage(className?: string) {
  if (!className) {
    return null
  }

  for (const token of className.split(/\s+/)) {
    if (token.startsWith('language-')) {
      return token.slice('language-'.length)
    }
  }

  return null
}

function readMermaidSourceFromNode(node: unknown) {
  if (!isMarkdownHastElement(node) || node.tagName !== 'pre' || !node.children) {
    return null
  }

  const codeNode = node.children[0]

  if (!isMarkdownHastElement(codeNode) || codeNode.tagName !== 'code') {
    return null
  }

  if (readCodeLanguage(readMarkdownClassName(codeNode.properties?.className)) !== 'mermaid') {
    return null
  }

  return trimCodeBlockSource(readMarkdownNodeText(codeNode.children ?? []))
}

function trimCodeBlockSource(source: string) {
  return source.replace(/\r?\n$/, '')
}

function readMarkdownClassName(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string').join(' ')
  }

  return undefined
}

function readMarkdownNodeText(nodes: MarkdownHastNode[]): string {
  let text = ''

  for (const node of nodes) {
    if (node.type === 'text' && typeof node.value === 'string') {
      text += node.value
      continue
    }

    if (node.children) {
      text += readMarkdownNodeText(node.children)
    }
  }

  return text
}

function isMarkdownHastElement(node: unknown): node is MarkdownHastNode {
  if (!node || typeof node !== 'object') {
    return false
  }

  return 'type' in node
}
