import { contextBridge, ipcRenderer } from 'electron'
import type {
  AsyncResult,
  BoardmarkDocumentBridge,
  CanvasFileDocumentLocator,
  CanvasDocumentLocator,
  CanvasDocumentPickerError,
  CanvasDocumentRecord,
  CanvasDocumentRepositoryError,
  CanvasDocumentSaveInput,
  CanvasDocumentSourceInput
} from '../../../../packages/canvas-repository/src/index'

const IPC_CHANNELS = {
  pickOpenLocator: 'boardmark/document/pick-open-locator',
  pickSaveLocator: 'boardmark/document/pick-save-locator',
  readDocument: 'boardmark/document/read',
  readDocumentSource: 'boardmark/document/read-source',
  saveDocument: 'boardmark/document/save'
} as const

const documentBridge: BoardmarkDocumentBridge = {
  picker: {
    pickOpenLocator() {
      return ipcRenderer.invoke(
        IPC_CHANNELS.pickOpenLocator
      ) as Promise<AsyncResult<CanvasDocumentLocator, CanvasDocumentPickerError>>
    },
    pickSaveLocator(defaultName) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.pickSaveLocator,
        defaultName
      ) as Promise<AsyncResult<CanvasFileDocumentLocator, CanvasDocumentPickerError>>
    }
  },
  repository: {
    read(locator) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.readDocument,
        locator
      ) as Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
    },
    readSource(input: CanvasDocumentSourceInput) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.readDocumentSource,
        input
      ) as Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
    },
    save(input: CanvasDocumentSaveInput) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.saveDocument,
        input
      ) as Promise<AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>>
    }
  }
}

contextBridge.exposeInMainWorld('boardmarkDocument', documentBridge)
