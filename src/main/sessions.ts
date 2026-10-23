import { readdir, stat, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SessionRef } from '../shared/types'

/**
 * Transcripts live on disk under ~/.claude/projects and are not tied to the
 * logged-in account, so a session stays resumable across a profile switch.
 */
function projectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

async function firstUserLine(file: string): Promise<string> {
  const fh = await open(file, 'r')
  try {
    for await (const line of fh.readLines()) {
      if (!line.trim()) continue
      try {
        const rec = JSON.parse(line)
        const content = rec?.message?.content
        if (rec?.type !== 'user' || !content) continue
        const text =
          typeof content === 'string'
            ? content
            : content.find((c: { type: string }) => c.type === 'text')?.text
        if (text) return String(text).replace(/\s+/g, ' ').slice(0, 120)
      } catch {
        // Partial or non-JSON line; keep scanning.
      }
    }
  } finally {
    await fh.close()
  }
  return '(no prompt recorded)'
}

export async function recentSessions(limit = 15): Promise<SessionRef[]> {
  let dirs: string[]
  try {
    dirs = await readdir(projectsRoot())
  } catch {
    return []
  }

  const found: SessionRef[] = []
  for (const dir of dirs) {
    const full = join(projectsRoot(), dir)
    let files: string[]
    try {
      files = (await readdir(full)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      const path = join(full, f)
      try {
        const s = await stat(path)
        found.push({
          sessionId: f.replace(/\.jsonl$/, ''),
          projectPath: dir,
          updatedAt: s.mtime.toISOString(),
          preview: ''
        })
      } catch {
        // Vanished between readdir and stat.
      }
    }
  }

  found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const top = found.slice(0, limit)

  await Promise.all(
    top.map(async (s) => {
      try {
        s.preview = await firstUserLine(join(projectsRoot(), s.projectPath, `${s.sessionId}.jsonl`))
      } catch {
        s.preview = '(unreadable)'
      }
    })
  )

  return top
}
