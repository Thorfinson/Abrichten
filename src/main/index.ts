import { app, shell, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } from 'electron'
import { dirname, extname, join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { LastFile } from './lastFile'

/** URL schemes that links may hand to the operating system (system browser). */
const EXTERNAL_PROTOCOLS = new Set(['https:'])

function isAllowedExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

const withoutHash = (url: string): string => url.split('#')[0]

// Since Electron 43 the dialogs open in Downloads unless a defaultPath is
// given, so remember the folder of the last opened/saved file ourselves.
let lastDir: string | undefined
const inLastDir = (fileName: string): string => (lastDir ? join(lastDir, fileName) : fileName)

function createWindow(): void {
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'dark'

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Abrichten',
    backgroundColor: '#27272a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Electron's defaults, spelled out so they cannot silently change
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The app never opens windows of its own; https links go to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Never leave the app, e.g. when an HTML file is dropped onto the window.
  mainWindow.webContents.on('will-navigate', (event) => {
    if (withoutHash(event.url) !== withoutHash(mainWindow.webContents.getURL())) {
      event.preventDefault()
    }
  })

  // The renderer cancels beforeunload while the project has unsaved changes
  // (hooks/useUnsavedChanges.ts). Ask here. On "discard" the renderer first resets
  // its auto-save to the last saved version (else the next start would restore the
  // discarded edits), then the window is destroyed — destroy() skips beforeunload.
  mainWindow.webContents.on('will-prevent-unload', () => {
    const de = app.getLocale().toLowerCase().startsWith('de')
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: de ? ['Änderungen verwerfen und schließen', 'Abbrechen'] : ['Discard changes and close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Abrichten',
      message: de ? 'Das Projekt hat ungespeicherte Änderungen.' : 'The project has unsaved changes.',
      detail: de ? 'Beim Schließen gehen sie verloren.' : 'They will be lost when the window closes.'
    })
    if (choice !== 0) return
    mainWindow.webContents
      .executeJavaScript('window.__abrichtenDiscard?.()')
      .catch((err) => console.error('Discarding the auto-save failed:', err))
      .finally(() => mainWindow.destroy())
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // The project file last opened or saved: startup asks when it changed outside
  // the app since (lastFile.ts), and the dialogs start in its folder again.
  const lastFile = new LastFile(app.getPath('userData'))
  void lastFile.read().then((known) => { if (known && !lastDir) lastDir = dirname(known.path) })
  const remember = (path: string, content: string): Promise<void> =>
    lastFile.remember(path, content).catch((err) => console.error('Remembering the project file failed:', err))

  // IPC: Datei speichern
  ipcMain.handle('file:save', async (_event, data: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: inLastDir(defaultName),
      filters: [
        { name: 'Abrichten Projekt', extensions: ['abrichten.json'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, data, 'utf-8')
    lastDir = dirname(filePath)
    await remember(filePath, data)
    return filePath
  })

  // IPC: Datei laden
  ipcMain.handle('file:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      defaultPath: lastDir,
      filters: [
        { name: 'Abrichten Projekt', extensions: ['abrichten.json', 'json'] }
      ],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    const content = await readFile(filePaths[0], 'utf-8')
    lastDir = dirname(filePaths[0])
    await remember(filePaths[0], content)
    return { path: filePaths[0], content }
  })

  // IPC: the last opened/saved project file, if it changed outside the app since
  ipcMain.handle('file:lastChanged', () => lastFile.changed())
  // IPC: the user answered about that change; don't report this version again
  ipcMain.handle('file:lastSeen', () => lastFile.seen())

  // IPC: Export (CSV, DXF)
  ipcMain.handle('file:export', async (_event, content: string, defaultName: string) => {
    // CSV, DXF, …: the file type filter follows the suggested name's extension
    const ext = extname(defaultName).slice(1).toLowerCase() || 'txt'
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: inLastDir(defaultName),
      filters: [
        { name: ext.toUpperCase(), extensions: [ext] }
      ]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, content, 'utf-8')
    lastDir = dirname(filePath)
    return filePath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
