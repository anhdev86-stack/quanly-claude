import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { CapturedCredential, Profile, SwitchEvent, VaultFile } from '../shared/types'

const IV_LEN = 12
const TAG_LEN = 16

let cache: VaultFile | null = null

function vaultPath(): string {
  return join(app.getPath('userData'), 'vault.json')
}

function emptyVault(): VaultFile {
  const key = randomBytes(32)
  return {
    version: 1,
    wrappedKey: safeStorage.encryptString(key.toString('base64')).toString('base64'),
    profiles: [],
    blobs: {},
    switches: []
  }
}

export async function load(): Promise<VaultFile> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(vaultPath(), 'utf8')) as VaultFile
    cache.switches ??= []
  } catch {
    cache = emptyVault()
    await persist()
  }
  return cache!
}

async function persist(): Promise<void> {
  const tmp = `${vaultPath()}.tmp`
  await writeFile(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 })
  await rename(tmp, vaultPath())
}

function masterKey(v: VaultFile): Buffer {
  const b64 = safeStorage.decryptString(Buffer.from(v.wrappedKey, 'base64'))
  return Buffer.from(b64, 'base64')
}

function seal(v: VaultFile, plain: string): string {
  const iv = randomBytes(IV_LEN)
  const c = createCipheriv('aes-256-gcm', masterKey(v), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
}

function open(v: VaultFile, sealed: string): string {
  const raw = Buffer.from(sealed, 'base64')
  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const d = createDecipheriv('aes-256-gcm', masterKey(v), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(raw.subarray(IV_LEN + TAG_LEN)), d.final()]).toString('utf8')
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function listProfiles(): Promise<{ profiles: Profile[]; activeProfileId?: string }> {
  const v = await load()
  return { profiles: v.profiles, activeProfileId: v.activeProfileId }
}

export async function saveProfile(
  label: string,
  creds: CapturedCredential[],
  note?: string
): Promise<Profile> {
  const v = await load()
  const profile: Profile = {
    id: randomUUID(),
    label,
    note,
    createdAt: new Date().toISOString()
  }
  v.profiles.push(profile)
  v.blobs[profile.id] = seal(v, JSON.stringify(creds))
  await persist()
  return profile
}

export async function readProfile(id: string): Promise<CapturedCredential[]> {
  const v = await load()
  const sealed = v.blobs[id]
  if (!sealed) throw new Error(`No stored credential for profile ${id}`)
  return JSON.parse(open(v, sealed)) as CapturedCredential[]
}

export async function overwriteProfile(id: string, creds: CapturedCredential[]): Promise<void> {
  const v = await load()
  if (!v.profiles.some((p) => p.id === id)) throw new Error(`Unknown profile ${id}`)
  v.blobs[id] = seal(v, JSON.stringify(creds))
  await persist()
}

export async function renameProfile(id: string, label: string, note?: string): Promise<void> {
  const v = await load()
  const p = v.profiles.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown profile ${id}`)
  p.label = label
  p.note = note
  await persist()
}

export async function removeProfile(id: string): Promise<void> {
  const v = await load()
  v.profiles = v.profiles.filter((p) => p.id !== id)
  delete v.blobs[id]
  if (v.activeProfileId === id) v.activeProfileId = undefined
  await persist()
}

export async function markActive(id: string): Promise<void> {
  const v = await load()
  const p = v.profiles.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown profile ${id}`)
  const now = new Date().toISOString()
  p.lastUsedAt = now
  v.activeProfileId = id
  if (v.switches.at(-1)?.profileId !== id) v.switches.push({ profileId: id, at: now })
  await persist()
}

export async function switchHistory(): Promise<SwitchEvent[]> {
  return (await load()).switches
}
