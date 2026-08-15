import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { buildMenu, pushViewState } from './menu'
import { registerIpc } from './ipc'

let mainWindow: BrowserWindow | null = null
/** Mirrored from the renderer so the close handler knows whether to prompt. */
let documentDirty = false
/** Set once the renderer has dealt with unsaved changes and really wants to close. */
let closeApproved = false

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#1b1c1f',
    title: 'Font Editor',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = window

  window.on('ready-to-show', () => window.show())

  // Seed the renderer with the menu's view preferences once it can receive them.
  window.webContents.on('did-finish-load', () => pushViewState(window))

  // Let the renderer offer to save before the window actually goes away.
  window.on('close', (event) => {
    if (documentDirty && !closeApproved) {
      event.preventDefault()
      window.webContents.send('menu:command', 'app:closeRequest')
    }
  })

  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const getWindow = (): BrowserWindow | null => mainWindow

void app.whenReady().then(() => {
  registerIpc({
    getWindow,
    setDirty: (value) => {
      documentDirty = value
    },
    approveClose: () => {
      closeApproved = true
    }
  })
  buildMenu(getWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
