import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * A live Claude Code process can hold the old credential in memory and write it
 * back on exit, silently undoing a switch. Callers warn before proceeding.
 */
export async function claudeCodeRunning(): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('tasklist.exe', ['/FI', 'IMAGENAME eq claude.exe', '/NH'], {
        windowsHide: true
      })
      return stdout.toLowerCase().includes('claude.exe')
    }
    const { stdout } = await run('pgrep', ['-x', 'claude'])
    return stdout.trim().length > 0
  } catch {
    // pgrep exits non-zero when nothing matches.
    return false
  }
}
