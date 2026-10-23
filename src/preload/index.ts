import { contextBridge, ipcRenderer } from 'electron'
import type { DetectResult, Profile, SessionRef, UsageReport } from '../shared/types'

const api = {
  status: (): Promise<{
    encryptionAvailable: boolean
    detection: DetectResult
    claudeRunning: boolean
  }> => ipcRenderer.invoke('vault:status'),
  list: (): Promise<{ profiles: Profile[]; activeProfileId?: string }> =>
    ipcRenderer.invoke('vault:list'),
  captureCurrent: (label: string, note?: string): Promise<Profile> =>
    ipcRenderer.invoke('vault:captureCurrent', label, note),
  switchTo: (id: string): Promise<{ profiles: Profile[]; activeProfileId?: string }> =>
    ipcRenderer.invoke('vault:switch', id),
  rename: (id: string, label: string, note?: string): Promise<void> =>
    ipcRenderer.invoke('vault:rename', id, label, note),
  remove: (id: string): Promise<void> => ipcRenderer.invoke('vault:remove', id),
  recentSessions: (): Promise<SessionRef[]> => ipcRenderer.invoke('sessions:recent'),
  usageReport: (): Promise<UsageReport> => ipcRenderer.invoke('usage:report')
}

contextBridge.exposeInMainWorld('switcher', api)

export type SwitcherApi = typeof api
