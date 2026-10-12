// 팀 대결 미니게임 화면: 팀 이구동성 · 연타 줄다리기 · 팀 반응속도 · 폭탄 돌리기 팀전
// 모두 자기 폰으로 동시에 참여하고, 진 팀 전원이 마심. 동점이면 룰렛.
// 시간은 서버 시각(serverNow) 기준이라 모든 폰이 같은 순간에 같은 화면을 봄
import { useEffect, useRef, useState } from 'react'
import { SOLO } from '../db'
import { TEAM_INFO } from '../game/yut'
import { SYNC_QUESTIONS } from '../game/teamgames'
import {
  arr,
  resolvePending,
  serverNow,
  teamMembers,
  teamOf,
  liveTeams,
  syncPhase,
  syncResult,
  syncAnswer,
  SYNC_QN,
  SYNC_ANSWER_MS,
  tapReport,
  tapResult,
  TAP_MS,
  TAP_SETTLE_MS,
  teamReactTap,
  teamReactResult,
  teamReactDone,
  REACT_PENALTY_MS,
  bombState,
  bombPass,
  BOMB_PASS_LOCK_MS,
  BOMB_SETTLE_MS,
} from '../room'

// 서버 시각으로 다시 그리기 (active 일 때만 ms 간격)
function useNow(active, ms = 100) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => tick((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [active, ms])
  return serverNow()
}
const buzz = (p) => {
  try {
    navigator.vibrate?.(p)
  } catch {}
}

function TeamChip({ t, small }) {
  const info = TEAM_INFO[t] || TEAM_INFO[0]
  return (
    <span className={`tchip ${small ? 'sm' : ''}`} style={{ '--tc': info.color }}>
      <i />
      {info.name}
    </span>
  )
}
function Avatars({ room, ids, dim }) {
  return (
    <span className="tg-avatars">
      {ids.map((pid) => (
        <span key={pid} className={`avatar xs ${dim?.(pid) ? 'dim' : ''}`} style={{ background: room.players[pid]?.color }} title={room.players[pid]?.name}>
          {room.players[pid]?.name?.slice(0, 1)}
        </span>
      ))}
    </span>
  )
}
function Confetti({ color }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <i key={i} style={{ '--i': i, left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, background: [color || '#ffd166', '#ffd166', '#06d6a0', '#4cc9f0', '#f47725', '#b388ff'][i % 6] }} />
      ))}
    </div>
  )
}
// 3·2·1 (서버 시각 기준이라 모든 폰이 같이 셈)
function CountScreen({ left, emoji, sub }) {
  const n = Math.max(1, Math.ceil(left / 1000))
  const prev = useRef(null)
  useEffect(() => {
    if (prev.current !== n) buzz(40)
    prev.current = n
  }, [n])
  return (
    <div className="ai-overlay">
      <div className="ai-count" key={n}>
        <div className="ai-robot">{emoji}</div>
        <div className="ai-num">{n}</div>
        <div className="ai-sub">{sub}</div>
      </div>
    </div>
  )
}

