import { watch, type FSWatcher } from 'node:fs'
import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import { createDocumentService } from './document-service'

const logger = pino({
  name: 'boardmark-main',
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
})

const documentService = createDocumentService()

const IPC_CHANNELS = {
  pickOpenLocator: 'boardmark/document/pick-open-locator',
  pickSaveLocator: 'boardmark/document/pick-save-locator',
  readDocument: 'boardmark/document/read',
  readDocumentSource: 'boardmark/document/read-source',
  saveDocument: 'boardmark/document/save',
  subscribeExternalChanges: 'boardmark/document/subscribe-external-changes',
  unsubscribeExternalChanges: 'boardmark/document/unsubscribe-external-changes',
  externalChanged: 'boardmark/document/external-changed'
} as const

let mainWindow: BrowserWindow | null = null
let subscriptionSequence = 0
const externalWatchers = new Map<
  string,
  {
    watcher: FSWatcher
    path: string
  }
>()

async function createMainWindow() {
  const preloadPath =
    process.env.VITE_ELECTRON_PRELOAD ?? fileURLToPath(new URL('./index.mjs', import.meta.url))

  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    backgroundColor: '#f8f9fa',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  })

  mainWindow = window

  window.once('ready-to-show', () => window.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    await window.loadFile('dist/index.html')
  }

  logger.info({ preloadPath }, 'Desktop window created.')
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.pickOpenLocator, async () => {
    if (!mainWindow) {
      logger.error('Main window missing during pick-open-locator request.')
      return {
        ok: false,
        error: {
          code: 'open-failed',
          message: 'Main window is not ready.'
        }
      }
    }

    return documentService.pickOpenLocator(mainWindow)
  })

  ipcMain.handle(IPC_CHANNELS.pickSaveLocator, async (_event, defaultName?: string) => {
    if (!mainWindow) {
      logger.error('Main window missing during pick-save-locator request.')
      return {
        ok: false,
        error: {
          code: 'save-failed',
          message: 'Main window is not ready.'
        }
      }
    }

    return documentService.pickSaveLocator(mainWindow, defaultName)
  })

  ipcMain.handle(IPC_CHANNELS.readDocument, async (_event, locator) =>
    documentService.readDocument(locator)
  )

  ipcMain.handle(IPC_CHANNELS.readDocumentSource, async (_event, input) =>
    documentService.readDocumentSource(input)
  )

  ipcMain.handle(IPC_CHANNELS.saveDocument, async (_event, input) =>
    documentService.saveDocument(input)
  )

  ipcMain.handle(IPC_CHANNELS.subscribeExternalChanges, async (_event, path: string) => {
    const subscriptionId = `external-${subscriptionSequence}`
    subscriptionSequence += 1

    const watcher = watch(path, async (eventType) => {
      if (!mainWindow || eventType !== 'change') {
        return
      }

      const readResult = await documentService.readDocument({
        kind: 'file',
        path
      })

      if (!readResult.ok) {
        return
      }

      mainWindow.webContents.send(
        `${IPC_CHANNELS.externalChanged}:${subscriptionId}`,
        readResult.value.source
      )
    })

    externalWatchers.set(subscriptionId, {
      watcher,
      path
    })

    return subscriptionId
  })

  ipcMain.handle(IPC_CHANNELS.unsubscribeExternalChanges, async (_event, subscriptionId: string) => {
    const subscription = externalWatchers.get(subscriptionId)

    if (!subscription) {
      return
    }

    subscription.watcher.close()
    externalWatchers.delete(subscriptionId)
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  for (const subscription of externalWatchers.values()) {
    subscription.watcher.close()
  }
  externalWatchers.clear()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
