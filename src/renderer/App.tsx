import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DetectResult, Profile, SessionRef, UsageReport, WindowTotals } from '../shared/types'

function fmtTokens(w?: WindowTotals): string {
  if (!w || w.turns === 0) return '—'
  const total = w.input + w.output + w.cacheRead + w.cacheWrite
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`
  if (total >= 1_000) return `${Math.round(total / 1_000)}K`
  return String(total)
}

function timeAgo(iso?: string): string {
  if (!iso) return 'chưa dùng'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  return `${Math.floor(hrs / 24)} ngày trước`
}

export default function App(): JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState<string | undefined>()
  const [detection, setDetection] = useState<DetectResult | null>(null)
  const [encryptionOk, setEncryptionOk] = useState(true)
  const [sessions, setSessions] = useState<SessionRef[]>([])
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [claudeRunning, setClaudeRunning] = useState(false)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [{ profiles, activeProfileId }, status, recent, usageReport] = await Promise.all([
      window.switcher.list(),
      window.switcher.status(),
      window.switcher.recentSessions(),
      window.switcher.usageReport()
    ])
    setProfiles(profiles)
    setActiveId(activeProfileId)
    setDetection(status.detection)
    setEncryptionOk(status.encryptionAvailable)
    setSessions(recent)
    setUsage(usageReport)
    setClaudeRunning(status.claudeRunning)
  }, [])

  useEffect(() => {
    refresh().catch((e) => setError(String(e)))
  }, [refresh])

  async function guard(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const loggedIn = (detection?.sources.length ?? 0) > 0

  /**
   * Surface the least-used profile but never act on it. Switching stays a
   * deliberate click so the tool reports state rather than hiding a limit.
   */
  const suggestion = useMemo(() => {
    if (!usage || profiles.length < 2 || !activeId) return null
    const spend = (id: string): number => {
      const w = usage.perProfile[id]?.fiveHour
      return w ? w.input + w.output + w.cacheRead + w.cacheWrite : 0
    }
    const active = spend(activeId)
    if (active === 0) return null
    const best = profiles
      .filter((p) => p.id !== activeId)
      .sort((a, b) => spend(a.id) - spend(b.id))[0]
    return best && spend(best.id) < active ? best : null
  }, [usage, profiles, activeId])

  return (
    <div className="app">
      <header>
        <h1>Claude Account Switcher</h1>
        <p className="sub">
          Đổi giữa các tài khoản bạn sở hữu, không cần logout/login thủ công.
        </p>
      </header>

      {!encryptionOk && (
        <div className="banner warn">
          Hệ điều hành không cung cấp secure storage. Không thể mã hoá an toàn — hãy dừng lại.
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      {claudeRunning && (
        <div className="banner warn">
          Claude Code đang chạy. Thoát hẳn trước khi đổi hồ sơ — tiến trình đang mở có thể ghi đè
          credential cũ lên lúc thoát và làm hỏng lần chuyển.
        </div>
      )}

      <section>
        <h2>Trạng thái máy</h2>
        <div className="status">
          <div>
            <span className="k">Nền tảng</span>
            <span className="v">{detection?.platform ?? '…'}</span>
          </div>
          <div>
            <span className="k">Nơi lưu login</span>
            <span className="v">
              {loggedIn
                ? detection!.sources.map((s) => s.backend).join(', ')
                : 'chưa tìm thấy login nào'}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Hồ sơ đã lưu</h2>

        {profiles.length === 0 && (
          <p className="empty">
            Chưa có hồ sơ nào. Đăng nhập Claude Code bằng tài khoản bạn muốn lưu, rồi bấm
            “Lưu login hiện tại” bên dưới.
          </p>
        )}

        <ul className="profiles">
          {profiles.map((p) => (
            <li key={p.id} className={p.id === activeId ? 'active' : ''}>
              <div className="info">
                <strong>{p.label}</strong>
                {p.id === activeId && <span className="pill">đang dùng</span>}
                <small>{timeAgo(p.lastUsedAt)}</small>
              </div>
              <div className="actions">
                <button
                  disabled={busy || p.id === activeId}
                  onClick={() => guard(() => window.switcher.switchTo(p.id))}
                >
                  Chuyển sang
                </button>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    const next = prompt('Tên mới', p.label)
                    if (next) guard(() => window.switcher.rename(p.id, next))
                  }}
                >
                  Đổi tên
                </button>
                <button
                  className="ghost danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Xoá hồ sơ “${p.label}”? Thao tác này không hoàn tác được.`))
                      guard(() => window.switcher.remove(p.id))
                  }}
                >
                  Xoá
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="capture">
          <input
            placeholder="Tên hồ sơ, ví dụ: Pro cá nhân"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            disabled={busy || !label.trim() || !loggedIn}
            onClick={() =>
              guard(async () => {
                await window.switcher.captureCurrent(label.trim())
                setLabel('')
              })
            }
          >
            Lưu login hiện tại
          </button>
        </div>
        {!loggedIn && (
          <p className="hint">Chưa phát hiện login nào — đăng nhập Claude Code trước đã.</p>
        )}
      </section>

      <section>
        <h2>Mức tiêu thụ theo hồ sơ</h2>
        <div className="banner info">
          Đây là lượng token <strong>đã tiêu thụ</strong>, tính từ transcript local — không phải
          quota còn lại. Claude Code không cung cấp API nào để đọc quota thật, nên tôi không hiện
          con số đó. Đối chiếu bằng <code>/usage</code> trong Claude Code.
        </div>

        {suggestion && (
          <div className="banner suggest">
            <span>
              <strong>{suggestion.label}</strong> đang dùng ít nhất trong 5 giờ qua.
            </span>
            <button
              disabled={busy}
              onClick={() => guard(() => window.switcher.switchTo(suggestion.id))}
            >
              Chuyển sang
            </button>
          </div>
        )}

        <table className="usage">
          <thead>
            <tr>
              <th>Hồ sơ</th>
              <th>5 giờ qua</th>
              <th>7 ngày qua</th>
              <th>Lượt</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const u = usage?.perProfile[p.id]
              return (
                <tr key={p.id} className={p.id === activeId ? 'active' : ''}>
                  <td>{p.label}</td>
                  <td>{fmtTokens(u?.fiveHour)}</td>
                  <td>{fmtTokens(u?.week)}</td>
                  <td>{u?.week.turns ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {usage && usage.unattributed.week.turns > 0 && (
          <p className="hint">
            {usage.unattributed.week.turns} lượt trước khi bắt đầu ghi lịch sử chuyển nên chưa quy
            được về hồ sơ nào.
          </p>
        )}
      </section>

      <section>
        <h2>Phiên gần đây</h2>
        <p className="hint">
          Transcript nằm ở local và không gắn với tài khoản nào, nên sau khi đổi hồ sơ bạn vẫn nối
          tiếp được đúng hội thoại cũ.
        </p>
        <ul className="sessions">
          {sessions.slice(0, 8).map((s) => (
            <li key={s.sessionId}>
              <div className="info">
                <strong>{s.preview}</strong>
                <small>{timeAgo(s.updatedAt)}</small>
              </div>
              <code
                title="Bấm để copy"
                onClick={() => navigator.clipboard.writeText(`claude --resume ${s.sessionId}`)}
              >
                claude --resume {s.sessionId.slice(0, 8)}…
              </code>
            </li>
          ))}
        </ul>
        {sessions.length === 0 && <p className="empty">Chưa có phiên nào.</p>}
      </section>
    </div>
  )
}
