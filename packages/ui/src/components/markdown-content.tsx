import { Suspense, type ComponentProps } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { extractFencedBlock } from './fenced-block/extract'
import { getFencedBlockRenderer } from './fenced-block/registry'

type MarkdownContentProps = {
  content: string
  className?: string
}

type MarkdownPreProps = ComponentProps<'pre'> & {
  node?: unknown
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
    const block = extractFencedBlock(node)

    if (block) {
      const Renderer = getFencedBlockRenderer(block.language)

      if (Renderer) {
        return (
          <Suspense fallback={null}>
            <Renderer source={block.source} />
          </Suspense>
        )
      }
    }

    return <pre {...props}>{children}</pre>
  },
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
