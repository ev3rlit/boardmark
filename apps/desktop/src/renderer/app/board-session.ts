import type { CanvasDocumentRepositoryGateway } from '@boardmark/canvas-repository'
import type {
  BoardFileBridge,
  BoardRecord
} from '../../../../../packages/canvas-repository/src/board-file-contract'
import { readBoardScene } from '../../../../../packages/canvas-repository/src/board-scene'
import { parseBoard } from '../../../../../packages/canvas-domain/src/board-file'
import { createCanvasStore } from '@boardmark/canvas-app/store/canvas-store'
import { createCanvasDocumentState } from '@boardmark/canvas-app/document/canvas-document-state'
import { createCanvasDocumentRecordPatch } from '@boardmark/canvas-app/store/canvas-store-projection'
import { createCanvasDocumentSlice } from '@boardmark/canvas-app/store/canvas-store-slices'
import { createBoardEditingService } from '@boardmark/canvas-app/services/board-editing-service'
import type { CanvasDocumentService } from '@boardmark/canvas-app/services/canvas-document-service'

export function createBoardSession(bridge: BoardFileBridge) {
  const repository: CanvasDocumentRepositoryGateway = {
    async readSource(input) {
      const parsed = readBoardScene(input)
      return parsed.ok
        ? parsed
        : { ok: false, error: { kind: 'parse-failed', message: parsed.error.message } }
    },
    async read() {
      return {
        ok: false,
        error: { kind: 'read-failed', message: '프로젝트에서 보드 파일을 여세요.' }
      }
    },
    async save() {
      return {
        ok: false,
        error: { kind: 'write-failed', message: '보드 파일 저장 서비스를 사용하세요.' }
      }
    }
  }
  const documentService: CanvasDocumentService = {
    async hydrateTemplate() {
      return { status: 'cancelled', phase: 'load' }
    },
    async openDocument() {
      return { status: 'cancelled', phase: 'load' }
    },
    async openDroppedDocument() {
      return { status: 'error', phase: 'load', message: '.boardmark 파일은 프로젝트에서 여세요.' }
    },
    async subscribeExternalChanges() {
      return () => {}
    },
    async saveCurrentDocument({ document, documentState }) {
      if (!document || document.locator.kind !== 'file' || !documentState?.persistedSnapshotSource)
        return { status: 'error', phase: 'save', message: '먼저 보드 파일을 만드세요.' }
      const parsed = parseBoard(documentState.currentSource)
      if (!parsed.ok) return { status: 'error', phase: 'save', message: parsed.error.message }
      const result = await bridge.saveBoard({
        path: document.locator.path,
        board: parsed.value,
        expectedSource: documentState.persistedSnapshotSource
      })
      if (!result.ok)
        return {
          status: 'error',
          phase: 'save',
          message: `[${result.error.code}] ${result.error.message}`
        }
      const scene = readBoardScene({
        locator: document.locator,
        source: result.value.source,
        isTemplate: false
      })
      if (!scene.ok) return { status: 'error', phase: 'save', message: scene.error.message }
      return {
        status: 'saved',
        record: scene.value,
        path: result.value.path,
        savedAt: Date.now(),
        documentState: createCanvasDocumentState({
          record: scene.value,
          isPersisted: true,
          persistedSnapshotSource: result.value.source
        })
      }
    }
  }
  const store = createCanvasStore({
    documentRepository: repository,
    documentService,
    editingService: createBoardEditingService(),
    templateSource: '',
    documentPicker: {
      async pickOpenLocator() {
        return { ok: false, error: { code: 'cancelled', message: '프로젝트에서 보드를 여세요.' } }
      },
      async pickSaveLocator() {
        return { ok: false, error: { code: 'cancelled', message: '새 보드 위치를 선택하세요.' } }
      }
    },
    imageAssetBridge: {
      async referenceImageFile({ document, file }) {
        if (document.locator.kind !== 'file')
          return { ok: false, error: { code: 'import-failed', message: '먼저 보드를 저장하세요.' } }
        const result = await bridge.referenceImageFile(document.locator.path, file)
        return result.ok
          ? { ok: true, value: { src: result.value.path } }
          : { ok: false, error: { code: 'import-failed', message: result.error.message } }
      },
      async importImageAsset() {
        return {
          ok: false,
          error: {
            code: 'unsupported',
            message: '파일 보드는 이미지 원본을 참조합니다. 이미지 파일을 선택하세요.'
          }
        }
      },
      async resolveImageSource({ document, src }) {
        if (document?.locator.kind !== 'file')
          return {
            ok: false,
            error: { code: 'resolve-failed', message: '보드 파일을 먼저 여세요.' }
          }
        const result = await bridge.resolveImage(document.locator.path, src)
        return result.ok
          ? result
          : { ok: false, error: { code: 'resolve-failed', message: result.error.message } }
      },
      async openSource(input) {
        return window.boardmarkDocument.imageAssets.openSource(input)
      },
      async revealSource(input) {
        const reveal = window.boardmarkDocument.imageAssets.revealSource
        return reveal
          ? reveal(input)
          : {
              ok: false,
              error: { code: 'unsupported', message: '파일 위치 표시를 사용할 수 없습니다.' }
            }
      }
    }
  })
  return {
    store,
    clear() {
      store.setState({
        ...createCanvasDocumentSlice(),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedGroupIds: [],
        editingState: { status: 'idle' },
        history: { past: [], future: [] }
      })
    },
    install(record: BoardRecord) {
      const scene = readBoardScene({
        locator: { kind: 'file', path: record.path },
        source: record.source,
        isTemplate: false
      })
      if (!scene.ok) throw new Error(scene.error.message)
      store.setState(createCanvasDocumentRecordPatch(scene.value))
    }
  }
}
