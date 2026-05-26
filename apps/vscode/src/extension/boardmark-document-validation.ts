import {
  createCanvasMarkdownDocumentRepository,
  toAsyncResult
} from '@boardmark/canvas-repository'

const repository = createCanvasMarkdownDocumentRepository()

export type BoardmarkDocumentValidation =
  | { status: 'valid' }
  | { status: 'invalid'; message: string }

export function validateBoardmarkDocument(source: string, uri: string): BoardmarkDocumentValidation {
  const result = toAsyncResult(repository.readSource({
    locator: {
      kind: 'file',
      path: uri
    },
    source,
    isTemplate: false
  }))

  if (result.ok) {
    return { status: 'valid' }
  }

  return {
    status: 'invalid',
    message: `Boardmark Canvas 문서는 frontmatter에 type: canvas 와 version 숫자가 필요합니다. (${result.error.message})`
  }
}
