// 팀 대결 미니게임 화면: 팀 이구동성 · 연타 줄다리기 · 팀 반응속도 · 폭탄 돌리기 팀전 · 색깔 함정 · 완벽한 원 · 얼마게요 · 팀 시간 합치기 · 지도 찍기 · 세계 지도 찍기
// 모두 자기 폰으로 동시에 참여하고, 진 팀 전원이 마심. 동점이면 룰렛.
// 시간은 서버 시각(serverNow) 기준이라 모든 폰이 같은 순간에 같은 화면을 봄
import { useEffect, useMemo, useRef, useState } from 'react'
import { SOLO, PRACTICE } from '../db'
import { TEAM_INFO } from '../game/yut'
import { SYNC_QUESTIONS, CT_COLORS } from '../game/teamgames'
import { scoreShape, circleAccuracy, circleComment, fakeShape, seeded, shapeName, CIRCLE_GAME, resultVerts, polyVerts } from '../game/circle'
import { PRICE_ITEMS, PRICE_BASE, PRICE_STEPS, pricePoints, won } from '../game/prices'
import { PLACES } from '../game/places'
import { MAP_W, MAP_H, MAP_KR, MAP_NK, MAP_JP, MAP_DO, ISLAND_DOTS, toXY } from '../game/mapdata'
import {
  arr,
  ini,
  myId,
  teamName,
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
  bombExploded,
  BOMB_SETTLE_MS,
  practiceEnd,
  practiceCancel,
  colorPhase,
  colorResult,
  colorAnswer,
  colorAnswerOf,
  colorPoints,
  CT_ROUNDS,
  CT_ANSWER_MS,
  CT_WRONG,
  circlePhase,
  circleResult,
  circleSubmit,
  CIRCLE_MS,
  pricePhase,
  priceAnswer,
  priceAnswerOf,
  priceResult,
  PG_ROUNDS,
  PG_ANSWER_MS,
  timeSumPhase,
  timeSumResult,
  holdSubmit,
  TS_TARGET_MS,
  mapPhase,
  mapAnswer,
  mapAnswerOf,
  mapResult,
  MP_ROUNDS,
  MP_ANSWER_MS,
  worldPhase,
  worldAnswer,
  worldAnswerOf,
  worldResult,
  WP_ROUNDS,
  WP_ANSWER_MS,
  mqPhase,
  mqN,
  mqWinner,
  mqAnswer,
  mqPass,
  mqPassInfo,
  mqDrive,
  mqResult,
} from '../room'
import { MQ_INFO, MQ_CATS, MQ_STAGES, MQ_STAGE_NAMES, MQ_STAGE_SHORT, MQ_WIN_TEXT, MQ_STAGE_TIMEOUT_MS, MQ_CLIP_MS, MQ_CLIP_FROM, MQ_REVEAL_CLIP_MS, MQ_ROUNDS, MQ_CHART_PICK, mqRounds, mqItem, movieHint, emojiList, isTitleAnswer, chosungHint } from '../game/mediaquiz'
import { mqUnlock, mqPlay, mqPrime, mqStop } from '../game/mqaudio'
import { WORLD_PLACES, worldPoints } from '../game/worldplaces'
import { WORLD_W, WORLD_H, toWorldXY } from '../game/worldgeo'

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
          {ini(room.players[pid]?.name)}
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
// onStart: 시작 버튼을 따로 처리할 때 (노래·영화 맞히기: 소리 잠금 풀기 + 노래 미리듣기 찾기), busy: 찾는 중이면 버튼 막기
function ReadyModal({ room, p, ctl, emoji, title, headline, rules, startLabel, code, extra, onStart, busy }) {
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
        {/* 걸린 사람이 연결 끊겨서 방장이 대신 시작할 때 */}
        {ctl && !SOLO && p.playerId !== myId() && <div className="shield-proxy">{actor?.name}이(가) 연결이 끊겨서 방장이 대신 시작해요</div>}
        <div className="actions">
          {PRACTICE && (
            <button className="btn btn-ghost" onClick={() => practiceCancel(code, room)}>
              ← 다른 게임
            </button>
          )}
          {ctl ? (
            <button className="btn btn-primary" disabled={!!busy} onClick={() => (onStart ? onStart() : resolvePending(code, room, 'start'))}>
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
function TeamResult({ room, p, ctl, code, emoji, title, rows, losers, tie, note, extra }) {
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
        {extra}
        {note && <div className="ai-note">{note}</div>}
        {tie ? (
          <div className="ai-name">
            동점! <b>룰렛</b>으로 마실 팀을 정해요 🎡
          </div>
        ) : (
          <>
            <Avatars room={room} ids={teamMembers(room, loser)} />
            <div className="ai-name">
              <b style={{ color: TEAM_INFO[loser]?.color }}>{teamName(room, loser)}</b> 다 같이 마셔! 🍶
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
              <i className="sw" style={{ background: TEAM_INFO[t]?.color }} /> {teamName(room, t)}
            </span>
          ))}
        </div>
        <div className="ai-name">
          {done ? (
            <>
              <b style={{ color: TEAM_INFO[loser]?.color }}>{teamName(room, loser)}</b> 다 같이 마셔! 🍶
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
        emoji="🦦"
        title={title}
        headline="30초 동안 연타! 줄을 당겨라"
        startLabel="🦦 시작"
        rules={
          <>
            시작하면 <b>30초 동안</b> 화면의 큰 버튼을 최대한 빨리 연타하세요. 연타할수록 줄이 우리 팀 쪽으로 와요. 끝나면 팀원 <b>1인당 평균 연타 수</b>가 적은 팀이 다 같이 마셔요 (인원이 달라도 공평). 동점이면 룰렛!
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="🦦" title={title} />
  if (now < p.startAt) return <CountScreen left={p.startAt - now} emoji="🦦" sub="준비! 엄지 두 개로 연타해도 돼요" />
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
        emoji="🦦"
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
          <span>🦦 {title}</span>
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
                🦦
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
  const mine = SOLO && !PRACTICE ? null : p.results?.[me]
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
// 오프라인으로 진행: 팀끼리 돌아가며 주제에 맞는 단어를 말함 (폰은 그냥 둠). 화면엔 째깍째깍 폭탄만 → 20~40초 사이 아무 때나 펑!
// 터지면 진행자(도착한 사람·방장)가 그때 말할 차례였던 팀을 고름 → 그 팀 전원이 마심
export function TeamBombPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'ticking'
  const now = useNow(live, 200)
  const title = p.title || '폭탄 돌리기 팀전'
  const exploded = bombExploded(p, now)
  const boomRef = useRef(false)
  useEffect(() => {
    if (exploded && !boomRef.current) buzz([300, 100, 300, 100, 600])
    boomRef.current = !!exploded
  }, [exploded])
  const starter = TEAM_INFO[p.holder0] || TEAM_INFO[0]
  const actor = room.players[p.playerId]
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
            폭탄을 켜면 <b style={{ color: starter.color }}>{teamName(room, p.holder0 ?? 0)}</b>부터 팀끼리 돌아가며 주제에 맞는 단어를 <b>말로</b> 하나씩 말해요 (폰은 그냥 두세요). 폭탄은 <b>20~40초 사이 아무 때나</b> 터지고, 그때 얘기하고 있던 팀이 다 같이 마셔요. 이미 나온 단어나 3초 넘게 뜸 들이면 그 팀이 마셔요.
          </>
        }
      />
    )
  // 째깍째깍 (터질 때까지 시간은 안 보임)
  if (!exploded)
    return (
      <div className="ai-overlay bomb team-bomb">
        <div className="ai-reveal">
          <div className="bomb-emo ticking">
            💣
            <i className="bomb-spark" />
          </div>
          <div className="ai-note">주제</div>
          <div className="bomb-topic">{p.topic}</div>
          <div className="bomb-holder">
            <b style={{ color: starter.color }}>{teamName(room, p.holder0 ?? 0)}</b>부터 팀끼리 돌아가며 말해요
          </div>
          <div className="bomb-tick">째깍… 째깍…</div>
          <div className="ai-sub">언제 터질지 아무도 몰라요</div>
        </div>
      </div>
    )
  // 펑!
  if (now < p.explodeAt + BOMB_SETTLE_MS)
    return (
      <div className="ai-overlay bomb boom flash">
        <div className="ai-reveal">
          <div className="bomb-emo big">💥</div>
          <div className="ai-congrats big">펑!</div>
        </div>
      </div>
    )
  // 혼자 연습: 마실 팀 고르기 없이 몇 초 만에 터졌는지만
  if (PRACTICE) {
    const sec = Math.round((p.explodeAt - (p.startAt || p.explodeAt)) / 1000)
    return (
      <div className="ai-overlay bomb boom">
        <div className="ai-reveal">
          <div className="bomb-emo">💥</div>
          <div className="ai-congrats">{sec}초 만에 펑!</div>
          <div className="ai-note">주제: {p.topic}</div>
          <div className="ai-sub">실제 게임에서는 터질 때 얘기하고 있던 팀이 다 같이 마셔요</div>
          <div className="ai-actions">
            <button className="btn btn-primary" onClick={() => practiceEnd(code, `💣 연습: ${sec}초 만에 펑!`)}>
              확인
            </button>
          </div>
        </div>
      </div>
    )
  }
  // 펑 뒤: 마실 팀은 안 고름 — 그때 얘기하고 있던 팀이 오프라인으로 마시고 확인 (잔 수 집계는 안 함)
  return (
    <div className="ai-overlay bomb boom">
      <div className="ai-reveal">
        <div className="bomb-emo">💥</div>
        <div className="ai-congrats">펑! 터졌어요</div>
        <div className="ai-note">주제: {p.topic}</div>
        <div className="ai-name bomb-drink">얘기하고 있던 팀이 마셔! 🍶</div>
        <div className="ai-actions">
          {ctl ? (
            <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
              확인
            </button>
          ) : (
            <div className="waiting">{actor?.name}이(가) 확인하면 다음 차례로</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- 색깔 함정 (스트룹) ----------
// 색 이름이 다른 색으로 칠해져 나옴 → 글자 '뜻' 말고 '글자 색깔'을 5초 안에. 5라운드, 빨리 맞힐수록 높은 점수
// 점수: 정답 1000(바로) → 100(5초 직전) · 틀리면 -300 · 시간 초과 0. 5라운드 끝나고 팀 합계 공개 → 낮은 팀이 마심 (동점 → 룰렛)
export function ColorTrapPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 50)
  const ph = colorPhase(p, now)
  const title = p.title || '색깔 함정'
  const rounds = arr(p.rounds)
  const [local, setLocal] = useState({}) // 내가 누른 답 (서버 반영 전에도 바로 보이게)
  const sentRef = useRef({}) // 문제마다 한 번만
  const qRef = useRef(null)
  useEffect(() => {
    if (ph.phase === 'q' && qRef.current !== ph.q) {
      qRef.current = ph.q
      buzz(50)
    }
  }, [ph.phase, ph.q])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="🎨"
        title={title}
        headline="글자 말고 색깔을 골라!"
        startLabel="🎨 시작"
        extra={
          <div className="ct-example">
            <span className="ct-ex-word" style={{ color: CT_COLORS[1].hex }}>
              {CT_COLORS[0].name}
            </span>
            <span className="ct-ex-arrow">→ 정답은</span>
            <b>{CT_COLORS[1].name}</b>
          </div>
        }
        rules={
          <>
            색 이름이 <b>다른 색으로</b> 칠해져 나와요. 글자 뜻 말고 <b>글자 색깔</b>을 5초 안에 고르세요. 모두 {CT_ROUNDS}문제, <b>빨리 맞힐수록 점수가 커요</b> (바로 1000점 → 5초 100점). <b>틀리면 {CT_WRONG}점</b>, 시간 초과는 0점. 보기 글자도 다른 색으로 칠해져 있어요. 마지막 두 문제는 <b>함정 강화</b> — 글자 뜻과 같은 보기가 정답 색으로 칠해져요! 끝나면 팀 점수 합계를 공개하고, 낮은 팀이 다 같이 마셔요. 동점이면 룰렛!
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="🎨" title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="🎨" sub="글자 뜻 말고 글자 색깔!" />
  if (ph.phase === 'q' || ph.phase === 'gap') {
    const q = ph.q
    const r = rounds[q] || { w: 0, i: 1, o: [0, 1, 2, 3] }
    const server = colorAnswerOf(p, q, me)
    const lp = local[q]
    const mine = server || (lp ? { c: lp.c, ok: lp.c === r.i, pts: colorPoints(lp.c === r.i, lp.ms) } : null)
    // 내 점수 (지금 문제까지): 팀 점수는 문제가 다 끝나야 공개
    const myTotal = Array.from({ length: q }, (_, k) => colorAnswerOf(p, k, me)?.pts || 0).reduce((a, b) => a + b, 0) + (mine?.pts || 0)
    const asking = ph.phase === 'q'
    const myTeam = teamOf(room, me)
    const mates = teamMembers(room, myTeam)
    const done = mates.filter((pid) => p.answers?.[`r${q}`]?.[pid] || (pid === me && mine)).length
    const pickColor = (c) => {
      if (!asking || mine || sentRef.current[q]) return
      sentRef.current[q] = true
      setLocal((x) => ({ ...x, [q]: { c, ms: Math.max(0, Math.round(serverNow() - ph.at)) } }))
      colorAnswer(code, room, q, c)
    }
    return (
      <div className="ai-overlay tg colortrap">
        <div className="tg-box">
          <div className="tg-head">
            <span>
              🎨 문제 {q + 1}/{CT_ROUNDS}
              {q >= CT_ROUNDS - 2 ? <em className="ct-hard"> 함정 강화!</em> : null}
            </span>
            <span className="tg-score">내 점수 {myTotal}</span>
          </div>
          {asking ? (
            <div className="tg-timer">
              <i style={{ width: `${Math.max(0, (ph.left / CT_ANSWER_MS) * 100)}%` }} />
            </div>
          ) : (
            <div className="tg-timer done" />
          )}
          <div className="ct-word" style={{ color: CT_COLORS[r.i]?.hex }}>
            {CT_COLORS[r.w]?.name}
          </div>
          <div className="tg-q">
            글자 <b>색깔</b>은?
          </div>
          <div className="ct-opts">
            {arr(r.o).map((c, j) => {
              const picked = mine?.c === c
              const reveal = !asking || !!mine
              return (
                <button
                  key={c}
                  className={`ct-opt ${picked ? 'on' : ''} ${reveal && c === r.i ? 'right' : ''} ${reveal && picked && c !== r.i ? 'wrong' : ''}`}
                  style={r.oi ? { color: CT_COLORS[arr(r.oi)[j]]?.hex } : undefined}
                  disabled={!asking || !!mine}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    pickColor(c)
                  }}
                  onClick={() => pickColor(c)}
                >
                  {CT_COLORS[c]?.name}
                </button>
              )
            })}
          </div>
          <div className={`ct-fb ${mine ? (mine.ok ? 'ok' : 'no') : ''}`}>
            {mine ? (mine.ok ? `정답! +${mine.pts}점` : `함정에 걸렸어요! ${mine.pts}점`) : asking ? `${Math.ceil(ph.left / 1000)}초 · 우리 팀 ${done}/${mates.length}명 골랐어요` : '시간 초과! 0점'}
          </div>
          {!asking && (
            <div className="ai-sub">
              정답 <b style={{ color: CT_COLORS[r.i]?.hex }}>{CT_COLORS[r.i]?.name}</b> · {q + 1 < CT_ROUNDS ? '다음 문제…' : '결과 공개!'}
            </div>
          )}
        </div>
      </div>
    )
  }
  // 끝: 결과 (팀 합계 공개)
  const r = colorResult(room, p)
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="🎨"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={r.rows.map((row) => ({
        team: row.team,
        main: r.byAvg ? `평균 ${Math.round(row.avg)}점` : `${row.sum}점`,
        sub: row.per.map((x) => `${room.players[x.pid]?.name} ${x.total}`).join(' · ') + (r.byAvg ? ` · 합계 ${row.sum}` : ''),
      }))}
      note={r.byAvg ? '팀 인원이 달라서 1인 평균으로 비교해요' : r.mvp ? `🏅 MVP ${room.players[r.mvp.pid]?.name} ${r.mvp.total}점 (${r.mvp.ok}/${CT_ROUNDS} 정답)` : ''}
    />
  )
}

// ---------- 완벽한 원 ----------
// 15초 안에 손가락으로 원을 한 번에 (손 떼면 끝). 동그란 정도 0~100점 (그린 폰이 채점 → circle.js), 팀 평균이 낮은 팀이 마심 (동점 → 룰렛)
// 결과 화면에 모두가 그린 원을 같이 보여 줌
function CirclePic({ r, color, size = 64, n = 0 }) {
  const pts = arr(r?.pts)
  const xy = []
  for (let i = 0; i + 1 < pts.length; i += 2) xy.push(`${(pts[i] / 10).toFixed(1)},${(pts[i + 1] / 10).toFixed(1)}`)
  const c = arr(r?.c)
  const V = Number(n) >= 3 ? resultVerts(r, n) : null // 정n각형: 가장 잘 맞는 정n각형
  return (
    <svg className="circle-pic" viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {V ? <polygon className="circle-ideal" points={V.map(([x, y]) => `${(x / 10).toFixed(1)},${(y / 10).toFixed(1)}`).join(' ')} /> : c.length === 3 && <circle className="circle-ideal" cx={c[0] / 10} cy={c[1] / 10} r={c[2] / 10} />}
      {xy.length > 1 && <polyline points={xy.join(' ')} fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
// 도형 그림 (시작 화면): 원 / 정n각형 (꼭짓점 하나가 위로)
function ShapeIcon({ n, size = 56, color = '#ffd166' }) {
  const V = Number(n) >= 3 ? polyVerts(50, Number(n) === 3 ? 56 : 50, 40, -Math.PI / 2 + (Number(n) === 4 ? Math.PI / 4 : 0), Number(n)) : null
  return (
    <svg className="shape-icon" viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {V ? <polygon points={V.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="6" strokeLinejoin="round" /> : <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="6" />}
    </svg>
  )
}
const pairs = (flat) => {
  const a = arr(flat)
  const out = []
  for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]])
  return out
}
// 정확도에 따라 선 색: 초록(잘 맞음) → 노랑 → 빨강
const devColor = (d) => (d < 0.035 ? '#3be38b' : d < 0.08 ? '#ffd166' : '#ff5d6c')

function CircleDraw({ room, p, me, code, left }) {
  const canvasRef = useRef(null)
  const ptsRef = useRef([]) // 그리는 중인 점 (0~1000 좌표)
  const drawingRef = useRef(false)
  const rafRef = useRef(0)
  const resRef = useRef(null)
  const sentRef = useRef(false)
  const [live, setLive] = useState(null) // 그리는 중 정확도
  const [msg, setMsg] = useState('')
  const [mine, setMine] = useState(null)
  const server = p.results?.[me] || null
  const result = mine || (server ? { s: server.s, pts: server.pts, c: server.c, a: server.a } : null)
  const n = Number(p.shape) || 0 // 0 원 · 3~6 정n각형
  resRef.current = result
  const myTeam = teamOf(room, me)
  const color = TEAM_INFO[myTeam]?.color || '#ff7a1a'
  const now = serverNow()
  const mates = teamMembers(room, myTeam)
  const done = mates.filter((pid) => (p.results?.[pid] && (p.results[pid].at || 0) <= now) || (pid === me && result)).length

  const redraw = () => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const W = cv.width
    const k = W / 1000
    ctx.clearRect(0, 0, W, W)
    // 가운데 점 (둘러서 그리라는 표시)
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.arc(500 * k, 500 * k, 9 * k, 0, Math.PI * 2)
    ctx.fill()
    const res = resRef.current
    const pts = res ? pairs(res.pts) : ptsRef.current
    if (pts.length < 2) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 15 * k
    if (res) {
      // 다 그린 원: 가장 잘 맞는 원(점선) 위에 내 원 · 정n각형이면 가장 잘 맞는 정n각형(점선)
      const c = arr(res.c)
      const V = n >= 3 ? resultVerts(res, n) : null
      if (c.length === 3) {
        ctx.save()
        ctx.setLineDash([16 * k, 14 * k])
        ctx.lineWidth = 5 * k
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'
        ctx.beginPath()
        if (V) {
          V.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)))
          ctx.closePath()
        } else ctx.arc(c[0] * k, c[1] * k, c[2] * k, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 18 * k
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)))
      ctx.closePath()
      ctx.stroke()
      ctx.shadowBlur = 0
      return
    }
    // 그리는 중: 지금까지 그린 선에 맞는 원 기준으로 구간마다 색 (정n각형은 다 그린 뒤에 채점 — 그리는 중엔 우리 팀 색)
    const a = n ? null : circleAccuracy(pts)
    const c = a?.c
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      ctx.strokeStyle = c ? devColor(Math.abs(Math.hypot(x1 - c.cx, y1 - c.cy) - c.r) / c.r) : n ? color : '#ffffff'
      ctx.beginPath()
      ctx.moveTo(x0 * k, y0 * k)
      ctx.lineTo(x1 * k, y1 * k)
      ctx.stroke()
    }
    setLive(a ? a.acc : null)
  }
  const schedule = () => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      redraw()
    })
  }
  // 그림판 크기 = 화면 크기 × 화소 비율
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const fit = () => {
      const w = cv.clientWidth || 300
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(w * dpr)
      redraw()
    }
    fit()
    window.addEventListener('resize', fit)
    return () => {
      window.removeEventListener('resize', fit)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])
  useEffect(() => {
    if (server && !mine) schedule() // 다른 탭(같은 사람)에서 낸 경우
  }, [!!server])

  const toLocal = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * 1000, ((e.clientY - rect.top) / rect.height) * 1000]
  }
  const finish = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const res = scoreShape(ptsRef.current, n)
    if (!res.ok) {
      setMsg(res.why === 'small' ? '너무 작아요! 크게 다시' : res.why === 'short' ? `${shapeName(n)}을 그려 주세요!` : '손 떼지 말고 한 바퀴 다 그려요!')
      ptsRef.current = []
      setLive(null)
      buzz(30)
      schedule()
      return
    }
    resRef.current = res
    setMine(res)
    setLive(null)
    setMsg('')
    if (!sentRef.current) {
      sentRef.current = true
      circleSubmit(code, room, res)
    }
    buzz([60, 40, 60])
    schedule()
  }
  // 그리는 중에 시간이 끝나면 그린 데까지 채점
  useEffect(() => {
    if (left <= 0 && drawingRef.current) finish()
  }, [left <= 0])
  const onDown = (e) => {
    if (resRef.current || left <= 0) return
    e.preventDefault()
    try {
      canvasRef.current.setPointerCapture(e.pointerId)
    } catch {}
    drawingRef.current = true
    ptsRef.current = [toLocal(e)]
    setMsg('')
    schedule()
  }
  const onMove = (e) => {
    if (!drawingRef.current) return
    const ne = e.nativeEvent
    const evs = ne.getCoalescedEvents ? ne.getCoalescedEvents() : []
    ;(evs.length ? evs : [ne]).forEach((ev) => ptsRef.current.push(toLocal(ev)))
    schedule()
  }
  const timeUp = left <= 0 && !result
  return (
    <div className="ai-overlay tg circle">
      <div className="tg-box">
        <div className="tg-head">
          <span>⭕ {shapeName(n)} 그리기</span>
          <span className="tg-score">{result ? `${result.s.toFixed(1)}점` : live != null ? `정확도 ${live.toFixed(1)}%` : `${Math.ceil(left / 1000)}초`}</span>
        </div>
        <div className={`tg-timer ${result || timeUp ? 'done' : ''}`}>
          <i style={{ width: `${Math.max(0, Math.min(100, (left / CIRCLE_MS) * 100))}%` }} />
        </div>
        <canvas
          ref={canvasRef}
          className={`circle-pad ${result ? 'done' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        <div className={`circle-fb ${result ? 'ok' : msg || timeUp ? 'no' : ''}`}>
          {result ? `${circleComment(result.s, n)}` : timeUp ? '시간 초과! 0점' : msg || (n ? `가운데 점을 둘러서, 손 떼지 말고 ${shapeName(n)} 한 바퀴! 꼭짓점은 뾰족하게` : '가운데 점을 둘러서, 손 떼지 말고 한 바퀴!')}
        </div>
        <div className="ai-sub">
          {result ? '다른 사람을 기다려요 · ' : ''}우리 팀 {done}/{mates.length}명 그렸어요
        </div>
      </div>
    </div>
  )
}

export function CirclePanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const n = Number(p.shape) || 0 // 10/16: 게임마다 원·정삼각형~정육각형 중 하나
  const title = CIRCLE_GAME // 10/22: 게임 이름은 '완벽한 도형 그리기', 이번 도형은 제목 줄에
  const sname = shapeName(n)
  const ex = useMemo(() => [fakeShape(n, seeded(44)), fakeShape(n, seeded(121))], [n])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="⭕"
        title={title}
        headline={n ? `이번엔 ${sname}! 한 번에 그려요` : '이번엔 원! 한 번에 동그랗게'}
        startLabel={`⭕ ${sname} 그리기 시작`}
        extra={
          <div className="circle-example">
            <div className="circle-cell shape-target">
              <ShapeIcon n={n} size={72} />
              <b>{sname}</b>
            </div>
            {ex.map((r, i) => (
              <div key={i} className="circle-cell">
                <CirclePic r={r} n={n} color={i ? '#ff5d6c' : '#3be38b'} size={72} />
                <b>{r.s.toFixed(1)}점</b>
              </div>
            ))}
          </div>
        }
        rules={
          n ? (
            <>
              시작하면 <b>{CIRCLE_MS / 1000}초</b> 안에 손가락으로 <b>{sname}</b>을 <b>한 번에</b> 그려요 (손 떼면 끝). 점수(0~100) = <b>모양</b> × <b>꼭짓점</b> × <b>한 바퀴</b>: 가장 잘 맞는 {sname}과 비교해서 선이 테두리에서 평균 몇 % 벗어났는지 (2% 92점 · 5% 82점 · 10% 67점), 꼭짓점 {n}개가 {sname}처럼 튀어나왔는지 (동그랗게 그리면 크게 감점), 한 바퀴를 다 돌았는지. 너무 작거나 반 바퀴도 안 되면 다시 그려요. 팀원 <b>평균 점수</b>가 낮은 팀이 다 같이 마셔요. 동점이면 룰렛!
            </>
          ) : (
            <>
              시작하면 <b>{CIRCLE_MS / 1000}초</b> 안에 손가락으로 원을 <b>한 번에</b> 그려요 (손 떼면 끝). 가장 잘 맞는 원과 비교해서 선이 평균 몇 % 벗어났는지로 <b>0~100점</b> (2% 92점 · 5% 82점 · 10% 67점)! 한 바퀴를 다 못 돌면 감점, 너무 작거나 반 바퀴도 안 되면 다시 그려요. 팀원 <b>평균 점수</b>가 낮은 팀이 다 같이 마셔요. 동점이면 룰렛!
            </>
          )
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="⭕" title={title} />
  const ph = circlePhase(room, p, now)
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="⭕" sub={`손가락으로 ${sname} 한 번! 손 떼지 말고`} />
  if (ph.phase === 'draw') return <CircleDraw room={room} p={p} me={me} code={code} left={ph.left} />
  const r = circleResult(room, p)
  const name = (pid) => room.players[pid]?.name || ''
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="⭕"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={r.rows.map((row) => ({
        team: row.team,
        main: `평균 ${row.avg.toFixed(1)}점`,
        sub: row.per.map((x) => `${name(x.pid)} ${x.none ? '미참여' : x.s.toFixed(1)}`).join(' · '),
      }))}
      extra={
        <div className="circle-gallery">
          {r.rows.flatMap((row) =>
            row.per.map((x) => (
              <div key={x.pid} className={`circle-cell ${r.mvp?.pid === x.pid ? 'mvp' : ''}`} style={{ '--tc': TEAM_INFO[row.team]?.color }}>
                {x.r ? <CirclePic r={x.r} n={n} color={TEAM_INFO[row.team]?.color} size={58} /> : <div className="circle-none">✋</div>}
                <span>{name(x.pid)}</span>
                <b>{x.none ? '미참여' : x.s.toFixed(1)}</b>
              </div>
            )),
          )}
        </div>
      }
      note={r.mvp ? `🏅 MVP ${name(r.mvp.pid)} ${r.mvp.s.toFixed(1)}점 — ${circleComment(r.mvp.s, n)}` : ''}
    />
  )
}

// 문제마다 낸 답이 지금 보이는지 (혼자 연습 가짜 참가자 답은 미리 채워 두고 ms 가 지나야 보임)
const answeredNow = (p, q, pid, at, now) => {
  const a = p.answers?.[`r${q}`]?.[pid]
  return !!a && (a.ms == null || at + a.ms <= now)
}
// 팀 점수 결과 줄 (얼마게요·지도 찍기)
const pointRows = (room, r) =>
  r.rows.map((row) => ({
    team: row.team,
    main: r.byAvg ? `평균 ${Math.round(row.avg)}점` : `${row.sum.toLocaleString('ko-KR')}점`,
    sub: row.per.map((x) => `${room.players[x.pid]?.name} ${x.total.toLocaleString('ko-KR')}`).join(' · ') + (r.byAvg ? ` · 합계 ${row.sum.toLocaleString('ko-KR')}` : ''),
  }))

// ---------- 얼마게요 (편의점 가격) ----------
// 3문제 × 15초 (10/31 5 → 3), 숫자 키패드로 가격 입력 → 확인. 정답과 차이(%)가 작을수록 점수 (20% = 500점), 팀 점수 낮은 팀이 마심
export function PricePanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const ph = pricePhase(p, now)
  const title = p.title || '얼마게요'
  const rounds = arr(p.rounds)
  const [typed, setTyped] = useState({}) // 문제별 입력 중인 숫자 (문자열)
  const [sent, setSent] = useState({}) // 문제별 낸 값 (서버 반영 전에도 바로 보이게)
  const sentRef = useRef({})
  const qRef = useRef(null)
  useEffect(() => {
    if (ph.phase === 'q' && qRef.current !== ph.q) {
      qRef.current = ph.q
      buzz(50)
    }
  }, [ph.phase, ph.q])
  // 시간이 끝났는데 입력만 해 두고 안 냈으면 그 값으로 냄
  useEffect(() => {
    if (ph.phase !== 'gap') return
    const q = ph.q
    const v = Number(typed[q] || 0)
    if (v > 0 && !sentRef.current[q] && !p.answers?.[`r${q}`]?.[me]) {
      sentRef.current[q] = true
      setSent((x) => ({ ...x, [q]: v }))
      priceAnswer(code, room, q, v)
    }
  }, [ph.phase, ph.q])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="💰"
        title={title}
        headline="편의점 가격, 얼마게요?"
        startLabel="💰 시작"
        extra={
          <div className="pg-scale">
            {PRICE_STEPS.map((v, i) => (
              <span key={i}>
                {(i + 1) * 10}% <b>{v}</b>
              </span>
            ))}
            <span>
              넘으면 <b>0</b>
            </span>
          </div>
        }
        rules={
          <>
            편의점 물건이 나오면 <b>숫자 키패드</b>로 가격을 넣고 확인! 모두 {PG_ROUNDS}문제, 문제마다 {PG_ANSWER_MS / 1000}초. 정답과 <b>가까울수록 점수가 커요</b> — 차이가 10% 이내면 1000점, 20% 이내 900점… 10%마다 100점씩 줄어서 100% 이내 100점, 그보다 크면 0점 (위 표). 문제마다 정답과 내 점수가 나오고, 끝나면 팀 점수를 공개해서 낮은 팀이 다 같이 마셔요. 가격은 {PRICE_BASE}.
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="💰" title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="💰" sub="편의점 가격, 얼마게요?" />
  if (ph.phase === 'q' || ph.phase === 'gap') {
    const q = ph.q
    const item = PRICE_ITEMS[rounds[q]] || PRICE_ITEMS[0]
    const asking = ph.phase === 'q'
    const server = priceAnswerOf(p, q, me)
    const mine = server || (sent[q] ? { v: sent[q], pts: pricePoints(sent[q], item.price) } : null)
    // 내 점수: 정답이 공개된 문제까지만
    const shownQ = asking ? q : q + 1
    const myTotal = Array.from({ length: shownQ }, (_, k) => priceAnswerOf(p, k, me)?.pts || (k === q && mine ? mine.pts : 0)).reduce((a, b) => a + b, 0)
    const myTeam = teamOf(room, me)
    const mates = teamMembers(room, myTeam)
    const done = mates.filter((pid) => answeredNow(p, q, pid, ph.at, now) || (pid === me && mine)).length
    const str = typed[q] || ''
    const press = (k) => {
      if (!asking || mine) return
      setTyped((x) => {
        const cur = x[q] || ''
        let next = cur
        if (k === 'del') next = cur.slice(0, -1)
        else if (cur.length < 7) next = (cur + k).replace(/^0+/, '')
        return { ...x, [q]: next.slice(0, 7) }
      })
    }
    const submit = () => {
      const v = Number(str)
      if (!asking || !(v > 0) || mine || sentRef.current[q]) return
      sentRef.current[q] = true
      setSent((x) => ({ ...x, [q]: v }))
      priceAnswer(code, room, q, v)
      buzz(40)
    }
    const diff = mine ? Math.round((Math.abs(mine.v - item.price) / item.price) * 100) : null
    return (
      <div className="ai-overlay tg price">
        <div className="tg-box">
          <div className="tg-head">
            <span>
              💰 {q + 1}/{PG_ROUNDS}
            </span>
            <span className="tg-score">내 점수 {myTotal.toLocaleString('ko-KR')}</span>
          </div>
          <div className={`tg-timer ${asking ? '' : 'done'}`}>{asking && <i style={{ width: `${Math.max(0, (ph.left / PG_ANSWER_MS) * 100)}%` }} />}</div>
          <div className="pg-item">
            <span className="pg-emo">{item.emoji}</span>
            <b>{item.name}</b>
            <em>{item.unit}</em>
          </div>
          {asking ? (
            <>
              <div className={`pg-val ${mine ? 'sent' : str ? '' : 'empty'}`}>{mine ? won(mine.v) : str ? won(str) : '얼마일까?'}</div>
              <div className="pg-pad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'].map((k) => (
                  <button key={k} className="pg-key" disabled={!!mine} onClick={() => press(k)}>
                    {k === 'del' ? '⌫' : k}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary pg-ok" disabled={!!mine || !(Number(str) > 0)} onClick={submit}>
                {mine ? `✅ 냈어요 · 우리 팀 ${done}/${mates.length}명` : '확인'}
              </button>
              {!mine && <div className="ai-sub">{Math.ceil(ph.left / 1000)}초 · 우리 팀 {done}/{mates.length}명 냈어요</div>}
            </>
          ) : (
            <>
              <div className="pg-answer">
                정답 <b>{won(item.price)}</b>
              </div>
              <div className={`ct-fb ${mine ? 'ok' : 'no'}`}>{mine ? `${won(mine.v)} · ${diff}% 차이 · +${mine.pts}점` : '시간 초과! 0점'}</div>
              <div className="ai-sub">{q + 1 < PG_ROUNDS ? '다음 문제…' : '결과 공개!'}</div>
            </>
          )}
        </div>
      </div>
    )
  }
  const r = priceResult(room, p)
  const name = (pid) => room.players[pid]?.name || ''
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="💰"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={pointRows(room, r)}
      extra={
        <div className="pg-best">
          {rounds.map((idx, q) => {
            const it = PRICE_ITEMS[idx]
            const b = r.best[q]
            return (
              <div key={q} className="pg-best-row">
                <span>
                  {it?.emoji} {it?.name}
                </span>
                <b>{won(it?.price)}</b>
                <em>{b ? `🎯 ${name(b.pid)} ${won(b.v)}` : '아무도 못 냄'}</em>
              </div>
            )
          })}
        </div>
      }
      note={r.byAvg ? '팀 인원이 달라서 1인 평균으로 비교해요' : r.mvp ? `🏅 MVP ${name(r.mvp.pid)} ${r.mvp.total.toLocaleString('ko-KR')}점` : ''}
    />
  )
}

// ---------- 팀 시간 합치기 ----------
// 각자 한 번 꾹 눌렀다 뗌 (시간은 안 보임, 말하기 금지). 팀원 시간 합이 30초에 가장 가까운 팀 승, 가장 먼 팀이 마심
const sec = (ms) => (ms / 1000).toFixed(1)
export function TimeSumPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 200)
  const ph = timeSumPhase(room, p, now)
  const title = p.title || '팀 시간 합치기'
  const t0 = useRef(null) // 누른 순간 (performance.now)
  const pressAt = useRef(null) // 누른 순간 (서버 시각)
  const sentRef = useRef(false)
  const [holding, setHolding] = useState(false)
  const [mine, setMine] = useState(null)
  const finished = mine != null || !!p.holds?.[me]
  const release = () => {
    if (t0.current == null || sentRef.current) return
    let ms = performance.now() - t0.current
    if (pressAt.current != null && p.endAt) ms = Math.min(ms, Math.max(0, p.endAt - pressAt.current))
    t0.current = null
    sentRef.current = true
    setHolding(false)
    setMine(ms)
    holdSubmit(code, room, ms)
    buzz([50, 30, 50])
  }
  const timeUp = ph.phase === 'play' && ph.left <= 0
  // 누른 채로 45초가 지나면 거기서 끊음
  useEffect(() => {
    if (timeUp && t0.current != null) release()
  }, [timeUp])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="🕰️"
        title={title}
        headline={`팀 합계 ${TS_TARGET_MS / 1000}초 맞추기!`}
        startLabel="🕰️ 시작"
        rules={
          <>
            시작하면 각자 큰 버튼을 <b>딱 한 번</b> 꾹 눌렀다 떼요. 화면에 시간은 <b>안 나와요</b> (몇 초 눌렀는지도 결과 때 공개). 팀원들이 누른 시간을 다 더해서 <b>{TS_TARGET_MS / 1000}초</b>에 가장 가까운 팀이 이기고, 가장 먼 팀이 다 같이 마셔요. <b>말하기 금지!</b> {Math.round((p.endAt - p.startAt) / 1000) || 45}초 안에 안 누르면 0초예요.
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="🕰️" title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="🕰️" sub="말하지 마세요! 각자 한 번 꾹" />
  if (p.stage === 'play' && ph.phase === 'play') {
    // 팀원이 몇 명 뗐는지는 안 보여 줌 (언제 뗐는지 알 수 있어서)
    const down = (e) => {
      if (finished || timeUp || t0.current != null) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      t0.current = performance.now()
      pressAt.current = serverNow()
      setHolding(true)
      buzz(30)
    }
    return (
      <div className="ai-overlay tg timesum">
        <div className="tg-box">
          <div className="tg-head">
            <span>🕰️ 팀 시간 합치기</span>
            <span className="tg-score">목표 {TS_TARGET_MS / 1000}초</span>
          </div>
          <div className="ts-hint">우리 팀 시간을 다 더해서 {TS_TARGET_MS / 1000}초! 말하기 금지 🤐</div>
          <button
            className={`ts-btn ${holding ? 'on' : ''} ${finished ? 'done' : ''}`}
            disabled={finished || timeUp}
            onPointerDown={down}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="ts-ring" />
            <b>{finished ? '✅' : holding ? '🤫' : '👇'}</b>
            <em>{finished ? '기록 끝!' : holding ? '누르는 중… 떼면 끝' : '꾹 누르기'}</em>
          </button>
          <div className="ct-fb">{finished ? '몇 초였는지는 결과에서 공개!' : timeUp ? '시간 끝! 0초' : holding ? '시간은 비밀이에요' : '한 번만 누를 수 있어요'}</div>
          <div className="ai-sub">{!finished && ph.left < 6000 ? '⏳ 곧 끝나요! 안 누르면 0초' : '누가 몇 초 눌렀는지는 결과에서 공개'}</div>
        </div>
      </div>
    )
  }
  const r = timeSumResult(room, p)
  const name = (pid) => room.players[pid]?.name || ''
  const scale = Math.max(TS_TARGET_MS * 1.35, ...r.rows.map((x) => x.sum * 1.05))
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="🕰️"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={r.rows.map((row) => ({
        team: row.team,
        main: `${sec(row.sum)}초`,
        sub: `${row.diff < 50 ? '딱 맞음! 🎯' : row.sum > TS_TARGET_MS ? `${sec(row.diff)}초 넘음` : `${sec(row.diff)}초 모자람`} · ${row.per.map((x) => `${name(x.pid)} ${x.none ? '미참여' : `${sec(x.ms)}초`}`).join(' + ')}`,
      }))}
      extra={
        <div className="ts-bars">
          {r.rows.map((row) => (
            <div key={row.team} className="ts-bar" style={{ '--tc': TEAM_INFO[row.team]?.color }}>
              <div className="ts-track">
                {row.per.map((x, i) => (
                  <i key={x.pid} style={{ width: `${(x.ms / scale) * 100}%`, animationDelay: `${0.2 + i * 0.45}s`, opacity: 1 - i * 0.18 }}>
                    {x.ms / scale > 0.12 ? name(x.pid) : ''}
                  </i>
                ))}
                <b className="ts-goal" style={{ left: `${(TS_TARGET_MS / scale) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="ts-legend">점선 = {TS_TARGET_MS / 1000}초</div>
        </div>
      }
      note={`팀 합계가 ${TS_TARGET_MS / 1000}초에서 가장 먼 팀이 마셔요`}
    />
  )
}

