import { createHighlighter } from 'shiki'
import { SHIKI_LANGUAGE_IDS } from './language-registry'
import { SHIKI_THEME_IDS } from './theme-registry'

type CodeHighlighter = Awaited<ReturnType<typeof createHighlighter>>

let highlighterPromise: Promise<CodeHighlighter> | null = null

export function getCodeHighlighter(): Promise<CodeHighlighter> {
  highlighterPromise ??= createHighlighter({
    langs: SHIKI_LANGUAGE_IDS,
    themes: SHIKI_THEME_IDS
  })

  return highlighterPromise
}
