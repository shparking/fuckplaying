// 확인 화면 (?mediacheck=1): 드라마·영화·노래 맞히기의 노래·영화 문제마다 미리듣기·사진을 실제로 찾아봄 (배포된 사이트에서, 2개씩 천천히 — 233개면 3~4분)
// 드라마는 10/31부터 이모지 문제라 찾을 게 없음 → '드라마' 칸에서 이모지만 보여 줌
// 못 찾은 것만 모아서 복사 → Claude 에게 붙여 주면 제목·검색어를 고침
import { useEffect, useMemo, useRef, useState } from 'react'
import { TITLES, MQ_CATS } from '../game/mediaquiz'
import { mqUnlock, mqPlay, mqStop } from '../game/mqaudio'

const WHY = { notfound: '못 찾음', nokey: 'TMDB 키 없음', badkey: 'TMDB 키가 틀림', bad: '번호 오류', error: '서버 오류', net: '연결 안 됨' }
export default function MediaCheck() {
  const [res, setRes] = useState({}) // 번호 → 결과
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState('all')
  const [onlyBad, setOnlyBad] = useState(false)
  const [copied, setCopied] = useState(false)
  const stop = useRef(false)
  const [ping, setPing] = useState(null) // 서버 함수 상태: { tmdb: 'set'|'none' } | { down: true }
  useEffect(() => {
    fetch('/api/media?ping=1')
      .then((r) => r.json())
      .then((j) => setPing(j?.ping ? j : { down: true }))
      .catch(() => setPing({ down: true }))
  }, [])
  // 확인할 것: 노래·영화 (드라마는 이모지라 확인 안 함 — '드라마' 칸에서 이모지만 봄)
  const list = useMemo(() => TITLES.map((x, i) => ({ ...x, i })).filter((x) => !x.off && (filter === 'all' ? x.c !== 'drama' : x.c === filter)), [filter])
  const done = list.filter((x) => res[x.i])
  const good = done.filter((x) => res[x.i].ok)
  const run = async () => {
    mqUnlock()
    stop.current = false
    setRunning(true)
    const todo = list.filter((x) => !res[x.i]?.ok)
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
    const text = bad.map((x) => `${x.i}: ${x.t}${x.by ? ` / ${x.by}` : ` (${x.y})`} — ${WHY[res[x.i].why] || res[x.i].why}${res[x.i].debug ? ` | ${res[x.i].debug.map((d) => `${d.src} "${d.q || d.id}" ${d.n ?? ''}${d.err ? ` err ${d.err}` : ''}${d.top?.length ? ` [${d.top.join(' / ')}]` : ''}`).join(' ; ')}` : ''}`).join('\n')
    try {
      await navigator.clipboard.writeText(text || '못 찾은 것 없음')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const shown = onlyBad ? bad : list
  return (
    <div className="app mc">
      <div className="card card-pad">
        <h2>🎬 미리듣기·사진 확인</h2>
        <div className="muted">
          노래·영화 문제를 하나씩 찾아봐요. 노래는 Deezer → Apple 미리듣기, 영화는 TMDB 사진 (Vercel 환경 변수 TMDB_TOKEN 필요). ▶ 를 누르면 그 곡을 처음부터 3초 들어 봐요. 드라마는 이모지 문제라 확인할 게 없어요 ('드라마'에서 이모지 보기).
        </div>
        <div className="mc-ping">
          {!ping ? '서버 함수 확인 중…' : ping.down ? '❌ 서버 함수(/api/media)가 안 돼요 — 배포가 끝났는지 확인해 주세요' : ping.tmdb === 'set' ? '✅ 서버 함수 OK · TMDB 키 있음' : '✅ 서버 함수 OK · ❌ TMDB 키 없음 (영화 사진이 안 나와요 — Vercel 환경 변수 TMDB_TOKEN)'}
        </div>
        <div className="mc-bar">
          {[
            ['all', '노래·영화'],
            ['song', '노래'],
            ['movie', '영화'],
            ['drama', '드라마 (이모지)'],
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
            <button className="btn btn-sm btn-primary" onClick={run} disabled={filter === 'drama'}>
              ▶ 확인 시작
            </button>
          )}
        </div>
        <div className="mc-sum">
          {done.length}/{list.length} 확인 · ✅ {good.length} · ❌ {bad.length}
          <label>
            <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> 못 찾은 것만
          </label>
          {bad.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={copy}>
              {copied ? '복사됨!' : '📋 못 찾은 것 복사'}
            </button>
          )}
        </div>
      </div>
      <div className="mc-list">
        {shown.map((x) => {
          const r = res[x.i]
          const cat = MQ_CATS[x.c]
          return (
            <div key={x.i} className={`mc-row ${r ? (r.ok ? 'ok' : 'no') : ''}`}>
              <span className="mc-no">{x.i}</span>
              <span className="mc-t">
                {cat.emoji} <b>{x.t}</b> <em>{x.c === 'song' ? x.by : x.y}</em>
                {x.c === 'drama' && <small className="mc-emoji">{x.e}</small>}
                {r && <small>{r.ok ? `${r.src}: ${r.artist ? `${r.artist} - ` : ''}${r.name || ''}${r.year ? ` (${r.year})` : ''}` : WHY[r.why] || r.why}</small>}
              </span>
              {r?.ok && r.kind === 'audio' && (
                <button className="btn btn-sm btn-ghost" onClick={() => (mqStop(), mqPlay(r.url, 0, 3000))}>
                  ▶
                </button>
              )}
              {r?.ok && r.kind === 'image' && <img className="mc-img" src={r.url} alt="" loading="lazy" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
