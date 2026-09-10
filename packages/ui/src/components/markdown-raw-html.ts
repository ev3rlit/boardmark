import rehypeRaw from 'rehype-raw'

type RawTransformer = ReturnType<typeof rehypeRaw>
type HtmlTree = Parameters<RawTransformer>[0]
type HtmlNode = HtmlTree | HtmlTree['children'][number]

// HTML reparsing retains source positions but drops Markdown fence metadata.
// Restore only metadata from original code nodes at the same source offset.
export function markdownRawHtml(): RawTransformer {
  const parseRaw = rehypeRaw()
  return (tree, file) => {
    const metadata = new Map<number, string>()
    visitCode(tree, node => {
      const offset = node.position?.start.offset
      if (offset !== undefined && node.data && 'meta' in node.data && typeof node.data.meta === 'string') {
        metadata.set(offset, node.data.meta)
      }
    })
    const parsed = parseRaw(tree, file)
    visitCode(parsed, node => {
      const offset = node.position?.start.offset
      const meta = offset === undefined ? undefined : metadata.get(offset)
      if (meta !== undefined) {
        node.data = { ...node.data, meta }
      }
    })
    return parsed
  }
}

function visitCode(node: HtmlNode, visit: (node: HtmlNode) => void) {
  if (node.type === 'element' && node.tagName === 'code') {
    visit(node)
  }
  if ('children' in node) {
    for (const child of node.children) {
      visitCode(child, visit)
    }
  }
}
