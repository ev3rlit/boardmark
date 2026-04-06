import { createContext, useContext, type ReactNode } from 'react'
import type { FencedBlockImageExportResult } from './image-export'

export type MarkdownContentImageExportOutcome =
  | { status: 'saved' }
  | { status: 'cancelled' }

export type MarkdownContentImageActions = {
  exportImage: (
    result: FencedBlockImageExportResult
  ) => Promise<MarkdownContentImageExportOutcome>
  copyImageToClipboard: (result: FencedBlockImageExportResult) => Promise<void>
  canCopyImageToClipboard: () => boolean
}

const markdownContentImageActionsContext =
  createContext<MarkdownContentImageActions | null>(null)

export function MarkdownContentImageActionsProvider({
  actions,
  children
}: {
  actions: MarkdownContentImageActions
  children: ReactNode
}) {
  return (
    <markdownContentImageActionsContext.Provider value={actions}>
      {children}
    </markdownContentImageActionsContext.Provider>
  )
}

export function useMarkdownContentImageActions() {
  return useContext(markdownContentImageActionsContext)
}
