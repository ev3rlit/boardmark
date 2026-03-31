import type { DocumentGateway } from '@boardmark/canvas-domain'

declare global {
  interface Window {
    boardmarkDocument: DocumentGateway
  }
}

export {}
