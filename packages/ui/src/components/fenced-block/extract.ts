type HastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: {
    className?: unknown
  }
  children?: HastNode[]
}

type FencedBlock = {
  language: string
  source: string
}

export function extractFencedBlock(node: unknown): FencedBlock | null {
  if (!isHastElement(node) || node.tagName !== 'pre' || !node.children) {
    return null
  }

  const codeNode = node.children[0]

  if (!isHastElement(codeNode) || codeNode.tagName !== 'code') {
    return null
  }

  const language = readCodeLanguage(readClassName(codeNode.properties?.className))

  if (!language) {
    return null
  }

  const source = trimTrailingNewline(readNodeText(codeNode.children ?? []))

  return { language, source }
}

function readCodeLanguage(className?: string): string | null {
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

function readClassName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string').join(' ')
  }

  return undefined
}

function readNodeText(nodes: HastNode[]): string {
  let text = ''

  for (const node of nodes) {
    if (node.type === 'text' && typeof node.value === 'string') {
      text += node.value
      continue
    }

    if (node.children) {
      text += readNodeText(node.children)
    }
  }

  return text
}

function trimTrailingNewline(source: string): string {
  return source.replace(/\r?\n$/, '')
}

function isHastElement(node: unknown): node is HastNode {
  return !!node && typeof node === 'object' && 'type' in node
}
