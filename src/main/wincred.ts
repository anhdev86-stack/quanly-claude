import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const CRED_TYPE_GENERIC = 1
const CRED_PERSIST_LOCAL_MACHINE = 2

/**
 * Credential Manager has no CLI that returns generic-credential blobs, so we
 * P/Invoke advapi32 through PowerShell. Keeps the app free of native modules,
 * which is what lets one checkout build for both macOS and Windows.
 */
const INTEROP = `
$ErrorActionPreference = 'Stop'
if (-not ([System.Management.Automation.PSTypeName]'CredApi').Type) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CredApi {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredReadW")]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr cred);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredWriteW")]
  public static extern bool CredWrite(ref CREDENTIAL cred, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredEnumerateW")]
  public static extern bool CredEnumerate(string filter, uint flags, out uint count, out IntPtr creds);
  [DllImport("advapi32.dll", EntryPoint = "CredFree")]
  public static extern void CredFree(IntPtr buf);
}
'@
}
`

async function ps(script: string): Promise<string> {
  const encoded = Buffer.from(`${INTEROP}\n${script}`, 'utf16le').toString('base64')
  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { maxBuffer: 64 * 1024 * 1024, windowsHide: true }
  )
  return stdout.trim()
}

/** Target names of generic credentials matching `filter`. No secrets read. */
export async function enumerate(filter = '*Claude*'): Promise<string[]> {
  const out = await ps(`
$count = 0; $ptr = [IntPtr]::Zero
if (-not [CredApi]::CredEnumerate('${filter}', 0, [ref]$count, [ref]$ptr)) { exit 0 }
$names = @()
for ($i = 0; $i -lt $count; $i++) {
  $entry = [Runtime.InteropServices.Marshal]::ReadIntPtr($ptr, $i * [IntPtr]::Size)
  $c = [Runtime.InteropServices.Marshal]::PtrToStructure($entry, [Type][CredApi+CREDENTIAL])
  if ($c.Type -eq ${CRED_TYPE_GENERIC}) {
    $names += [Runtime.InteropServices.Marshal]::PtrToStringUni($c.TargetName)
  }
}
[CredApi]::CredFree($ptr)
$names -join "\`n"
`)
  return out ? out.split('\n').filter(Boolean) : []
}

export interface WinCredential {
  username: string
  /** Base64 of the raw credential blob. */
  blob: string
}

export async function readCred(target: string): Promise<WinCredential> {
  const out = await ps(`
$ptr = [IntPtr]::Zero
if (-not [CredApi]::CredRead('${target.replace(/'/g, "''")}', ${CRED_TYPE_GENERIC}, 0, [ref]$ptr)) {
  throw "CredRead failed for '${target.replace(/'/g, "''")}' (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
}
$c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][CredApi+CREDENTIAL])
$bytes = New-Object byte[] $c.CredentialBlobSize
if ($c.CredentialBlobSize -gt 0) {
  [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $c.CredentialBlobSize)
}
$user = ''
if ($c.UserName -ne [IntPtr]::Zero) { $user = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.UserName) }
[CredApi]::CredFree($ptr)
@{ username = $user; blob = [Convert]::ToBase64String($bytes) } | ConvertTo-Json -Compress
`)
  return JSON.parse(out) as WinCredential
}

export async function writeCred(target: string, cred: WinCredential): Promise<void> {
  await ps(`
$bytes = [Convert]::FromBase64String('${cred.blob}')
$blobPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
$targetPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni('${target.replace(/'/g, "''")}')
$userPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni('${cred.username.replace(/'/g, "''")}')
try {
  if ($bytes.Length -gt 0) { [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blobPtr, $bytes.Length) }
  $c = New-Object CredApi+CREDENTIAL
  $c.Type = ${CRED_TYPE_GENERIC}
  $c.TargetName = $targetPtr
  $c.UserName = $userPtr
  $c.CredentialBlobSize = $bytes.Length
  $c.CredentialBlob = $blobPtr
  $c.Persist = ${CRED_PERSIST_LOCAL_MACHINE}
  if (-not [CredApi]::CredWrite([ref]$c, 0)) {
    throw "CredWrite failed (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
  }
} finally {
  [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPtr)
  [Runtime.InteropServices.Marshal]::FreeHGlobal($targetPtr)
  [Runtime.InteropServices.Marshal]::FreeHGlobal($userPtr)
}
`)
}