// ---------- 지도 찍기 ----------
// 5문제 × 10초, 한국 지도에 장소 핀 꽂기 (다시 누르면 옮김). 가까울수록 점수 (40km = 500점), 팀 점수 낮은 팀이 마심
function KoreaMap({ onTap, children }) {
  const ref = useRef(null)
  const tap = (e) => {
    if (!onTap || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    onTap(((e.clientX - r.left) / r.width) * MAP_W, ((e.clientY - r.top) / r.height) * MAP_H)
  }
  return (
    <svg ref={ref} className={`kmap ${onTap ? 'tap' : ''}`} viewBox={`0 0 ${MAP_W} ${MAP_H}`} onPointerDown={tap}>
      <rect width={MAP_W} height={MAP_H} className="kmap-sea" />
      <path d={MAP_JP} className="kmap-other" />
      <path d={MAP_NK} className="kmap-other" />
      <path d={MAP_KR} className="kmap-kr" />
      <path d={MAP_DO} className="kmap-do" />
      {ISLAND_DOTS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" className="kmap-kr" />
      ))}
      {children}
    </svg>
  )
}
const MapPin = ({ x, y, color }) => (
  <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} className="kmap-pin">
    <path d="M0,0 C-11,-19 -19,-29 -19,-40 A19,19 0 1 1 19,-40 C19,-29 11,-19 0,0Z" fill={color} />
    <circle cx="0" cy="-40" r="7" fill="#fff" />
  </g>
)
const MapStar = ({ x, y, label }) => (
  <g className="kmap-star">
    <circle cx={x} cy={y} r="13" />
    <text x={x + (x > MAP_W * 0.7 ? -20 : 20)} y={y + 10} textAnchor={x > MAP_W * 0.7 ? 'end' : 'start'}>
      {label}
    </text>
  </g>
)
export function MapPinPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const ph = mapPhase(p, now)
  const title = p.title || '지도 찍기'
  const rounds = arr(p.rounds)
  const [local, setLocal] = useState({}) // 문제별 내 핀 (서버 반영 전에도 바로)
  const qRef = useRef(null)
  useEffect(() => {
    if (ph.phase === 'q' && qRef.current !== ph.q) {
      qRef.current = ph.q
      buzz(50)
    }
  }, [ph.phase, ph.q])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="🗺️"
        title={title}
        headline="여기가 어디게? 지도에 콕!"
        startLabel="🗺️ 시작"
        extra={
          <div className="pg-scale">
            {[
              ['10km', 941],
              ['40km', 500],
              ['100km', 138],
            ].map(([k, v]) => (
              <span key={k}>
                {k} <b>{v}</b>
              </span>
            ))}
          </div>
        }
        rules={
          <>
            장소 이름이 나오면 한국 지도에 손가락으로 <b>핀을 꽂아요</b> (다시 누르면 옮겨져요). 모두 {MP_ROUNDS}문제, 문제마다 {MP_ANSWER_MS / 1000}초, 점점 어려워져요. 실제 위치와 <b>가까울수록 점수가 커요</b> (딱 맞히면 1000점, 40km 차이 500점). 도시는 시청 기준. 끝나면 팀 점수가 낮은 팀이 다 같이 마셔요.
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="🗺️" title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="🗺️" sub="여기가 어디게? 지도에 콕!" />
  const color = TEAM_INFO[teamOf(room, me)]?.color || '#ff4d6d'
  if (ph.phase === 'q' || ph.phase === 'gap') {
    const q = ph.q
    const place = PLACES[rounds[q]] || PLACES[0]
    const asking = ph.phase === 'q'
    const server = mapAnswerOf(p, q, me)
    const lp = local[q]
    const pin = asking ? lp || server : server || lp
    const scored = !asking && pin ? mapAnswerOf({ ...p, answers: { ...(p.answers || {}), [`r${q}`]: { ...(p.answers?.[`r${q}`] || {}), [me]: { x: pin.x, y: pin.y } } } }, q, me) : null
    const shownQ = asking ? q : q + 1
    const myTotal = Array.from({ length: shownQ }, (_, k) => (k === q && scored ? scored.pts : mapAnswerOf(p, k, me)?.pts || 0)).reduce((a, b) => a + b, 0)
    const myTeam = teamOf(room, me)
    const mates = teamMembers(room, myTeam)
    const done = mates.filter((pid) => answeredNow(p, q, pid, ph.at, now) || (pid === me && pin)).length
    const [tx, ty] = toXY(place.lat, place.lon)
    const onTap = asking
      ? (x, y) => {
          setLocal((m) => ({ ...m, [q]: { x, y } }))
          mapAnswer(code, room, q, x, y)
          buzz(20)
        }
      : null
    return (
      <div className="ai-overlay tg mappin">
        <div className="tg-box">
          <div className="tg-head">
            <span>
              🗺️ {q + 1}/{MP_ROUNDS}
            </span>
            <span className="tg-score">내 점수 {myTotal.toLocaleString('ko-KR')}</span>
          </div>
          <div className={`tg-timer ${asking ? '' : 'done'}`}>{asking && <i style={{ width: `${Math.max(0, (ph.left / MP_ANSWER_MS) * 100)}%` }} />}</div>
          <div className="mp-q">📍 {place.name}</div>
          <KoreaMap onTap={onTap}>
            {!asking && pin && <line x1={pin.x} y1={pin.y} x2={tx} y2={ty} className="kmap-line" />}
            {!asking && <MapStar x={tx} y={ty} label={place.name} />}
            {pin && <MapPin x={pin.x} y={pin.y} color={color} />}
          </KoreaMap>
          <div className={`ct-fb ${asking ? '' : scored ? 'ok' : 'no'}`}>
            {asking ? (pin ? '다시 누르면 옮겨져요' : '지도를 눌러 핀 꽂기!') : scored ? `${Math.round(scored.km)}km 차이 · +${scored.pts}점` : '안 찍었어요! 0점'}
          </div>
          <div className="ai-sub">{asking ? `${Math.ceil(ph.left / 1000)}초 · 우리 팀 ${done}/${mates.length}명 찍었어요` : q + 1 < MP_ROUNDS ? '다음 문제…' : '결과 공개!'}</div>
        </div>
      </div>
    )
  }
  const r = mapResult(room, p)
  const name = (pid) => room.players[pid]?.name || ''
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="🗺️"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={pointRows(room, r)}
      extra={
        <div className="pg-best">
          {rounds.map((idx, q) => {
            const b = r.best[q]
            return (
              <div key={q} className="pg-best-row">
                <span>📍 {PLACES[idx]?.name}</span>
                <em>{b ? `🎯 ${name(b.pid)} ${Math.round(b.km)}km` : '아무도 안 찍음'}</em>
              </div>
            )
          })}
        </div>
      }
      note={r.byAvg ? '팀 인원이 달라서 1인 평균으로 비교해요' : r.mvp ? `🏅 MVP ${name(r.mvp.pid)} ${r.mvp.total.toLocaleString('ko-KR')}점` : ''}
    />
  )
}