// 시작 전 안내 (모든 폰). 진행자(도착한 사람·방장)가 시작
function ReadyModal({ room, p, ctl, emoji, title, headline, rules, startLabel, code, extra }) {
  const actor = room.players[p.playerId]
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">
          {emoji} {title} · 팀 대결
        </div>
        <h2>{headline}</h2>
        <div className="muted">{rules}</div>
        {extra}
        <div className="tg-roster">
          {liveTeams(room).map((t) => (
            <div key={t} className="tg-roster-row" style={{ '--tc': TEAM_INFO[t].color }}>
              <TeamChip t={t} small />
              <span className="tg-names">{teamMembers(room, t).map((pid) => room.players[pid]?.name).join(' · ')}</span>
            </div>
          ))}
        </div>
        <div className="actions">
          {ctl ? (
            <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'start')}>
              {startLabel}
            </button>
          ) : (
            <div className="waiting">{actor?.name}이(가) 시작하면 다 같이 해요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 결과 (모든 폰): 팀별 기록 → 진 팀 다 같이 마셔 / 동점이면 룰렛
function TeamResult({ room, p, ctl, code, emoji, title, rows, losers, tie, note }) {
  const actor = room.players[p.playerId]
  const loser = !tie ? losers[0] : null
  useEffect(() => buzz([80, 40, 80, 40, 200]), [])
  return (
    <div className="ai-overlay">
      <div className="ai-reveal">
        {!tie && <Confetti color={TEAM_INFO[loser]?.color} />}
        <div className="ai-congrats">
          {emoji} {title} 결과
        </div>
        <div className="tg-rows">
          {rows.map((r) => (
            <div key={r.team} className={`tg-row ${losers.includes(r.team) ? 'lose' : 'win'}`} style={{ '--tc': TEAM_INFO[r.team].color }}>
              <TeamChip t={r.team} small />
              <span className="tg-row-main">{r.main}</span>
              {r.sub && <span className="tg-row-sub">{r.sub}</span>}
            </div>
          ))}
        </div>
        {note && <div className="ai-note">{note}</div>}
        {tie ? (
          <div className="ai-name">
            동점! <b>룰렛</b>으로 마실 팀을 정해요 🎡
          </div>
        ) : (
          <>
            <Avatars room={room} ids={teamMembers(room, loser)} />
            <div className="ai-name">
              <b style={{ color: TEAM_INFO[loser]?.color }}>{TEAM_INFO[loser]?.name}</b> 다 같이 마셔! 🍶
            </div>
          </>
        )}
        <div className="ai-actions">
          {ctl ? (
            tie ? (
              <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'roulette')}>
                🎡 룰렛 돌리기
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
                확인
              </button>
            )
          ) : (
            <div className="waiting">
              {actor?.name}이(가) {tie ? '룰렛을 돌려요' : '확인하면 다음 차례로'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 동점 룰렛: 동점인 팀들 중 한 팀 (확률 똑같이)
export function TeamRoulette({ room, p, ctl, code, emoji, title }) {
  const teams = arr(p.rouletteFrom).map(Number)
  const k = Math.max(0, teams.indexOf(Number(p.rouletteTeam)))
  const n = Math.max(1, teams.length)
  const seg = 360 / n
  const [spun, setSpun] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    setSpun(false)
    setDone(false)
    const t1 = setTimeout(() => setSpun(true), 100)
    const t2 = setTimeout(() => setDone(true), 3400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [p.revealedAt])
  useEffect(() => {
    if (done) buzz([80, 40, 80, 40, 200])
  }, [done])
  const finalDeg = 360 * 5 + (360 - (k + 0.5) * seg)
  const grad = teams.map((t, i) => `${TEAM_INFO[t]?.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')
  const loser = teams[k]
  const actor = room.players[p.playerId]
  return (
    <div className="ai-overlay">
      <div className="ai-reveal">
        {done && <Confetti color={TEAM_INFO[loser]?.color} />}
        <div className="ai-congrats">🎡 동점! 룰렛</div>
        <div className="ai-note">
          {emoji} {title} {p.finalText || ''}
        </div>
        <div className="roulette">
          <div className="needle" />
          <div className="wheel" style={{ transform: spun ? `rotate(${finalDeg}deg)` : 'rotate(0deg)', background: `conic-gradient(${grad})` }}>
            {teams.map((t, i) => (
              <span key={t} className="seg-label" style={{ transform: `translate(-50%, -50%) rotate(${(i + 0.5) * seg}deg) translateY(-56px)` }}>
                {TEAM_INFO[t]?.emoji}
              </span>
            ))}
          </div>
        </div>
        <div className="roulette-legend">
          {teams.map((t) => (
            <span key={t}>
              <i className="sw" style={{ background: TEAM_INFO[t]?.color }} /> {TEAM_INFO[t]?.name}
            </span>
          ))}
        </div>
        <div className="ai-name">
          {done ? (
            <>
              <b style={{ color: TEAM_INFO[loser]?.color }}>{TEAM_INFO[loser]?.name}</b> 다 같이 마셔! 🍶
            </>
          ) : (
            <span className="muted-light">돌아가는 중…</span>
          )}
        </div>
        <div className="ai-actions">
          {done && ctl ? (
            <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
              확인
            </button>
          ) : done ? (
            <div className="waiting">{actor?.name}이(가) 확인하면 다음 차례로</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ---------- 팀 이구동성 ----------
// 질문 4개 × 5초 양자택일. 팀원 전원이 같은 답이면 그 문제 성공. 성공 수가 적은 팀이 마심 (동점 → 룰렛)
export function SyncPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const ph = syncPhase(p, now)
  const qs = arr(p.qs).map((i) => (SYNC_QUESTIONS[i] || 'A vs B').split(' vs '))
  const qRef = useRef(null)
  useEffect(() => {
    if (ph.phase === 'q' && qRef.current !== ph.q) {
      qRef.current = ph.q
      buzz(60)
    }
  }, [ph.phase, ph.q])
  const title = p.title || '팀 이구동성'
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="👯"
        title={title}
        headline="우리 팀, 같은 걸 고를 수 있을까?"
        startLabel="👯 시작"
        rules={
          <>
            질문 {SYNC_QN}개가 차례로 나와요. 질문마다 <b>5초 안에 둘 중 하나</b>를 고르세요 (상의 금지 🤫). 팀원 <b>전원이 같은 답</b>이면 그 문제 성공! 성공이 적은 팀이 다 같이 마시고, <b>동점이면 룰렛</b>으로 정해요.
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="👯" title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="👯" sub="곧 첫 질문! 우리 팀이 고를 것 같은 답을 골라요" />
  const r = syncResult(room, p)
  const marks = (row, upto) =>
    row.perQ.slice(0, upto).map((q, i) => (
      <i key={i} className={q.ok ? 'ok' : 'no'}>
        {q.ok ? '✓' : '✕'}
      </i>
    ))
  if (ph.phase === 'q' || ph.phase === 'reveal') {
    const q = ph.q
    const [a, b] = qs[q] || ['A', 'B']
    const ans = p.answers?.[`q${q}`] || {}
    const mine = ans[me]
    const myTeam = teamOf(room, me)
    const mates = teamMembers(room, myTeam)
    const picked = mates.filter((pid) => ans[pid]).length
    const asking = ph.phase === 'q'
    return (
      <div className="ai-overlay tg">
        <div className="tg-box">
          <div className="tg-head">
            <span>👯 질문 {q + 1}/{SYNC_QN}</span>
            <span className="tg-score">
              {r.rows.map((row) => (
                <span key={row.team} className="tg-score-team" style={{ '--tc': TEAM_INFO[row.team].color }}>
                  <i className="dot" />
                  {marks(row, asking ? q : q + 1)}
                </span>
              ))}
            </span>
          </div>
          {asking ? (
            <>
              <div className="tg-timer">
                <i style={{ width: `${Math.max(0, (ph.left / SYNC_ANSWER_MS) * 100)}%` }} />
              </div>
              <div className="tg-q">우리 팀이랑 같은 걸 골라요!</div>
              <div className="sync-opts">
                <button className={`sync-opt ${mine === 'A' ? 'on' : ''}`} onClick={() => syncAnswer(code, room, q, 'A')}>
                  {a}
                </button>
                <div className="vs">VS</div>
                <button className={`sync-opt ${mine === 'B' ? 'on' : ''}`} onClick={() => syncAnswer(code, room, q, 'B')}>
                  {b}
                </button>
              </div>
              <div className="ai-sub">
                {Math.ceil(ph.left / 1000)}초 · 우리 팀 {picked}/{mates.length}명 골랐어요{mine ? ' · 바꿔도 돼요' : ''}
              </div>
            </>
          ) : (
            <>
              <div className="tg-q">
                {a} <span className="vs-sm">vs</span> {b}
              </div>
              <div className="tg-rows">
                {r.rows.map((row) => {
                  const x = row.perQ[q]
                  return (
                    <div key={row.team} className={`tg-row ${x.ok ? 'win' : 'lose'}`} style={{ '--tc': TEAM_INFO[row.team].color }}>
                      <TeamChip t={row.team} small />
                      <span className="tg-row-main">{x.ok ? '이구동성! ✅' : '갈렸어요 ❌'}</span>
                      <span className="tg-row-sub">
                        {a} {x.a} · {b} {x.b}
                        {x.none ? ` · 안 고름 ${x.none}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
  // 끝: 결과
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="👯"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={r.rows.map((row) => ({
        team: row.team,
        main: `${row.score}/${SYNC_QN} 성공`,
        sub: <span className="tg-marks">{marks(row, SYNC_QN)}</span>,
      }))}
    />
  )
}

// ---------- 연타 줄다리기 ----------
// 30초 동안 버튼 연타. 팀원 1인당 평균 연타 수가 적은 팀이 마심 (동점 → 룰렛)
export function TapWarPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const countRef = useRef(0)
  const sentRef = useRef(0)
  const [count, setCount] = useState(0)
  const roomRef = useRef(room)
  roomRef.current = room
  const [pressed, setPressed] = useState(false)
  // 0.7초마다 내 연타 수를 기록 (다른 폰의 줄다리기 화면이 따라 움직임)
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      const n = serverNow()
      if (n >= p.startAt && n <= p.endAt + 400 && countRef.current !== sentRef.current) {
        sentRef.current = countRef.current
        tapReport(code, roomRef.current, countRef.current)
      }
    }, 700)
    return () => clearInterval(t)
  }, [live, p.startAt, p.endAt, code])
  // 끝나는 순간 마지막 기록
  useEffect(() => {
    if (!live || !p.endAt) return
    const t = setTimeout(() => tapReport(code, roomRef.current, countRef.current, true), Math.max(0, p.endAt - serverNow() + 120))
    return () => clearTimeout(t)
  }, [live, p.endAt, code])
  const title = p.title || '연타 줄다리기'
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="🪢"
        title={title}
        headline="30초 동안 연타! 줄을 당겨라"
        startLabel="🪢 시작"
        rules={
          <>
            시작하면 <b>30초 동안</b> 화면의 큰 버튼을 최대한 빨리 연타하세요. 연타할수록 줄이 우리 팀 쪽으로 와요. 끝나면 팀원 <b>1인당 평균 연타 수</b>가 적은 팀이 다 같이 마셔요 (인원이 달라도 공평). 동점이면 룰렛!
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="🪢" title={title} />
  if (now < p.startAt) return <CountScreen left={p.startAt - now} emoji="🪢" sub="준비! 엄지 두 개로 연타해도 돼요" />
  // 내 기록은 내 폰 숫자가 가장 최신
  const taps = { ...(p.taps || {}), [me]: Math.max(p.taps?.[me] || 0, count) }
  const live2 = tapResult(room, { ...p, taps })
  if (now >= p.endAt + TAP_SETTLE_MS - 300) {
    const r = tapResult(room, p)
    return (
      <TeamResult
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="🪢"
        title={title}
        losers={r.losers}
        tie={r.tie}
        rows={r.rows.map((row) => ({ team: row.team, main: `평균 ${row.avg.toFixed(1)}회`, sub: `합계 ${row.sum}회 · ${row.members.length}명` }))}
      />
    )
  }
  const playing = now < p.endAt
  const left = Math.max(0, p.endAt - now)
  const onTap = (e) => {
    e.preventDefault()
    const n = serverNow()
    if (n < p.startAt || n >= p.endAt) return
    countRef.current += 1
    setCount(countRef.current)
    setPressed(true)
  }
  const rows = live2.rows
  const two = rows.length === 2
  const sumAvg = rows.reduce((a, r) => a + r.avg, 0) || 1
  // 두 팀: 줄 매듭이 평균이 큰 팀 쪽으로 (-1 왼쪽 팀 ~ +1 오른쪽 팀)
  const pull = two ? (rows[1].avg - rows[0].avg) / sumAvg : 0
  const maxAvg = Math.max(1, ...rows.map((r) => r.avg))
  return (
    <div className="ai-overlay tg tapwar">
      <div className="tg-box">
        <div className="tg-head">
          <span>🪢 {title}</span>
          <span className={`tg-clock ${left < 5000 ? 'hot' : ''}`}>{playing ? `${(left / 1000).toFixed(1)}초` : '끝!'}</span>
        </div>
        {two ? (
          <div className="rope-wrap">
            <div className="rope-ends">
              <span style={{ color: TEAM_INFO[rows[0].team].color }}>
                {TEAM_INFO[rows[0].team].short} 평균 {Math.round(rows[0].avg)}
              </span>
              <span style={{ color: TEAM_INFO[rows[1].team].color }}>
                평균 {Math.round(rows[1].avg)} {TEAM_INFO[rows[1].team].short}
              </span>
            </div>
            <div className="rope" style={{ '--l': TEAM_INFO[rows[0].team].color, '--r': TEAM_INFO[rows[1].team].color }}>
              <i className="rope-mid" />
              <b className="rope-knot" style={{ left: `${50 + Math.max(-1, Math.min(1, pull)) * 42}%` }}>
                🪢
              </b>
            </div>
          </div>
        ) : (
          <div className="tap-bars">
            {rows.map((r) => (
              <div key={r.team} className="tap-bar" style={{ '--tc': TEAM_INFO[r.team].color }}>
                <TeamChip t={r.team} small />
                <span className="tap-bar-track">
                  <i style={{ width: `${(r.avg / maxAvg) * 100}%` }} />
                </span>
                <b>{Math.round(r.avg)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="tap-me">
          내 연타 <b>{count}</b>
        </div>
        <button
          className={`tap-pad ${pressed ? 'pressed' : ''}`}
          style={{ '--tc': TEAM_INFO[teamOf(room, me)]?.color }}
          disabled={!playing}
          onPointerDown={onTap}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {playing ? '연타!!' : '집계 중…'}
        </button>
      </div>
    </div>
  )
}

// ---------- 팀 반응속도 ----------
// 초록불이 되면 탭! 팀원 평균 반응 시간이 느린 팀이 마심 (부정출발·미참여 1.5초, 동점 → 룰렛)
export function TeamReactPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'armed'
  const now = useNow(live, 50)
  const title = p.title || '팀 반응속도'
  const go = live && p.goAt && now >= p.goAt
  const goRef = useRef(false)
  useEffect(() => {
    if (go && !goRef.current) buzz(120)
    goRef.current = !!go
  }, [go])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="⚡"
        title={title}
        headline="초록불이 되면 탭!"
        startLabel="⚡ 시작"
        rules={
          <>
            시작하면 모든 폰이 빨간 화면이 됐다가, 2~6초 뒤 아무 때나 초록색으로 바뀌어요. 그때 바로 탭! 팀원 <b>평균 반응 시간</b>이 느린 팀이 다 같이 마셔요. 초록불 전에 누르면 <b>부정출발</b>, 안 누르면 <b>미참여</b>로 1.5초로 계산돼요.
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="⚡" title={title} />
  if (teamReactDone(room, p, now)) {
    const r = teamReactResult(room, p)
    return (
      <TeamResult
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="⚡"
        title={title}
        losers={r.losers}
        tie={r.tie}
        rows={r.rows.map((row) => ({
          team: row.team,
          main: `평균 ${(row.avg / 1000).toFixed(3)}초`,
          sub: row.times.map((x) => `${room.players[x.pid]?.name} ${x.label}`).join(' · '),
        }))}
        note={`부정출발·미참여는 ${(REACT_PENALTY_MS / 1000).toFixed(1)}초로 계산`}
      />
    )
  }
  const mine = SOLO ? null : p.results?.[me]
  const tapped = mine != null
  const ids = liveTeams(room).flatMap((t) => teamMembers(room, t))
  const doneCount = ids.filter((pid) => p.results?.[pid] != null).length
  return (
    <div className={`ai-overlay react ${go ? 'go' : 'wait'}`} onPointerDown={() => !tapped && teamReactTap(code, room)}>
      <div className="ai-reveal">
        {tapped ? (
          <>
            <div className="react-big">{mine < 0 ? '🚫' : '✅'}</div>
            <div className="ai-congrats">{mine < 0 ? '부정출발!' : `${(mine / 1000).toFixed(3)}초`}</div>
            <div className="ai-sub">
              {doneCount}/{ids.length} 완료 · 다른 사람을 기다려요
            </div>
          </>
        ) : go ? (
          <>
            <div className="react-big">👆</div>
            <div className="ai-congrats big">탭!</div>
          </>
        ) : (
          <>
            <div className="react-big">✋</div>
            <div className="ai-congrats">기다리세요…</div>
            <div className="ai-sub">화면이 초록색으로 바뀌면 바로 탭! 먼저 누르면 부정출발 (우리 팀 평균이 느려져요)</div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- 폭탄 돌리기 팀전 ----------
// 주제에 맞는 단어를 말하고 '넘기기' → 다음 팀으로. 20~40초 사이 터질 때 폭탄을 든 팀이 마심
export function TeamBombPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'ticking'
  const now = useNow(live, 100)
  const title = p.title || '폭탄 돌리기 팀전'
  const st = bombState(p, now)
  const exploded = live && p.explodeAt && now >= p.explodeAt
  const boomRef = useRef(false)
  useEffect(() => {
    if (exploded && !boomRef.current) buzz([300, 100, 300, 100, 600])
    boomRef.current = !!exploded
  }, [exploded])
  const holdRef = useRef(null)
  useEffect(() => {
    if (!live) return
    if (holdRef.current !== null && holdRef.current !== st.holder && teamOf(room, me) === st.holder) buzz([60, 40, 60])
    holdRef.current = st.holder
  }, [live, st.holder])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="💣"
        title={title}
        headline={`주제: ${p.topic}`}
        startLabel="💣 폭탄 켜기"
        rules={
          <>
            <b style={{ color: TEAM_INFO[p.holder0]?.color }}>{TEAM_INFO[p.holder0]?.name}</b>부터 폭탄을 들어요. 폭탄을 든 팀은 주제에 맞는 단어를 하나 말하고 <b>넘기기</b>를 눌러 다음 팀에 넘겨요. 폭탄은 20~40초 사이 아무 때나 터지고, <b>그때 폭탄을 들고 있던 팀이 다 같이 마셔요.</b> 이미 나온 단어나 3초 넘게 뜸 들이면 그 팀이 마셔요.
          </>
        }
      />
    )
  if (exploded && now >= p.explodeAt + BOMB_SETTLE_MS) {
    const fin = bombState(p, p.explodeAt)
    return (
      <div className="ai-overlay bomb boom">
        <div className="ai-reveal">
          <div className="bomb-emo">💥</div>
          <div className="ai-congrats">터졌다!</div>
          <div className="ai-note">
            {p.topic} · {fin.count}번 넘김
          </div>
          <Avatars room={room} ids={teamMembers(room, fin.holder)} />
          <div className="ai-name">
            <b style={{ color: '#fff' }}>{TEAM_INFO[fin.holder]?.name}</b> 다 같이 마셔! 🍶
          </div>
          <div className="ai-actions">
            {ctl ? (
              <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
                확인
              </button>
            ) : (
              <div className="waiting">{room.players[p.playerId]?.name}이(가) 확인하면 다음 차례로</div>
            )}
          </div>
        </div>
      </div>
    )
  }
  const info = TEAM_INFO[st.holder] || TEAM_INFO[0]
  const mine = SOLO || teamOf(room, me) === st.holder
  const lockLeft = st.last ? BOMB_PASS_LOCK_MS - (now - st.last.at) : 0
  const nextTeam = (() => {
    const ts = liveTeams(room)
    const i = ts.indexOf(st.holder)
    return ts[(i + 1) % ts.length]
  })()
  return (
    <div className="ai-overlay bomb team-bomb" style={{ '--tc': info.color }}>
      <div className="ai-reveal">
        {exploded ? (
          <div className="bomb-emo">💥</div>
        ) : (
          <div className="bomb-emo ticking">💣</div>
        )}
        <div className="ai-note">주제</div>
        <div className="bomb-topic">{p.topic}</div>
        <div className="bomb-holder">
          지금 폭탄: <b style={{ color: info.color }}>{info.name}</b>
          {st.last && <span className="muted-light"> · {room.players[st.last.pid]?.name} 넘김</span>}
        </div>
        <div className="ai-sub">넘긴 횟수 {st.count}번</div>
        {mine ? (
          <button className="btn btn-primary bomb-pass" disabled={!!exploded || lockLeft > 0} onClick={() => bombPass(code, room)}>
            말했다! 넘기기 → {TEAM_INFO[nextTeam]?.short}
          </button>
        ) : (
          <div className="bomb-wait">
            {info.name}이 말하는 중… <b>다음은 {TEAM_INFO[nextTeam]?.short}</b>
          </div>
        )}
      </div>
    </div>
  )
}
