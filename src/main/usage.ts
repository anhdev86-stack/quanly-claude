import { readdir, stat, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SwitchEvent, UsageReport, WindowTotals } from '../shared/types'

const FIVE_HOURS = 5 * 60 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

interface Turn {
  ts: number
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

function projectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

async function transcriptsSince(cutoff: number): Promise<string[]> {
  let dirs: string[]
  try {
    dirs = await readdir(projectsRoot())
  } catch {
    return []
  }

  const out: string[] = []
  for (const dir of dirs) {
    const full = join(projectsRoot(), dir)
    let names: string[]
    try {
      names = await readdir(full)
    } catch {
      continue
    }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue
      const p = join(full, n)
      try {
        if ((await stat(p)).mtimeMs >= cutoff) out.push(p)
      } catch {
        // Vanished mid-scan.
      }
    }
  }
  return out
}

async function readTurns(file: string, cutoff: number): Promise<Turn[]> {
  const turns: Turn[] = []
  const fh = await open(file, 'r')
  try {
    for await (const line of fh.readLines()) {
      if (!line.includes('"usage"')) continue
      let rec: {
        type?: string
        timestamp?: string
        message?: { model?: string; usage?: Record<string, number> }
      }
      try {
        rec = JSON.parse(line)
      } catch {
        continue
      }
      const u = rec.message?.usage
      if (rec.type !== 'assistant' || !u || !rec.timestamp) continue
      const ts = Date.parse(rec.timestamp)
      if (!Number.isFinite(ts) || ts < cutoff) continue
      turns.push({
        ts,
        model: rec.message?.model ?? 'unknown',
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0
      })
    }
  } finally {
    await fh.close()
  }
  return turns
}

/** Which profile was active at `ts`, per the recorded switch history. */
function profileAt(history: SwitchEvent[], ts: number): string | undefined {
  let current: string | undefined
  for (const ev of history) {
    if (Date.parse(ev.at) <= ts) current = ev.profileId
    else break
  }
  return current
}

function emptyTotals(label: string): WindowTotals {
  return { label, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, byModel: {} }
}

function add(t: WindowTotals, turn: Turn): void {
  t.input += turn.input
  t.output += turn.output
  t.cacheRead += turn.cacheRead
  t.cacheWrite += turn.cacheWrite
  t.turns += 1
  t.byModel[turn.model] = (t.byModel[turn.model] ?? 0) + turn.input + turn.output
}

/**
 * Consumption measured from local transcripts. This is what was actually spent,
 * not Anthropic's authoritative remaining quota — no supported API exposes that.
 */
export async function report(history: SwitchEvent[]): Promise<UsageReport> {
  const now = Date.now()
  const cutoff = now - SEVEN_DAYS
  const sorted = [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const files = await transcriptsSince(cutoff)
  const nested = await Promise.all(files.map((f) => readTurns(f, cutoff).catch(() => [])))

  const perProfile: Record<string, { fiveHour: WindowTotals; week: WindowTotals }> = {}
  const unattributed = { fiveHour: emptyTotals('5 giờ'), week: emptyTotals('7 ngày') }

  for (const turn of nested.flat()) {
    const id = profileAt(sorted, turn.ts)
    const bucket =
      id === undefined
        ? unattributed
        : (perProfile[id] ??= { fiveHour: emptyTotals('5 giờ'), week: emptyTotals('7 ngày') })

    add(bucket.week, turn)
    if (turn.ts >= now - FIVE_HOURS) add(bucket.fiveHour, turn)
  }

  return { perProfile, unattributed, generatedAt: new Date(now).toISOString() }
}
