// 확인 화면 (?mediacheck=1): 노래 맞히기의 목록 곡마다 미리듣기를 실제로 찾아봄 (배포된 사이트에서, 2개씩 천천히 — 210곡이면 4분쯤)
// '📼 옛날' = 옛날 노래(90~2000년대)만, '🔥 지금 차트' = 게임에 섞이는 Apple Music 한국 Top 100 (/api/media?chart=1),
// 서버가 미리듣기를 못 받은 차트 곡은 ▶ 를 누르면 이 폰에서 Apple 에 직접 찾아봄 (게임 때와 같이), '영화' = 이모지 영화 맞히기 문제 보기
// 못 찾은 것만 모아서 복사 → Claude 에게 붙여 주면 제목·검색어를 고침
import { useEffect, useMemo, useRef, useState } from 'react'
import { TITLES, MQ_CATS, chartItem, movieHint, isOldSong } from '../game/mediaquiz'
import { itunesPreviews } from '../game/itunes'
import { mqUnlock, mqPlay, mqStop } from '../game/mqaudio'

const WHY = { notfound: '못 찾음', bad: '번호 오류', error: '서버 오류', net: '연결 안 됨', chart: '차트 못 불러옴' }
export default function MediaCheck() {
  const [res, setRes] = useState({}) // 번호 → 결과
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState('song')
  const [onlyBad, setOnlyBad] = useState(false)
  const [copied, setCopied] = useState(false)
  const [chart, setChart] = useState(null) // null = 아직, { ok, songs, withUrl, err } | { ok: false, why }
  const [phone, setPhone] = useState({}) // 차트 곡 번호 → 이 폰에서 찾은 미리듣기 주소 ('' = 못 찾음)
  const stop = useRef(false)
  const [ping, setPing] = useState(null) // 서버 함수 상태: { ping: true } | { down: true }
  useEffect(() => {
    fetch('/api/media?ping=1')
      .then((r) => r.json())
      .then((j) => setPing(j?.ping ? j : { down: true }))
      .catch(() => setPing({ down: true }))
  }, [])
  useEffect(() => {
    if (filter !== 'chart' || chart) return
    fetch('/api/media?chart=1')
      .then((r) => r.json())
      .then((j) => setChart(j && typeof j === 'object' ? j : { ok: false, why: 'error' }))
      .catch(() => setChart({ ok: false, why: 'net' }))
  }, [filter, chart])
  const list = useMemo(() => TITLES.map((x, i) => ({ ...x, i })).filter((x) => !x.off && x.c === (filter === 'movie' ? 'movie' : 'song') && (filter !== 'old' || isOldSong(x))), [filter])
  const songs = filter === 'song' || filter === 'old' // 확인(미리듣기 찾기)은 목록 노래만
  const done = list.filter((x) => res[x.i])
  const good = done.filter((x) => res[x.i].ok)
  const run = async () => {
    mqUnlock()
    stop.current = false
    setRunning(true)
    const todo = list.filter((x) => x.c === 'song' && !res[x.i]?.ok)
    let k = 0
    const worker = async () => {
      while (k < todo.length && !stop.current) {
        const x = todo[k++]
        let j
        try {
          j = await (await fetch(`/api/media?i=${x.i}&debug=1`)).json()
        } catch {
          j = { ok: false, why: 'net' }
        }
        setRes((r) => ({ ...r, [x.i]: j }))
        await new Promise((ok) => setTimeout(ok, 300)) // Deezer·Apple 이 너무 자주 부른다고 막지 않게 천천히
      }
    }
    await Promise.all([worker(), worker()])
    setRunning(false)
  }
  const bad = done.filter((x) => !res[x.i].ok)
  const copy = async () => {
    const text = bad.map((x) => `${x.i}: ${x.t} / ${x.by} — ${WHY[res[x.i].why] || res[x.i].why}${res[x.i].debug ? ` | ${res[x.i].debug.map((d) => `${d.src} "${d.q}" ${d.n ?? ''}${d.err ? ` err ${d.err}` : ''}${d.top?.length ? ` [${d.top.join(' / ')}]` : ''}`).join(' ; ')}` : ''}`).join('\n')
    try {
      await navigator.clipboard.writeText(text || '못 찾은 것 없음')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const shown = songs && onlyBad ? bad : list
  const play = (url) => (mqUnlock(), mqStop(), mqPlay(url, 0, 3000))
  // 서버가 미리듣기를 못 받은 차트 곡: 이 폰에서 Apple 에 직접 (게임 때와 같은 방법)
  const playChart = async (s) => {
    const url = s.url || phone[s.id]
    if (url) return play(url)
    mqUnlock() // 누르는 순간에 (찾고 나서 틀어도 소리가 나게)
    const m = await itunesPreviews([s.id])
    const u = m.get(String(s.id))?.url || ''
    setPhone((x) => ({ ...x, [s.id]: u }))
    if (u) {
      mqStop()
      mqPlay(u, 0, 3000)
    }
  }
  return (
    <div className="app mc">
      <div className="card card-pad">
        <h2>🎵 미리듣기 확인</h2>
        <div className="muted">
          '노래'는 목록 곡마다 Deezer → Apple 미리듣기를 찾아봐요 ('📼 옛날'은 90~2000년대 곡만). '🔥 지금 차트'는 게임에 섞이는 Apple Music 한국 Top 100 (노래 3곡 중 1곡 — 미리듣기가 없는 곡은 ▶ 를 누르면 이 폰에서 찾아봐요), '영화'는 이모지 문제예요. ▶ 를 누르면 처음부터 3초 들어 봐요.
        </div>
        <div className="mc-ping">{!ping ? '서버 함수 확인 중…' : ping.down ? '❌ 서버 함수(/api/media)가 안 돼요 — 배포가 끝났는지 확인해 주세요' : '✅ 서버 함수 OK'}</div>
        <div className="mc-bar">
          {[
            ['song', '노래'],
            ['old', '📼 옛날'],
            ['chart', '🔥 지금 차트'],
            ['movie', '영화 (이모지)'],
          ].map(([k, l]) => (
            <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(k)} disabled={running}>
              {l}
            </button>
          ))}
          {running ? (
            <button className="btn btn-sm btn-ghost" onClick={() => (stop.current = true)}>
              ⏸ 멈춤
            </button>
          ) : (
            songs && (
              <button className="btn btn-sm btn-primary" onClick={run}>
                ▶ 확인 시작
              </button>
            )
          )}
        </div>
        <div className="mc-sum">
          {songs ? (
            <>
              {done.length}/{list.length} 확인 · ✅ {good.length} · ❌ {bad.length}
              <label>
                <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> 못 찾은 것만
              </label>
              {bad.length > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={copy}>
                  {copied ? '복사됨!' : '📋 못 찾은 것 복사'}
                </button>
              )}
            </>
          ) : filter === 'chart' ? (
            !chart ? '차트 불러오는 중…' : chart.ok ? `서버가 찾은 미리듣기 ${chart.withUrl ?? chart.songs.filter((s) => s.url).length}/${chart.n || chart.songs.length}곡${chart.stale ? ' · 예전 차트' : ''}${chart.err ? ` · ${chart.err}` : ''}` : `❌ ${WHY[chart.why] || chart.why}${chart.err ? ` (${chart.err})` : ''}`
          ) : (
            `${MQ_CATS.movie.name} ${list.length}개 — 이모지 문제 (2단계 힌트: 연도 · 주연)`
          )}
        </div>
      </div>
      <div className="mc-list">
        {filter === 'chart'
          ? (chart?.ok ? chart.songs : []).map((s) => {
              const x = chartItem(s)
              const got = phone[s.id]
              return (
                <div key={s.id} className={`mc-row ${s.url || got ? 'ok' : got === '' ? 'no' : ''}`}>
                  <span className="mc-no">{s.rank}</span>
                  <span className="mc-t">
                    🔥 <b>{x.t}</b> <em>{x.by}</em>
                    {x.a.length > 0 && <small>정답으로도: {x.a.join(' · ')}</small>}
                    {!s.url && <small>{got ? '이 폰에서 찾음' : got === '' ? '이 폰에서도 못 찾음' : '서버는 못 찾음 — ▶ 로 이 폰에서 찾기'}</small>}
                  </span>
                  <button className="btn btn-sm btn-ghost" onClick={() => playChart(s)}>
                    ▶
                  </button>
                </div>
              )
            })
          : shown.map((x) => {
              const r = res[x.i]
              const cat = MQ_CATS[x.c]
              return (
                <div key={x.i} className={`mc-row ${r ? (r.ok ? 'ok' : 'no') : ''}`}>
                  <span className="mc-no">{x.i}</span>
                  <span className="mc-t">
                    {cat.emoji} <b>{x.t}</b> <em>{x.c === 'song' ? x.by : x.y}</em>
                    {x.c !== 'song' && <small className="mc-emoji">{x.e}</small>}
                    {x.c !== 'song' && <small>{movieHint(x)}</small>}
                    {r && <small>{r.ok ? `${r.src}: ${r.artist ? `${r.artist} - ` : ''}${r.name || ''}` : WHY[r.why] || r.why}</small>}
                  </span>
                  {r?.ok && r.kind === 'audio' && (
                    <button className="btn btn-sm btn-ghost" onClick={() => play(r.url)}>
                      ▶
                    </button>
                  )}
                </div>
              )
            })}
      </div>
    </div>
  )
}
