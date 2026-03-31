import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import defaultTemplateSource from '../../../../fixtures/default-template.canvas.md?raw'
import { createDocumentService } from './document-service'

const logger = pino({
  name: 'boardmark-main',
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
})

const documentService = createDocumentService(defaultTemplateSource)

const IPC_CHANNELS = {
  newFile: 'boardmark/document/new-file',
  openFile: 'boardmark/document/open-file',
  saveFile: 'boardmark/document/save-file'
} as const

let mainWindow: BrowserWindow | null = null

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
  ipcMain.handle(IPC_CHANNELS.newFile, async () => {
    if (!mainWindow) {
      logger.error('Main window missing during new-file request.')
      return {
        ok: false,
        error: {
          code: 'create-failed',
          message: 'Main window is not ready.'
        }
      }
    }

    return documentService.newFileFromTemplate(mainWindow)
  })

  ipcMain.handle(IPC_CHANNELS.openFile, async () => {
    if (!mainWindow) {
      logger.error('Main window missing during open-file request.')
      return {
        ok: false,
        error: {
          code: 'open-failed',
          message: 'Main window is not ready.'
        }
      }
    }

    return documentService.openFile(mainWindow)
  })

  ipcMain.handle(IPC_CHANNELS.saveFile, async (_event, input) => {
    if (!mainWindow) {
      logger.error('Main window missing during save-file request.')
      return {
        ok: false,
        error: {
          code: 'save-failed',
          message: 'Main window is not ready.'
        }
      }
    }

    return documentService.saveFile(mainWindow, input)
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
