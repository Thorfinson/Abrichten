import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  fileSave: (data: string, defaultName: string) => Promise<string | null>
  fileOpen: () => Promise<{ path: string; content: string } | null>
  /** Save dialog for exports (CSV, DXF, …); the file filter follows defaultName's extension */
  fileExport: (content: string, defaultName: string) => Promise<string | null>
  /** The project file last opened or saved, when it was changed outside the app since (null otherwise) */
  lastFileChanged: () => Promise<{ path: string; content: string; modifiedAt: number } | null>
  /** The user answered about that change (loaded or kept): it is not reported again */
  lastFileSeen: () => Promise<void>
}

const api: ElectronAPI = {
  fileSave: (data, defaultName) => ipcRenderer.invoke('file:save', data, defaultName),
  fileOpen: () => ipcRenderer.invoke('file:open'),
  fileExport: (content, defaultName) => ipcRenderer.invoke('file:export', content, defaultName),
  lastFileChanged: () => ipcRenderer.invoke('file:lastChanged'),
  lastFileSeen: () => ipcRenderer.invoke('file:lastSeen')
}

contextBridge.exposeInMainWorld('electronAPI', api)
