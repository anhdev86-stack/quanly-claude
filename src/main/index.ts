import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { detect, captureAll, restoreAll } from './credentials'
import * as vault from './vault'
import { recentSessions } from './sessions'
import { report } from './usage'
import { claudeCodeRunning } from './running'
import type { Profile } from '../shared/types'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'Claude Account Switcher',
    backgroundColor: '#14120f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('vault:status', async () => ({
    encryptionAvailable: vault.isEncryptionAvailable(),
    detection: await detect(),
    claudeRunning: await claudeCodeRunning()
  }))

  ipcMain.handle('vault:list', () => vault.listProfiles())

  /** Snapshot whatever login is live right now and store it as a new profile. */
  ipcMain.handle('vault:captureCurrent', async (_e, label: string, note?: string): Promise<Profile> => {
    const { sources } = await detect()
    if (sources.length === 0) {
      throw new Error('No Claude Code login found on this machine. Log in first, then capture.')
    }
    const creds = await captureAll(sources)
    const profile = await vault.saveProfile(label, creds, note)
    await vault.markActive(profile.id)
    return profile
  })

  /**
   * Park the live login back into its own profile, then lay the target profile
   * down where Claude Code reads it. Parking first means an edit made while a
   * profile was active (a token refresh, say) is not silently thrown away.
   */
  ipcMain.handle('vault:switch', async (_e, targetId: string) => {
    const { activeProfileId } = await vault.listProfiles()

    if (activeProfileId && activeProfileId !== targetId) {
      const { sources } = await detect()
      if (sources.length > 0) {
        await vault.overwriteProfile(activeProfileId, await captureAll(sources))
      }
    }

    await restoreAll(await vault.readProfile(targetId))
    await vault.markActive(targetId)
    return vault.listProfiles()
  })

  ipcMain.handle('vault:rename', (_e, id: string, label: string, note?: string) =>
    vault.renameProfile(id, label, note)
  )

  ipcMain.handle('vault:remove', (_e, id: string) => vault.removeProfile(id))

  ipcMain.handle('sessions:recent', () => recentSessions())

  ipcMain.handle('usage:report', async () => report(await vault.switchHistory()))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
