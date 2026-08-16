import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

/**
 * Help ▸ User Guide / File Formats Reference — a plain, script-free viewer for
 * the pre-rendered HTML that scripts/build-docs.mjs generates from docs/*.md.
 * A separate window rather than swapping out the editor's own view, so the
 * font you're working on is never disturbed by opening documentation.
 */
const TITLES = {
  'user-guide': 'User Guide',
  'file-formats': 'File Formats Reference'
} as const

export type DocPage = keyof typeof TITLES

const openWindows = new Map<DocPage, BrowserWindow>()

export function openDocsWindow(page: DocPage): void {
  const existing = openWindows.get(page)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  const window = new BrowserWindow({
    width: 880,
    height: 780,
    minWidth: 480,
    minHeight: 360,
    show: false,
    backgroundColor: '#1b1c1f',
    title: `${TITLES[page]} — Font Editor`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // A full copy of the editor's own File/Edit/Font/... menu makes no sense on
  // a read-only viewer; the OS-level menu bar on macOS is unaffected by this.
  window.setMenu(null)

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => openWindows.delete(page))
  openWindows.set(page, window)

  // External links (there are none in these docs today, but if one is ever
  // added) should open in the OS browser rather than navigate this window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(`${devServerUrl}/docs/${page}.html`)
  } else {
    void window.loadFile(join(__dirname, `../renderer/docs/${page}.html`))
  }
}
