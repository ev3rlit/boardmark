const CODE_LANGUAGE_IDS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'html',
  'css',
  'scss',
  'markdown',
  'xml',
  'json',
  'jsonc',
  'yaml',
  'toml',
  'ini',
  'bash',
  'shellsession',
  'powershell',
  'diff',
  'sql',
  'graphql',
  'dockerfile'
] as const

const CODE_LANGUAGE_ALIAS_MAP: Record<string, CodeLanguageId> = {
  bash: 'bash',
  c: 'c',
  console: 'shellsession',
  cpp: 'cpp',
  css: 'css',
  diff: 'diff',
  dockerfile: 'dockerfile',
  go: 'go',
  graphql: 'graphql',
  html: 'html',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  jsx: 'jsx',
  kotlin: 'kotlin',
  markdown: 'markdown',
  md: 'markdown',
  patch: 'diff',
  powershell: 'powershell',
  python: 'python',
  rust: 'rust',
  scss: 'scss',
  sh: 'bash',
  shell: 'bash',
  shellsession: 'shellsession',
  sql: 'sql',
  swift: 'swift',
  terminal: 'shellsession',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash'
}

export type CodeLanguageId = (typeof CODE_LANGUAGE_IDS)[number]

export type ResolvedCodeLanguage =
  | { kind: 'highlighted'; language: CodeLanguageId }
  | { kind: 'plain' }

export const SHIKI_LANGUAGE_IDS = [...CODE_LANGUAGE_IDS]

export function resolveCodeLanguage(input?: string): ResolvedCodeLanguage {
  const normalized = input?.trim().toLowerCase()

  if (!normalized) {
    return { kind: 'plain' }
  }

  const language = CODE_LANGUAGE_ALIAS_MAP[normalized]

  if (!language) {
    return { kind: 'plain' }
  }

  return {
    kind: 'highlighted',
    language
  }
}
