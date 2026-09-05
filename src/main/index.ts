import { app, shell, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

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
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // IPC: Datei speichern
  ipcMain.handle('file:save', async (_event, data: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [
        { name: 'Abrichten Projekt', extensions: ['abrichten.json'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, data, 'utf-8')
    return filePath
  })

  // IPC: Datei laden
  ipcMain.handle('file:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [
        { name: 'Abrichten Projekt', extensions: ['abrichten.json', 'json'] }
      ],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    const content = await readFile(filePaths[0], 'utf-8')
    return { path: filePaths[0], content }
  })

  // IPC: CSV exportieren
  ipcMain.handle('file:export-csv', async (_event, csvData: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [
        { name: 'CSV', extensions: ['csv'] }
      ]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, csvData, 'utf-8')
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
