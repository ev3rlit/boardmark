export type SandpackSourceFormat = 'json' | 'nested'

export type SandpackLayoutMode = 'preview' | 'code'

export type SandpackFile = {
  name: string
  code: string
  language: string
  active?: boolean
  hidden?: boolean
  readOnly?: boolean
}

export type SandpackDocument = {
  template: string
  files: SandpackFile[]
  dependencies?: Record<string, string>
  layout: SandpackLayoutMode
  readOnly: boolean
}

export type SandpackParseResult = {
  document: SandpackDocument
  format: SandpackSourceFormat
}

export function inferSandpackFileLanguage(path: string) {
  const normalizedPath = path.toLowerCase()

  if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.ts')) {
    return 'tsx'
  }

  if (normalizedPath.endsWith('.jsx') || normalizedPath.endsWith('.js')) {
    return 'jsx'
  }

  if (normalizedPath.endsWith('.css')) {
    return 'css'
  }

  if (normalizedPath.endsWith('.json')) {
    return 'json'
  }

  return 'text'
}
