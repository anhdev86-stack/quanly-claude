import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { readFile, writeFile, access, mkdir, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import * as wincred from './wincred'
import type { CredentialSource, CapturedCredential, DetectResult } from '../shared/types'

const run = promisify(execFile)

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

function fileCandidates(): string[] {
  const home = homedir()
  return [
    join(home, '.claude', '.credentials.json'),
    join(home, '.config', 'claude', '.credentials.json')
  ]
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function keychainReadable(account: string): Promise<boolean> {
  try {
    await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'])
    return true
  } catch {
    return false
  }
}

/**
 * Probe for where Claude Code keeps its login on this machine. Returns every
 * backend that currently holds something, because macOS installs can carry both
 * a Keychain entry and a file.
 */
export async function detect(): Promise<DetectResult> {
  const sources: CredentialSource[] = []

  if (process.platform === 'darwin') {
    const account = userInfo().username
    if (await keychainReadable(account)) {
      sources.push({ backend: 'macos-keychain', locator: KEYCHAIN_SERVICE, account })
    }
  }

  if (process.platform === 'win32') {
    // The entry name is not documented and has changed between releases, so
    // match on the vendor prefix rather than pinning an exact string.
    try {
      for (const target of await wincred.enumerate('*Claude*')) {
        sources.push({ backend: 'windows-credential-manager', locator: target })
      }
    } catch {
      // Credential Manager unreadable; fall through to the file candidates.
    }
  }

  for (const p of fileCandidates()) {
    if (await exists(p)) sources.push({ backend: 'file', locator: p })
  }

  return { sources, platform: process.platform }
}

export async function capture(source: CredentialSource): Promise<CapturedCredential> {
  if (source.backend === 'macos-keychain') {
    const { stdout } = await run('security', [
      'find-generic-password',
      '-s',
      source.locator,
      '-a',
      source.account!,
      '-w'
    ])
    return { source, data: Buffer.from(stdout.trimEnd(), 'utf8').toString('base64') }
  }

  if (source.backend === 'windows-credential-manager') {
    const c = await wincred.readCred(source.locator)
    // Username travels with the blob; CredWrite needs it back verbatim.
    return { source: { ...source, account: c.username }, data: c.blob }
  }

  const buf = await readFile(source.locator)
  return { source, data: buf.toString('base64') }
}

export async function restore(cred: CapturedCredential): Promise<void> {
  const raw = Buffer.from(cred.data, 'base64')

  if (cred.source.backend === 'macos-keychain') {
    // -U updates in place when the item already exists.
    await run('security', [
      'add-generic-password',
      '-U',
      '-s',
      cred.source.locator,
      '-a',
      cred.source.account!,
      '-w',
      raw.toString('utf8')
    ])
    return
  }

  if (cred.source.backend === 'windows-credential-manager') {
    await wincred.writeCred(cred.source.locator, {
      username: cred.source.account ?? '',
      blob: cred.data
    })
    return
  }

  const path = cred.source.locator
  // Keep a one-deep rollback copy in case a write lands mid-switch.
  if (await exists(path)) await copyFile(path, `${path}.bak`)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, raw, { mode: 0o600 })
}

export async function captureAll(sources: CredentialSource[]): Promise<CapturedCredential[]> {
  return Promise.all(sources.map(capture))
}

export async function restoreAll(creds: CapturedCredential[]): Promise<void> {
  for (const c of creds) await restore(c)
}
