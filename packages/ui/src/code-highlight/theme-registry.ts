type ShikiThemeId =
  | 'dark-plus'
  | 'light-plus'
  | 'one-dark-pro'
  | 'one-light'
  | 'github-dark'

export type CodeThemeId =
  | 'vscode-dark-modern'
  | 'vscode-light'
  | 'one-dark'
  | 'one-light'
  | 'github-dark'

type CodeThemeRecord = {
  id: CodeThemeId
  shikiTheme: ShikiThemeId
}

const CODE_THEME_REGISTRY = [
  {
    id: 'vscode-dark-modern',
    shikiTheme: 'dark-plus'
  },
  {
    id: 'vscode-light',
    shikiTheme: 'light-plus'
  },
  {
    id: 'one-dark',
    shikiTheme: 'one-dark-pro'
  },
  {
    id: 'one-light',
    shikiTheme: 'one-light'
  },
  {
    id: 'github-dark',
    shikiTheme: 'github-dark'
  }
] as const satisfies readonly CodeThemeRecord[]

const CODE_THEME_ALIAS_MAP: Record<string, CodeThemeId> = {
  'dark-plus': 'vscode-dark-modern',
  'github-dark': 'github-dark',
  'light-plus': 'vscode-light',
  'one-dark': 'one-dark',
  'one-dark-pro': 'one-dark',
  'one-light': 'one-light',
  'vscode-dark-modern': 'vscode-dark-modern',
  'vscode-light': 'vscode-light'
}

const CODE_THEME_TO_SHIKI_MAP = new Map<CodeThemeId, ShikiThemeId>(
  CODE_THEME_REGISTRY.map((entry) => [entry.id, entry.shikiTheme])
)

export const DEFAULT_CODE_THEME_ID: CodeThemeId = 'vscode-dark-modern'

export const SHIKI_THEME_IDS = CODE_THEME_REGISTRY.map(
  (entry) => entry.shikiTheme
) as ShikiThemeId[]

export function resolveCodeTheme(input?: string): CodeThemeId {
  const normalized = input?.trim().toLowerCase()

  if (!normalized) {
    return DEFAULT_CODE_THEME_ID
  }

  return CODE_THEME_ALIAS_MAP[normalized] ?? DEFAULT_CODE_THEME_ID
}

export function resolveShikiTheme(theme: CodeThemeId): ShikiThemeId {
  return CODE_THEME_TO_SHIKI_MAP.get(theme) ?? 'dark-plus'
}
