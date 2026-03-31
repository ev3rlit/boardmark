import { contextBridge, ipcRenderer } from 'electron'
import type {
  AsyncResult,
  DocumentFile,
  DocumentGateway,
  DocumentGatewayError,
  SaveDocumentInput
} from '@boardmark/canvas-domain'

const IPC_CHANNELS = {
  newFile: 'boardmark/document/new-file',
  openFile: 'boardmark/document/open-file',
  saveFile: 'boardmark/document/save-file'
} as const

const documentGateway: DocumentGateway = {
  newFileFromTemplate() {
    return ipcRenderer.invoke(
      IPC_CHANNELS.newFile
    ) as Promise<AsyncResult<DocumentFile, DocumentGatewayError>>
  },
  openFile() {
    return ipcRenderer.invoke(
      IPC_CHANNELS.openFile
    ) as Promise<AsyncResult<DocumentFile, DocumentGatewayError>>
  },
  saveFile(input: SaveDocumentInput) {
    return ipcRenderer.invoke(
      IPC_CHANNELS.saveFile,
      input
    ) as Promise<AsyncResult<DocumentFile, DocumentGatewayError>>
  }
}

contextBridge.exposeInMainWorld('boardmarkDocument', documentGateway)
