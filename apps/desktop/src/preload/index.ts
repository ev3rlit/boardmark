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
import type {
  CanvasImageExportBridge,
  CanvasImageExportError,
  CanvasDocumentPersistenceBridge,
  CanvasImageAssetBridge,
  CanvasImageAssetError
} from '@boardmark/canvas-app'

const IPC_CHANNELS = {
  pickOpenLocator: 'boardmark/document/pick-open-locator',
  pickSaveLocator: 'boardmark/document/pick-save-locator',
  readDocument: 'boardmark/document/read',
  readDocumentSource: 'boardmark/document/read-source',
  saveDocument: 'boardmark/document/save',
  saveExportedImage: 'boardmark/image-export/save',
  importImageAsset: 'boardmark/image/import',
  resolveImageSource: 'boardmark/image/resolve',
  openImageSource: 'boardmark/image/open',
  revealImageSource: 'boardmark/image/reveal',
  subscribeExternalChanges: 'boardmark/document/subscribe-external-changes',
  unsubscribeExternalChanges: 'boardmark/document/unsubscribe-external-changes',
  externalChanged: 'boardmark/document/external-changed'
} as const

type DesktopDocumentBridge = BoardmarkDocumentBridge & {
  imageExports: CanvasImageExportBridge
  persistence: CanvasDocumentPersistenceBridge
  imageAssets: CanvasImageAssetBridge
}

const documentBridge: DesktopDocumentBridge = {
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
  },
  persistence: {
    async openDocument() {
      const locatorResult = await ipcRenderer.invoke(
        IPC_CHANNELS.pickOpenLocator
      ) as AsyncResult<CanvasDocumentLocator, CanvasDocumentPickerError>

      if (!locatorResult.ok) {
        return locatorResult
      }

      const readResult = await ipcRenderer.invoke(
        IPC_CHANNELS.readDocument,
        locatorResult.value
      ) as AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>

      if (!readResult.ok) {
        return {
          ok: false,
          error: {
            code: 'open-failed',
            message: readResult.error.message
          }
        }
      }

      return {
        ok: true,
        value: {
          locator: readResult.value.locator,
          fileHandle: null,
          source: readResult.value.source
        }
      }
    },
    async saveDocument(input) {
      const locator =
        input.locator.kind === 'file'
          ? input.locator
          : await ipcRenderer.invoke(
              IPC_CHANNELS.pickSaveLocator,
              input.defaultName
            ) as AsyncResult<CanvasFileDocumentLocator, CanvasDocumentPickerError>

      if ('ok' in locator && !locator.ok) {
        return locator
      }

      const nextLocator = 'kind' in locator ? locator : locator.value
      const saveResult = await ipcRenderer.invoke(
        IPC_CHANNELS.saveDocument,
        {
          locator: nextLocator,
          source: input.source,
          isTemplate: false
        } satisfies CanvasDocumentSaveInput
      ) as AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>

      if (!saveResult.ok) {
        return {
          ok: false,
          error: {
            code: 'save-failed',
            message: saveResult.error.message
          }
        }
      }

      return {
        ok: true,
        value: {
          locator: saveResult.value.locator,
          fileHandle: null,
          source: saveResult.value.source
        }
      }
    },
    async saveDocumentAs(input) {
      const locatorResult = await ipcRenderer.invoke(
        IPC_CHANNELS.pickSaveLocator,
        input.defaultName
      ) as AsyncResult<CanvasFileDocumentLocator, CanvasDocumentPickerError>

      if (!locatorResult.ok) {
        return locatorResult
      }

      const saveResult = await ipcRenderer.invoke(
        IPC_CHANNELS.saveDocument,
        {
          locator: locatorResult.value,
          source: input.source,
          isTemplate: false
        } satisfies CanvasDocumentSaveInput
      ) as AsyncResult<CanvasDocumentRecord, CanvasDocumentRepositoryError>

      if (!saveResult.ok) {
        return {
          ok: false,
          error: {
            code: 'save-failed',
            message: saveResult.error.message
          }
        }
      }

      return {
        ok: true,
        value: {
          locator: saveResult.value.locator,
          fileHandle: null,
          source: saveResult.value.source
        }
      }
    },
    async subscribeExternalChanges({ locator, onExternalChange }) {
      if (locator.kind !== 'file') {
        return () => {}
      }

      const subscriptionId = await ipcRenderer.invoke(
        IPC_CHANNELS.subscribeExternalChanges,
        locator.path
      ) as string
      const eventName = `${IPC_CHANNELS.externalChanged}:${subscriptionId}`
      const listener = (_event: Electron.IpcRendererEvent, nextSource: string) => {
        onExternalChange(nextSource)
      }

      ipcRenderer.on(eventName, listener)

      return () => {
        ipcRenderer.removeListener(eventName, listener)
        void ipcRenderer.invoke(IPC_CHANNELS.unsubscribeExternalChanges, subscriptionId)
      }
    }
  },
  imageExports: {
    saveImage(input) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.saveExportedImage,
        input
      ) as Promise<AsyncResult<void, CanvasImageExportError>>
    }
  },
  imageAssets: {
    importImageAsset(input) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.importImageAsset,
        input
      ) as Promise<AsyncResult<{ src: string }, CanvasImageAssetError>>
    },
    resolveImageSource(input) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.resolveImageSource,
        {
          documentPath: input.document?.locator.kind === 'file' ? input.document.locator.path : '',
          src: input.src
        }
      ) as Promise<AsyncResult<{ src: string }, CanvasImageAssetError>>
    },
    openSource(input) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.openImageSource,
        {
          documentPath: input.document?.locator.kind === 'file' ? input.document.locator.path : '',
          src: input.src
        }
      ) as Promise<AsyncResult<void, CanvasImageAssetError>>
    },
    revealSource(input) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.revealImageSource,
        {
          documentPath: input.document?.locator.kind === 'file' ? input.document.locator.path : '',
          src: input.src
        }
      ) as Promise<AsyncResult<void, CanvasImageAssetError>>
    }
  }
}

contextBridge.exposeInMainWorld('boardmarkDocument', documentBridge)