// ---------- 세계 지도 찍기 ----------
// 5문제 × 15초, 세계 지도에 도시·명소 핀 꽂기. 두 손가락으로 확대 · 끌어서 이동 · 그냥 누르면 핀 (다시 누르면 옮김) · 지도 아래 ＋ － 전체 버튼
// 가까울수록 점수 (1,000km = 500점), 팀 점수 낮은 팀이 마심. 지도 그림(worldmap.js, 약 110KB)은 이 게임이 처음 뜰 때 따로 불러옴
const WM_MAX_ZOOM = 8
const WM_FULL = { x: 0, y: 0, w: WORLD_W }
const wmH = (w) => (w * WORLD_H) / WORLD_W
function wmClamp(v) {
  const w = Math.max(WORLD_W / WM_MAX_ZOOM, Math.min(WORLD_W, v.w))
  return { w, x: Math.max(0, Math.min(WORLD_W - w, v.x)), y: Math.max(0, Math.min(WORLD_H - wmH(w), v.y)) }
}
// 점들이 다 보이게 (정답 공개 때: 정답 + 내 핀)
function wmFit(points, minW = 150) {
  const xs = points.map((q) => q[0])
  const ys = points.map((q) => q[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const span = Math.max(Math.max(...xs) - Math.min(...xs), ((Math.max(...ys) - Math.min(...ys)) * WORLD_W) / WORLD_H)
  const w = Math.min(WORLD_W, Math.max(minW, span * 1.7))
  return wmClamp({ x: cx - w / 2, y: cy - wmH(w) / 2, w })
}
function useWorldMapData() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    import('../game/worldmap').then((m) => alive && setData({ land: m.WORLD_LAND, dots: m.WORLD_DOTS }))
    return () => {
      alive = false
    }
  }, [])
  return data
}
function WorldMap({ data, view, setView: setViewProp, onTap, children }) {
  const ref = useRef(null)
  const ptrs = useRef(new Map())
  const g = useRef(null)
  // 지금 보기: 손가락 이벤트가 화면이 다시 그려지기 전에 연달아 와도 최신 값으로 (props 가 바뀔 때만 맞춤)
  const vRef = useRef(view)
  const lastProp = useRef(view)
  if (lastProp.current !== view) {
    lastProp.current = view
    vRef.current = view
  }
  const setView = (v) => {
    vRef.current = v
    setViewProp(v)
  }
  const toMap = (cx, cy) => {
    const r = ref.current.getBoundingClientRect()
    const v = vRef.current
    return [v.x + ((cx - r.left) / r.width) * v.w, v.y + ((cy - r.top) / r.height) * wmH(v.w)]
  }
  const two = () => [...ptrs.current.values()].slice(0, 2)
  const down = (e) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 1) g.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, v0: vRef.current, moved: false }
    else {
      const [a, b] = two()
      g.current = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: toMap((a.x + b.x) / 2, (a.y + b.y) / 2), v0: vRef.current }
    }
  }
  const move = (e) => {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const st = g.current
    if (!st || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    if (st.mode === 'pan' && ptrs.current.size === 1) {
      const dx = e.clientX - st.sx
      const dy = e.clientY - st.sy
      if (!st.moved && Math.hypot(dx, dy) < 8) return // 손가락이 조금 떨린 건 누르기로
      st.moved = true
      const k = st.v0.w / r.width
      setView(wmClamp({ ...st.v0, x: st.v0.x - dx * k, y: st.v0.y - dy * k }))
    } else if (st.mode === 'pinch' && ptrs.current.size >= 2) {
      const [a, b] = two()
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const w = Math.max(WORLD_W / WM_MAX_ZOOM, Math.min(WORLD_W, (st.v0.w * st.d0) / d))
      const mx = ((a.x + b.x) / 2 - r.left) / r.width
      const my = ((a.y + b.y) / 2 - r.top) / r.height
      setView(wmClamp({ w, x: st.m0[0] - mx * w, y: st.m0[1] - my * wmH(w) }))
    }
  }
  const up = (e) => {
    const st = g.current
    const tap = !!st && st.mode === 'pan' && !st.moved && ptrs.current.size === 1 && ptrs.current.has(e.pointerId)
    ptrs.current.delete(e.pointerId)
    if (tap && onTap && e.type === 'pointerup') onTap(...toMap(e.clientX, e.clientY))
    if (ptrs.current.size === 1) {
      const [a] = [...ptrs.current.values()]
      g.current = { mode: 'pan', sx: a.x, sy: a.y, v0: vRef.current, moved: true } // 두 손가락 뒤에 남은 손가락은 이동만 (핀 안 꽂음)
    } else if (!ptrs.current.size) g.current = null
  }
  const wheel = (e) => {
    const v = vRef.current
    const [mx, my] = toMap(e.clientX, e.clientY)
    const w = Math.max(WORLD_W / WM_MAX_ZOOM, Math.min(WORLD_W, v.w * Math.exp(e.deltaY * 0.0015)))
    const f = w / v.w
    setView(wmClamp({ w, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f }))
  }
  const zoomBy = (f) => {
    const v = vRef.current
    const cx = v.x + v.w / 2
    const cy = v.y + wmH(v.w) / 2
    const w = Math.max(WORLD_W / WM_MAX_ZOOM, Math.min(WORLD_W, v.w / f))
    setView(wmClamp({ w, x: cx - w / 2, y: cy - wmH(w) / 2 }))
  }
  const k = view.w / WORLD_W // 확대해도 핀·별·점은 같은 크기로 보이게
  return (
    <div className="wmap-wrap">
      <svg
        ref={ref}
        className={`wmap ${onTap ? 'tap' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${wmH(view.w)}`}
        data-view={`${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={wheel}
      >
        <rect x="-20" y="-20" width={WORLD_W + 40} height={WORLD_H + 40} className="kmap-sea" />
        {data ? (
          <>
            <path d={data.land} className="wmap-land" />
            {data.dots.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={Math.max(0.9, 3.2 * k)} className="wmap-land" />
            ))}
          </>
        ) : (
          <text x={WORLD_W / 2} y={WORLD_H / 2} textAnchor="middle" className="wmap-loading">
            지도 불러오는 중…
          </text>
        )}
        {children?.(k)}
      </svg>
      <div className="wmap-btns">
        <button type="button" className="wmap-zin" onClick={() => zoomBy(2)} aria-label="확대">
          ＋
        </button>
        <button type="button" className="wmap-zout" onClick={() => zoomBy(0.5)} aria-label="축소">
          －
        </button>
        <button type="button" className="wmap-zfull" onClick={() => setView(WM_FULL)} aria-label="전체 보기">
          ⤢ 전체
        </button>
      </div>
    </div>
  )
}
const WorldPin = ({ x, y, color, k }) => (
  <g transform={`translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${(k * 0.85).toFixed(4)})`} className="kmap-pin">
    <path d="M0,0 C-11,-19 -19,-29 -19,-40 A19,19 0 1 1 19,-40 C19,-29 11,-19 0,0Z" fill={color} />
    <circle cx="0" cy="-40" r="7" fill="#fff" />
  </g>
)
const WorldStar = ({ x, y, label, k, left }) => (
  <g className="kmap-star wmap-star" transform={`translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${(k * 0.85).toFixed(4)})`}>
    <circle r="12" />
    <text x={left ? -20 : 20} y="11" textAnchor={left ? 'end' : 'start'}>
      {label}
    </text>
  </g>
)
const kmText = (km) => `${Math.round(km).toLocaleString('ko-KR')}km`
export function WorldPinPanel({ room, pending: p, me, ctl, code }) {
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const ph = worldPhase(p, now)
  const title = p.title || '세계 지도 찍기'
  const rounds = arr(p.rounds)
  const data = useWorldMapData()
  const [local, setLocal] = useState({}) // 문제별 내 핀 (서버 반영 전에도 바로)
  const [view, setViewRaw] = useState(WM_FULL)
  const viewRef = useRef(view)
  const anim = useRef(0)
  const setView = (v) => {
    cancelAnimationFrame(anim.current)
    viewRef.current = v
    setViewRaw(v)
  }
  // 부드럽게 옮기기 (정답 공개 때)
  const flyTo = (to) => {
    cancelAnimationFrame(anim.current)
    const from = viewRef.current
    const t0 = performance.now()
    const step = (t) => {
      const a = Math.min(1, (t - t0) / 500)
      const e = 1 - (1 - a) ** 3
      const v = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e }
      viewRef.current = v
      setViewRaw(v)
      if (a < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(anim.current), [])
  // 문제마다 전체 지도에서 시작 (앞 문제 확대가 힌트가 안 되게), 정답 공개 때는 정답과 내 핀이 다 보이게
  const qRef = useRef(null)
  useEffect(() => {
    if (ph.phase === 'q') {
      if (qRef.current !== ph.q) {
        qRef.current = ph.q
        buzz(50)
      }
      setView(WM_FULL)
    }
    if (ph.phase === 'gap') {
      const place = WORLD_PLACES[rounds[ph.q]]
      if (!place) return
      const mine = worldAnswerOf(p, ph.q, me) || local[ph.q]
      const t = toWorldXY(place.lat, place.lon)
      flyTo(wmFit(mine ? [t, [mine.x, mine.y]] : [t]))
    }
  }, [`${ph.phase}-${ph.q}`])
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji="🌍"
        title={title}
        headline="여기가 어디게? 세계 지도에 콕!"
        startLabel="🌍 시작"
        extra={
          <div className="pg-scale">
            {[500, 1000, 2000].map((km) => [`${km.toLocaleString('ko-KR')}km`, worldPoints(km)]).map(([k, v]) => (
              <span key={k}>
                {k} <b>{v}</b>
              </span>
            ))}
          </div>
        }
        rules={
          <>
            도시·명소 이름이 나오면 (나라 힌트도 같이) 세계 지도에 <b>핀을 꽂아요</b>. <b>두 손가락으로 확대</b>, 끌어서 이동, 그냥 누르면 핀 (다시 누르면 옮겨져요, ＋ － 버튼도 있어요). 모두 {WP_ROUNDS}문제, 문제마다 {WP_ANSWER_MS / 1000}초, 점점 어려워져요. 실제 위치와 <b>가까울수록 점수가 커요</b> (딱 맞히면 1000점, 500km 차이 800점, 1,000km 차이 500점). 끝나면 팀 점수가 낮은 팀이 다 같이 마셔요.
          </>
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji="🌍" title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji="🌍" sub="여기가 어디게? 세계 지도에 콕!" />
  const color = TEAM_INFO[teamOf(room, me)]?.color || '#ff4d6d'
  if (ph.phase === 'q' || ph.phase === 'gap') {
    const q = ph.q
    const place = WORLD_PLACES[rounds[q]] || WORLD_PLACES[0]
    const asking = ph.phase === 'q'
    const server = worldAnswerOf(p, q, me)
    const lp = local[q]
    const pin = asking ? lp || server : server || lp
    const scored = !asking && pin ? worldAnswerOf({ ...p, answers: { ...(p.answers || {}), [`r${q}`]: { ...(p.answers?.[`r${q}`] || {}), [me]: { x: pin.x, y: pin.y } } } }, q, me) : null
    const shownQ = asking ? q : q + 1
    const myTotal = Array.from({ length: shownQ }, (_, i) => (i === q && scored ? scored.pts : worldAnswerOf(p, i, me)?.pts || 0)).reduce((a, b) => a + b, 0)
    const mates = teamMembers(room, teamOf(room, me))
    const done = mates.filter((pid) => answeredNow(p, q, pid, ph.at, now) || (pid === me && pin)).length
    const [tx, ty] = toWorldXY(place.lat, place.lon)
    const onTap = asking
      ? (x, y) => {
          setLocal((m) => ({ ...m, [q]: { x, y } }))
          worldAnswer(code, room, q, x, y)
          buzz(20)
        }
      : null
    return (
      <div className="ai-overlay tg mappin worldpin">
        <div className="tg-box">
          <div className="tg-head">
            <span>
              🌍 {q + 1}/{WP_ROUNDS}
            </span>
            <span className="tg-score">내 점수 {myTotal.toLocaleString('ko-KR')}</span>
          </div>
          <div className={`tg-timer ${asking ? '' : 'done'}`}>{asking && <i style={{ width: `${Math.max(0, (ph.left / WP_ANSWER_MS) * 100)}%` }} />}</div>
          <div className="mp-q">📍 {place.name}</div>
          {place.country && <div className="mp-hint">🧭 {place.country}</div>}
          <WorldMap data={data} view={view} setView={setView} onTap={onTap}>
            {(k) => (
              <>
                {!asking && pin && <line x1={pin.x} y1={pin.y} x2={tx} y2={ty} className="wmap-line" />}
                {!asking && <WorldStar x={tx} y={ty} label={place.name} k={k} left={tx > view.x + view.w * 0.6} />}
                {pin && <WorldPin x={pin.x} y={pin.y} color={color} k={k} />}
              </>
            )}
          </WorldMap>
          <div className={`ct-fb ${asking ? '' : scored ? 'ok' : 'no'}`}>
            {asking ? (pin ? '다시 누르면 옮겨져요 · 두 손가락으로 확대' : '두 손가락으로 확대 · 누르면 핀!') : scored ? `${kmText(scored.km)} 차이 · +${scored.pts}점` : '안 찍었어요! 0점'}
          </div>
          <div className="ai-sub">{asking ? `${Math.ceil(ph.left / 1000)}초 · 우리 팀 ${done}/${mates.length}명 찍었어요` : q + 1 < WP_ROUNDS ? '다음 문제…' : '결과 공개!'}</div>
        </div>
      </div>
    )
  }
  const r = worldResult(room, p)
  const name = (pid) => room.players[pid]?.name || ''
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji="🌍"
      title={title}
      losers={r.losers}
      tie={r.tie}
      rows={pointRows(room, r)}
      extra={
        <div className="pg-best">
          {rounds.map((idx, q) => {
            const b = r.best[q]
            return (
              <div key={q} className="pg-best-row">
                <span>
                  📍 {WORLD_PLACES[idx]?.name}
                  {WORLD_PLACES[idx]?.country && <small className="pg-best-hint"> {WORLD_PLACES[idx].country}</small>}
                </span>
                <em>{b ? `🎯 ${name(b.pid)} ${kmText(b.km)}` : '아무도 안 찍음'}</em>
              </div>
            )
          })}
        </div>
      }
      note={r.byAvg ? '팀 인원이 달라서 1인 평균으로 비교해요' : r.mvp ? `🏅 MVP ${name(r.mvp.pid)} ${r.mvp.total.toLocaleString('ko-KR')}점` : ''}
    />
  )
}

// ---------- 노래 맞히기 · 이모지 영화 맞히기 (주관식) ----------
// 10/30 사용자: 노래는 처음부터 1초 → 모두 '잘 모르겠어요' 누르면 3초 → 5초 + 초성.
// 10/31 사용자: 노래·영화는 다른 게임 (드라마는 지움). 판: 3번 노래 맞히기 · 5번 이모지 영화 맞히기. 노래 5곡 중 4곡은 지금 차트(Apple Music 한국 Top 100),
// 영화는 이모지 6~8개 → + 연도·주연 → + 초성 (사진 안 씀).
// 제목을 써서 가장 먼저 맞힌 사람이 정답 (그 팀 +1, 바로 공개). 맞힌 문제가 적은 팀이 마심.
// 진행·소리는 한 폰에서만: 걸린 사람 (연결 끊기면 방장)
const mqDj = (room, p) => (SOLO ? myId() : room.players?.[p.playerId]?.online !== false ? p.playerId : room.hostId)
const MQ_SRC = { deezer: 'Deezer', apple: 'Apple Music' }
const mqStageName = (k, st) => (MQ_STAGE_NAMES[k] || MQ_STAGE_NAMES.e)[st]
function MqWave({ on }) {
  return (
    <div className={`mq-eq ${on ? 'on' : ''}`} aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <i key={i} style={{ '--i': i }} />
      ))}
    </div>
  )
}
function MqStages({ k, stage, done }) {
  return (
    <div className="mq-stages">
      {Array.from({ length: MQ_STAGES }, (_, st) => (
        <span key={st} className={!done && st === stage ? 'on' : !done && st < stage ? 'past' : ''}>
          {mqStageName(k, st)}
        </span>
      ))}
    </div>
  )
}
// 정답 (공개 후에만 보여 줌)
function MqAnswer({ item }) {
  if (!item) return null
  const cat = MQ_CATS[item.c] || MQ_CATS.movie
  return (
    <div className="mq-answer">
      <b>{item.t}</b>
      <em>{item.c === 'song' ? `${cat.emoji} ${item.by}${item.rank ? ` · 🔥 지금 차트 ${item.rank}위` : ''}` : `${cat.emoji} ${movieHint(item)}`}</em>
    </div>
  )
}
// 이모지 문제: 6개 넘으면 두 줄 (한 줄에 절반씩), 하나씩 뿅
function MqEmoji({ text }) {
  const list = emojiList(text)
  if (!list || list.length < 2) return <div className="mq-emoji">{text}</div>
  return (
    <div className="mq-emoji grid" style={{ '--cols': list.length > 5 ? Math.ceil(list.length / 2) : list.length }}>
      {list.map((g, i) => (
        <span key={i} style={{ '--i': i }}>
          {g}
        </span>
      ))}
    </div>
  )
}
// 팀별 맞힌 문제 수
function MqScore({ res }) {
  return (
    <span className="mq-score">
      {res.rows.map((row) => (
        <span key={row.team} style={{ '--tc': TEAM_INFO[row.team]?.color }}>
          <i />
          {row.sum}
        </span>
      ))}
    </span>
  )
}
export function MediaQuizPanel({ room, pending: p, me, ctl, code }) {
  const song = p.kind === 'songQuiz'
  const info = MQ_INFO[p.kind] || MQ_INFO.songQuiz
  const emoji = info.emoji
  const live = p.stage === 'play'
  const now = useNow(live, 100)
  const ph = mqPhase(p, now)
  const title = p.title || info.title
  const rounds = mqRounds(p)
  const n = mqN(p)
  const dj = mqDj(room, p)
  const isDj = live && dj === me
  const djName = room.players[dj]?.name || '걸린 사람'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [val, setVal] = useState('')
  const [wrong, setWrong] = useState({}) // 문제별 내 마지막 오답
  const [late, setLate] = useState({}) // 문제별: 맞혔는데 다른 사람이 먼저
  const [shake, setShake] = useState(false) // 틀리면 입력창 흔들기 (입력창은 그대로 둬서 키보드가 안 닫힘)
  const [passed, setPassed] = useState({}) // 'q:단계' → 눌렀음 (서버 반영 전에도 바로)
  const qRef = useRef(null)
  const sending = useRef(false)
  const shakeT = useRef(null)
  useEffect(() => () => clearTimeout(shakeT.current), [])
  const q = ph.q
  const r = q != null ? rounds[q] : null
  const item = mqItem(r)
  const st = ph.phase === 'q' ? ph.st : MQ_STAGES - 1
  // 새 문제: 입력 비우기 + 진동
  useEffect(() => {
    if (ph.phase === 'q' && qRef.current !== ph.q) {
      qRef.current = ph.q
      setVal('')
      buzz(50)
    }
  }, [ph.phase, ph.q])
  // 진행: 걸린 사람 폰이 0.1초마다 (누가 맞히면 공개, 모두 '잘 모르겠어요'면 다음 단계, 혼자 연습이면 연습봇도)
  useEffect(() => {
    if (isDj && ph.phase === 'q') mqDrive(code, room)
  }, [isDj, now])
  // 소리 (노래만): 걸린 사람 폰만 — 단계가 바뀔 때마다 처음부터 1초·3초·5초, 정답 공개 때 5.5초. 쉬는 동안 다음 노래를 미리 받아 둠
  useEffect(() => {
    if (!isDj || !song) return
    const nextSong = (from) => rounds.slice(from).find((x) => x?.k === 'a')?.u
    if (ph.phase === 'count') {
      const u = nextSong(0)
      if (u) mqPrime(u)
      return
    }
    if (ph.phase === 'final') return mqStop()
    if (ph.phase !== 'q' && ph.phase !== 'gap') return
    if (r?.k === 'a') {
      const blockedNow = () => setBlocked(true) // 브라우저가 소리를 막거나 화면을 꺼서 끊기면 '소리 켜기' 버튼
      if (ph.phase === 'q') {
        // 늦게 들어온 폰(다시 연결 등)은 단계가 바뀌고 2.5초 안일 때만 틈
        if (serverNow() - ph.stAt < 2500) {
          setBlocked(false)
          mqPlay(r.u, MQ_CLIP_FROM, MQ_CLIP_MS[ph.st], blockedNow)
        }
      } else {
        setBlocked(false)
        mqPlay(r.u, MQ_CLIP_FROM, MQ_REVEAL_CLIP_MS, blockedNow)
      }
      return
    }
    const u = nextSong(q + 1)
    if (u) mqPrime(u)
  }, [isDj, ph.phase, ph.q, st])
  useEffect(() => () => mqStop(), [])

  const start = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    if (song) mqUnlock() // 누르는 순간에 해야 이 폰에서 소리가 남
    try {
      const res = await resolvePending(code, room, 'start')
      if (res && res.ok === false && res.why !== 'gone') setErr(song ? '노래를 못 불러왔어요. 인터넷을 확인하고 다시 눌러 주세요.' : '문제를 못 만들었어요. 다시 눌러 주세요.')
    } finally {
      setBusy(false)
    }
  }
  if (p.stage === 'ready')
    return (
      <ReadyModal
        room={room}
        p={p}
        ctl={ctl}
        code={code}
        emoji={emoji}
        title={title}
        headline={song ? '1초 듣고 노래 제목 맞히기!' : '이모지 보고 영화 제목 맞히기!'}
        startLabel={busy ? '🔍 노래 찾는 중…' : `${emoji} 시작`}
        onStart={start}
        busy={busy}
        extra={
          <>
            <div className="pg-scale">
              {song ? (
                <span>
                  🎵 <b>1초</b> → 3초 → 5초 + 초성
                </span>
              ) : (
                <span>
                  🎬 <b>이모지</b> → + 연도·주연 → + 초성
                </span>
              )}
            </div>
            {song && <div className="mq-dj">🔊 소리는 {djName} 폰에서 나와요 — 소리를 키워 주세요</div>}
            {err && <div className="mq-err">{err}</div>}
            {song && <div className="mq-credit">{MQ_ROUNDS}곡 중 {MQ_CHART_PICK}곡은 지금 Apple Music 한국 차트 · 미리듣기 Deezer · Apple Music</div>}
          </>
        }
        rules={
          song ? (
            <>
              🎵 {djName} 폰에서 노래 미리듣기를 <b>처음부터 1초</b> 들려줘요. 모르겠으면 <b>🤷 잘 모르겠어요</b> — <b>모두</b> 누르면 <b>3초</b>, 또 모두 누르면 <b>5초 + 초성 힌트</b>. {MQ_ROUNDS}곡 중 {MQ_CHART_PICK}곡은 <b>🔥 지금 차트</b> 곡이에요 (영어 제목은 영어로). 제목을 <b>직접 써서 가장 먼저 맞힌 사람이 정답</b> (띄어쓰기·작은 오타 괜찮음, 틀리면 다시) — 그 팀 +1. 마지막 단계에서도 모두 모르면 정답 공개 (안 누르는 사람이 있어도 25초 지나면 넘어가요). 모두 {n}곡, <b>맞힌 문제가 적은 팀</b>이 다 같이 마셔요.
            </>
          ) : (
            <>
              🎬 <b>이모지</b> 6~8개를 보고 영화 제목을 맞혀요. 모르겠으면 <b>🤷 잘 모르겠어요</b> — <b>모두</b> 누르면 <b>개봉 연도·주연</b>, 또 모두 누르면 <b>초성 힌트</b>. 제목을 <b>직접 써서 가장 먼저 맞힌 사람이 정답</b> (띄어쓰기·작은 오타 괜찮음, 틀리면 다시) — 그 팀 +1. 마지막 단계에서도 모두 모르면 정답 공개 (안 누르는 사람이 있어도 25초 지나면 넘어가요). 모두 {n}문제, <b>맞힌 문제가 적은 팀</b>이 다 같이 마셔요.
            </>
          )
        }
      />
    )
  if (p.stage === 'roulette') return <TeamRoulette room={room} p={p} ctl={ctl} code={code} emoji={emoji} title={title} />
  if (ph.phase === 'count') return <CountScreen left={ph.left} emoji={emoji} sub={song ? (p.note === 'nochart' ? '차트를 못 불러와서 이번엔 목록 곡만!' : '소리 키우고, 1초 듣고 맞혀요!') : '이모지 보고 영화 제목을 맞혀요!'} />
  const res = mqResult(room, p)
  const name = (pid) => room.players[pid]?.name || ''
  if ((ph.phase === 'q' || ph.phase === 'gap') && r) {
    const asking = ph.phase === 'q'
    const cat = MQ_CATS[item?.c] || MQ_CATS.movie
    const w = mqWinner(p, q)
    const pi = asking ? mqPassInfo(room, p, q, st) : null
    const iPassed = asking && (pi.done.includes(me) || passed[`${q}:${st}`])
    const waitingFor = asking ? pi.left.filter((pid) => !(pid === me && iPassed)) : []
    const clipOn = asking ? now - ph.stAt < MQ_CLIP_MS[st] : now - ph.end < MQ_REVEAL_CLIP_MS
    const autoIn = asking ? Math.ceil((MQ_STAGE_TIMEOUT_MS - (now - ph.stAt)) / 1000) : 0
    const nextName = st < MQ_STAGES - 1 ? mqStageName(r.k, st + 1) : '정답 공개'
    const submit = async (e) => {
      e?.preventDefault?.()
      const text = val.trim()
      if (!asking || !text || sending.current || !item || w) return
      if (!isTitleAnswer(text, item)) {
        setWrong((x) => ({ ...x, [q]: text }))
        setShake(true)
        clearTimeout(shakeT.current)
        shakeT.current = setTimeout(() => setShake(false), 450)
        buzz([70, 40, 70])
      } else buzz([30, 30, 90])
      setVal('')
      sending.current = true
      try {
        const out = await mqAnswer(code, room, q, text)
        if (out?.late) setLate((x) => ({ ...x, [q]: out.winner }))
      } finally {
        sending.current = false
      }
    }
    const pass = () => {
      if (!asking || iPassed || w) return
      setPassed((x) => ({ ...x, [`${q}:${st}`]: true }))
      buzz(30)
      mqPass(code, room, q, st)
    }
    const wrongs = Object.entries(p.wrong?.[`r${q}`] || {})
      .filter(([pid, x]) => x && room.players[pid]?.name)
      .slice(0, 5)
    const winTeam = w ? teamOf(room, w.pid) : null
    const latin = item && !/[\p{Script=Hangul}]/u.test(item.t) // 영어 제목이면 영어로 쓰라고
    return (
      <div className="ai-overlay tg mq">
        <div className="tg-box">
          <div className="tg-head">
            <span>
              {emoji} {q + 1}/{n}
              <em className={`mq-cat ${item?.rank ? 'hot' : ''}`}>{item?.rank ? '🔥 지금 차트' : `${cat.emoji} ${cat.name}`}</em>
            </span>
            <MqScore res={res} />
          </div>
          <MqStages k={r.k} stage={st} done={!asking} />
          {!asking && <MqAnswer item={item} />}
          {r.k !== 'a' ? (
            <div className="mq-emoji-box">
              <MqEmoji text={item?.e} />
            </div>
          ) : (
            <div className="mq-sound">
              <MqWave on={clipOn} />
              <div className="mq-sound-text">{asking ? (clipOn ? `🔊 ${MQ_CLIP_MS[st] / 1000}초 듣는 중…` : `🎧 ${MQ_CLIP_MS[st] / 1000}초 들었어요`) : clipOn ? '🎵 정답 곡 듣는 중' : ''}</div>
              {!isDj && asking && <div className="mq-sound-sub">소리는 {djName} 폰에서 나와요</div>}
              {isDj && blocked && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setBlocked(false)
                    mqPlay(r.u, MQ_CLIP_FROM, asking ? MQ_CLIP_MS[st] : MQ_REVEAL_CLIP_MS, () => setBlocked(true))
                  }}
                >
                  🔊 소리가 안 나면 눌러 주세요
                </button>
              )}
            </div>
          )}
          {asking && !w ? (
            <>
              <div className="mq-hint">
                {r.k !== 'a' && st >= 1 ? (
                  <>
                    <span className="mq-hint-line">
                      🎬 <b className="mq-info">{movieHint(item)}</b>
                    </span>
                    {st === MQ_STAGES - 1 && (
                      <span className="mq-hint-line">
                        초성 <b className="mq-ch">{chosungHint(item?.t)}</b>
                      </span>
                    )}
                  </>
                ) : st === MQ_STAGES - 1 ? (
                  <>
                    초성 <b className="mq-ch">{chosungHint(item?.t)}</b>
                  </>
                ) : (
                  `${cat.name} 제목을 써요${song && latin ? ' (영어 제목은 영어로)' : ''} — 가장 먼저 맞히면 정답!`
                )}
              </div>
              <form className={`mq-form ${shake ? 'shake' : ''}`} onSubmit={submit}>
                <input
                  className="field mq-input"
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder="제목"
                  maxLength={40}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="send"
                />
                {/* 누를 때 입력창 포커스를 안 뺏어서 휴대폰 키보드가 안 닫힘 */}
                <button className="btn btn-primary mq-send" type="submit" disabled={!val.trim()} onMouseDown={(e) => e.preventDefault()}>
                  확인
                </button>
              </form>
              {wrong[q] && <div className="mq-fb no">땡! "{wrong[q]}" 아니에요 — 다시!</div>}
              <button className={`btn mq-pass ${iPassed ? 'done' : ''}`} disabled={iPassed} onClick={pass} onMouseDown={(e) => e.preventDefault()}>
                {iPassed ? `🙏 다른 사람 기다리는 중 (${pi.voters.length - waitingFor.length}/${pi.voters.length})` : `🤷 잘 모르겠어요 → ${nextName}`}
              </button>
              <div className="mq-wait">
                {waitingFor.length > 0 && `${waitingFor.map(name).join(' · ')} 안 누름`}
                {autoIn <= 10 && `${waitingFor.length ? ' · ' : ''}${Math.max(0, autoIn)}초 뒤 자동으로 넘어가요`}
              </div>
            </>
          ) : asking && w ? (
            <div className="ct-fb ok">🎉 {name(w.pid)} 정답!</div>
          ) : (
            <div className={`mq-win ${w ? '' : 'none'}`} style={{ '--tc': TEAM_INFO[winTeam]?.color }}>
              {w ? (
                <>
                  <div className="mq-win-who">
                    🎉 <b>{name(w.pid)}</b> 정답!
                  </div>
                  <span>{teamName(room, winTeam)} +1</span>
                  <em>{(MQ_WIN_TEXT[r.k] || MQ_WIN_TEXT.e)[w.st]}</em>
                </>
              ) : (
                '😵 아무도 못 맞혔어요'
              )}
              {late[q] && w?.pid !== me && <em>아깝다! 나도 맞혔는데 {name(w?.pid)}이(가) 먼저</em>}
              {w?.pid === me && <em>내가 맞혔어요!</em>}
            </div>
          )}
          {!asking && wrongs.length > 0 && (
            <div className="mq-wrongs">
              😂 오답{' '}
              {wrongs.map(([pid, x]) => (
                <span key={pid}>
                  {name(pid)} "{x}"
                </span>
              ))}
            </div>
          )}
          {!asking && (
            <div className="mq-credit">
              {r.l ? (
                <a href={r.l} target="_blank" rel="noreferrer">
                  {MQ_SRC[r.s] || '출처'}
                </a>
              ) : (
                MQ_SRC[r.s] || ''
              )}
              {MQ_SRC[r.s] || r.l ? ' · ' : ''}
              {q + 1 < n ? '다음 문제…' : '결과 공개!'}
            </div>
          )}
        </div>
      </div>
    )
  }
  return (
    <TeamResult
      room={room}
      p={p}
      ctl={ctl}
      code={code}
      emoji={emoji}
      title={title}
      losers={res.losers}
      tie={res.tie}
      rows={res.rows.map((row) => ({ team: row.team, main: `${row.sum}문제`, sub: row.per.map((x) => `${name(x.pid)} ${x.total}`).join(' · ') }))}
      extra={
        <div className="pg-best">
          {rounds.map((x, k) => {
            const it = mqItem(x)
            const ww = res.wins[k]
            const cat = MQ_CATS[it?.c] || MQ_CATS.movie
            return (
              <div key={k} className="pg-best-row">
                <span>
                  {it?.rank ? '🔥' : cat.emoji} {it?.t}
                </span>
                <b>{it?.c === 'song' ? it?.by : it?.y}</b>
                <em>{ww ? `🎉 ${name(ww.pid)} (${(MQ_STAGE_SHORT[x.k] || MQ_STAGE_SHORT.e)[ww.st]})` : '아무도 못 맞힘'}</em>
              </div>
            )
          })}
        </div>
      }
      note={res.mvp && res.mvp.total > 0 ? `🏅 MVP ${name(res.mvp.pid)} ${res.mvp.total}문제` : ''}
    />
  )
}
