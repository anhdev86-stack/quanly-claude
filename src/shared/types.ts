export type CredentialBackend = 'macos-keychain' | 'windows-credential-manager' | 'file'

export interface CredentialSource {
  backend: CredentialBackend
  /** Keychain service name, or absolute file path. */
  locator: string
  /** Keychain account name. Unused for file backend. */
  account?: string
}

/** An opaque captured credential. We never parse or interpret the secret. */
export interface CapturedCredential {
  source: CredentialSource
  /** Base64 of the raw secret bytes. */
  data: string
}

export interface Profile {
  id: string
  label: string
  /** Shown in the UI so the user can tell accounts apart. Optional, user-supplied. */
  note?: string
  createdAt: string
  lastUsedAt?: string
}

/** Written to disk. `blobs` is the ciphertext; profiles metadata stays cleartext. */
export interface VaultFile {
  version: 1
  /** safeStorage-wrapped master key, base64. */
  wrappedKey: string
  profiles: Profile[]
  /** profileId -> AES-256-GCM ciphertext bundle, base64. */
  blobs: Record<string, string>
  activeProfileId?: string
  /** Append-only, oldest first. Lets usage be attributed to the right profile. */
  switches: SwitchEvent[]
}

export interface SwitchEvent {
  profileId: string
  at: string
}

export interface WindowTotals {
  label: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turns: number
  /** model id -> input+output tokens */
  byModel: Record<string, number>
}

export interface UsageReport {
  perProfile: Record<string, { fiveHour: WindowTotals; week: WindowTotals }>
  /** Turns from before any switch was recorded, so they belong to no profile. */
  unattributed: { fiveHour: WindowTotals; week: WindowTotals }
  generatedAt: string
}

export interface SessionRef {
  sessionId: string
  projectPath: string
  updatedAt: string
  preview: string
}

export interface DetectResult {
  sources: CredentialSource[]
  platform: NodeJS.Platform
}
