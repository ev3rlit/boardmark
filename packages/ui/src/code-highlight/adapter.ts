import { getCodeHighlighter } from './highlighter'
import {
  resolveCodeLanguage,
  type CodeLanguageId
} from './language-registry'
import {
  resolveCodeTheme,
  resolveShikiTheme,
  type CodeThemeId
} from './theme-registry'

export type HighlightedToken = {
  content: string
  color?: string
  fontStyle?: 'normal' | 'italic'
  fontWeight?: 'normal' | 'bold'
  textDecoration?: 'none' | 'underline'
}

export type HighlightedLine = {
  tokens: HighlightedToken[]
}

export type HighlightedCodeBlock =
  | {
      kind: 'highlighted'
      theme: CodeThemeId
      language: CodeLanguageId
      lines: HighlightedLine[]
    }
  | {
      kind: 'plain'
      theme: CodeThemeId
      lines: string[]
    }

export async function highlightCodeBlock(input: {
  code: string
  language?: string
  theme?: string
}): Promise<HighlightedCodeBlock> {
  const theme = resolveCodeTheme(input.theme)
  const resolvedLanguage = resolveCodeLanguage(input.language)

  if (resolvedLanguage.kind === 'plain') {
    return createPlainCodeBlock(input.code, theme)
  }

  const highlighter = await getCodeHighlighter()
  const tokenLines = highlighter.codeToTokensBase(input.code, {
    lang: resolvedLanguage.language,
    theme: resolveShikiTheme(theme)
  })

  return {
    kind: 'highlighted',
    theme,
    language: resolvedLanguage.language,
    lines: tokenLines.map((line) => ({
      tokens: line.map((token) => mapHighlightedToken(token))
    }))
  }
}

export function createPlainCodeBlock(
  code: string,
  theme: CodeThemeId = resolveCodeTheme()
): HighlightedCodeBlock {
  return {
    kind: 'plain',
    theme,
    lines: splitCodeLines(code)
  }
}

function splitCodeLines(code: string): string[] {
  if (code.length === 0) {
    return ['']
  }

  return code.split(/\r\n|\r|\n/)
}

function mapHighlightedToken(token: {
  color?: string
  content: string
  fontStyle?: number
}): HighlightedToken {
  const fontStyle = token.fontStyle ?? 0

  return {
    color: token.color,
    content: token.content,
    fontStyle: (fontStyle & 1) === 1 ? 'italic' : undefined,
    fontWeight: (fontStyle & 2) === 2 ? 'bold' : undefined,
    textDecoration: (fontStyle & 4) === 4 ? 'underline' : undefined
  }
}
