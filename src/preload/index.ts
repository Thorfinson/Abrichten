import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  fileSave: (data: string, defaultName: string) => Promise<string | null>
  fileOpen: () => Promise<{ path: string; content: string } | null>
  fileExportCsv: (csvData: string, defaultName: string) => Promise<string | null>
}

const api: ElectronAPI = {
  fileSave: (data, defaultName) => ipcRenderer.invoke('file:save', data, defaultName),
  fileOpen: () => ipcRenderer.invoke('file:open'),
  fileExportCsv: (csvData, defaultName) => ipcRenderer.invoke('file:export-csv', csvData, defaultName)
}

contextBridge.exposeInMainWorld('electronAPI', api)
