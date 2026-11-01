import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  fileSave: (data: string, defaultName: string) => Promise<string | null>
  fileOpen: () => Promise<{ path: string; content: string } | null>
  /** Save dialog for exports (CSV, DXF, …); the file filter follows defaultName's extension */
  fileExport: (content: string, defaultName: string) => Promise<string | null>
}

const api: ElectronAPI = {
  fileSave: (data, defaultName) => ipcRenderer.invoke('file:save', data, defaultName),
  fileOpen: () => ipcRenderer.invoke('file:open'),
  fileExport: (content, defaultName) => ipcRenderer.invoke('file:export', content, defaultName)
}

contextBridge.exposeInMainWorld('electronAPI', api)
