import { useEffect, useRef, useState } from 'react'
import YutBoard from './components/YutBoard'
import { ThrowOverlay, Sticks } from './components/YutSticks'
import { DEMO, LOBBY_TTL_MS } from './db'
import {
  myId,
  createRoom,
  joinRoom,
  leaveRoom,
  subscribeRoom,
  subscribeConnection,
  setupPresence,
  roomCells,
  roomOrder,
  currentPlayerId,
  currentTeam,
  teamCount,
  teamOf,
  teamMembers,
  roomPieces,
  arr,
  optionKey,
  setTeamCount,
  setPieceCount,
  setPlayerTeam,
  shuffleTeams,
  moveInTeam,
  startGame,
  throwYut,
  moveYut,
  resolvePending,
  useNopAnytime,
  saveCellText,
  restartGame,
  rerollTopic,
  clearExpiredOptions,
  hostSkipTurn,
  purgeRooms,
  removeRoom,
  lobbyOrder,
  liarReveal,
  liarVote,
  liarResult,
  roomLog,
  trimLog,
  kickPlayer,
  transferHost,
  castVote,
  voteWinners,
  voteTally,
  balanceVote,
  balanceResult,
  reactionTap,
  reactionRanking,
  watchServerOffset,
  serverNow,
  missionTick,
  missionVote,
  missionReveal,
  missionResult,
  missionDone,
  giveNop,
  missionAck,
  subscribeRoomList,
} from './room'
import { BALANCE_TOPICS } from './game/balance'
import { autoEmoji } from './game/emoji'
import { beep, ding, boom, tick as tickSound } from './sound'
import { LIAR_CATEGORIES, liarCategory } from './game/liar'
import { DEFAULT_YUT_CELLS, TEAM_INFO, moveOptions, nodeName, yutName, isBonus, moveKey, routeLabel, pieceCountOf, CORNERS, CORNER_BL, NODE_BY_ID } from './game/yut'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const KIND_LABEL = {
  nop: '놉카드 획득',
  balance: '밸런스 게임',
  option: '옵션 타이머',
  release: '옵션 해제',
  steal: '놉카드 뺏기',
  aiPick: 'AI 지목',
  pick: '너! 마셔! (지목)',
  liar: '라이어 게임',
  hunmin: '훈민정음 게임',
  vote: '다수결 지목',
  choose: '게임 선택권',
  shuffle: '의리주 순서',
  bomb: '폭탄 돌리기',
  reaction: '반응속도 게임',
  gamble: '놉카드 도박',
  again: '한 번 더!',
  home: '출발·골인',
  caught: '잡기',
  win: '승리',
}
const oneLine = (t) => String(t || '').replace(/\n/g, ' ')
// 갈림길 선택지 화살표: 첫 걸음 방향 (y 는 아래로)
const ARROW8 = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']
function routeArrow(o) {
  const a = NODE_BY_ID[o.from]
  const b = NODE_BY_ID[o.path?.[0]]
  if (!a || !b) return ''
  const idx = ((Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) % 8) + 8) % 8
  return ARROW8[idx]
}

// 테마: 기본은 '밤'(포장마차 네온), 해 버튼으로 '낮'(주황 천막)
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      if (localStorage.getItem('yt-theme') === 'light') return 'light'
    } catch {}
    return 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('yt-theme', theme)
    } catch {}
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (name) {
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...common}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )
    case 'log':
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      )
    case 'exit':
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      )
    default:
      return null
  }
}

// 투표 완료 판정: 접속이 끊긴 사람은 제외하고 모두가 투표했는지
function allVoted(room, ids, votes) {
  const active = ids.filter((pid) => room.players[pid]?.online !== false)
  return active.length > 0 && active.every((pid) => votes[pid] != null)
}

// 3, 2, 1 카운트다운 (key 가 바뀌면 다시 시작). 3→2→1→0(공개)
function useCountdown(key) {
  const [step, setStep] = useState(3)
  useEffect(() => {
    setStep(3)
    const t1 = setTimeout(() => setStep(2), 1000)
    const t2 = setTimeout(() => setStep(1), 2000)
    const t3 = setTimeout(() => setStep(0), 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [key])
  useEffect(() => {
    if (step > 0) beep(step)
    if (step === 0) {
      ding()
      try {
        navigator.vibrate?.([80, 40, 80, 40, 200])
      } catch {}
    }
  }, [step])
  return step
}

// 전체 화면 카운트다운
function CountOverlay({ step, emoji, sub }) {
  return (
    <div className="ai-overlay">
      <div className="ai-count" key={step}>
        <div className="ai-robot">{emoji}</div>
        <div className="ai-num">{step}</div>
        <div className="ai-sub">{sub}</div>
      </div>
    </div>
  )
}

// 축하 화면: 지목된 사람(들) 공개 + 컨페티
function CongratsOverlay({ room, targets, actorId, iAct, canNop, onDone, onTargetNop, title = '🎉 Congratulations! 🎉', note, refused = {} }) {
  const pieces = Array.from({ length: 28 })
  const names = targets.map((t) => room.players[t]?.name).filter(Boolean)
  const nameEls = targets.map((t, i) => (
    <span key={t} className={refused[t] ? 'refused' : ''}>
      {room.players[t]?.name}
      {refused[t] ? ' (거부)' : ''}
      {i < targets.length - 1 ? ', ' : ''}
    </span>
  ))
  return (
    <div className="ai-overlay">
      <div className="ai-reveal">
        <div className="confetti" aria-hidden>
          {pieces.map((_, i) => (
            <i key={i} style={{ '--i': i, left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, background: ['#ea002c', '#f47725', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'][i % 6] }} />
          ))}
        </div>
        <div className="ai-congrats">{title}</div>
        <div className="ai-avatars">
          {targets.map((t) => (
            <div key={t} className="ai-avatar" style={{ background: room.players[t]?.color }}>
              {room.players[t]?.name?.slice(0, 1)}
            </div>
          ))}
        </div>
        {note && <div className="ai-note">{note}</div>}
        <div className="ai-name">
          <b>{names.length ? nameEls : '—'}</b> 마셔! 🍶
        </div>
        <div className="ai-actions">
          {canNop && (
            <button className="btn btn-ghost" onClick={onTargetNop}>
              <NopIcon /> 놉카드로 거부
            </button>
          )}
          {iAct ? (
            <button className="btn btn-primary" onClick={onDone}>
              확인
            </button>
          ) : (
            <div className="waiting">{room.players[actorId]?.name}이(가) 확인하면 다음 차례로 넘어가요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// AI 지목: 3, 2, 1 → 축하 화면 (모든 폰에 동시에 표시)
function AiPickOverlay({ room, pending, me, iAct, onDone, onTargetNop }) {
  const step = useCountdown(`${pending.target}-${pending.startedAt}`)
  if (step > 0) return <CountOverlay step={step} emoji="🤖" sub="AI가 한 명을 고르고 있어요…" />
  const target = room.players[pending.target]
  const isTarget = DEMO || pending.target === me
  return (
    <CongratsOverlay room={room} targets={[pending.target]} actorId={pending.playerId} iAct={iAct} canNop={false} onDone={onDone} onTargetNop={onTargetNop} />
  )
}

// 너! 마셔! (지목): 지목 → 3, 2, 1 → 축하 화면
function PickOverlay({ room, pending, me, iAct, onDone, onTargetNop }) {
  const step = useCountdown(`${pending.target}-${pending.startedAt}`)
  const who = room.players[pending.playerId]?.name
  if (step > 0) return <CountOverlay step={step} emoji="👉" sub={`${who}이(가) 지목한 사람은…`} />
  return <CongratsOverlay room={room} targets={[pending.target]} actorId={pending.playerId} iAct={iAct} canNop={false} onDone={onDone} onTargetNop={onTargetNop} />
}

// 🍺 오늘의 술고래: 게임 중엔 현재 잔 수 순위, 대기실에선 마지막 게임 결과
function DrinksModal({ room, me, onClose }) {
  const live = room.status === 'playing' || !room.summary
  const rows = live
    ? Object.entries(room.players || {})
        .filter(([, p]) => p?.name)
        .map(([pid, p]) => ({ pid, name: p.name, color: p.color, drinks: p.drinks || 0 }))
        .sort((a, b) => b.drinks - a.drinks)
    : room.summary.rows || []
  const top = rows[0]?.drinks || 0
  const total = rows.reduce((a, r) => a + r.drinks, 0)
  const medal = (i, d) => (d === 0 ? '' : d === top ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '')
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">🍺 오늘의 술고래</div>
        <h2>{top === 0 ? '아직 아무도 안 마셨어요 😇' : `${rows.filter((r) => r.drinks === top).map((r) => r.name).join(', ')} 🐳`}</h2>
        <div className="muted">{live ? '벌칙으로 마실 때 자동으로 세요' : '지난 게임 결과'} · 총 {total}잔</div>
        <div className="player-list" style={{ marginTop: 10 }}>
          {rows.map((r, i) => (
            <div className="player-row" key={r.pid}>
              <span className="order">{i + 1}</span>
              <span className="avatar" style={{ background: r.color }}>
                {r.name.slice(0, 1)}
              </span>
              <span className="player-name">
                {r.name} {r.pid === me && <span className="me-tag">나</span>}
              </span>
              <span className="drink-badge">🍺 {r.drinks}잔</span>
              <span className="summary-medal">{medal(i, r.drinks)}</span>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

// 다수결 지목: 모두 투표 → 행동자가 결과 공개 → 3, 2, 1 → 축하 화면
function VotePanel({ room, pending: p, me, iAct, code }) {
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  const votes = p.votes || {}
  const votedCount = ids.filter((pid) => votes[pid]).length
  const myVote = DEMO ? null : votes[me]
  const step = useCountdown(p.stage === 'result' ? `r-${p.revealedAt}` : 'vote')
  if (p.stage === 'result') {
    if (step > 0) return <CountOverlay step={step} emoji="🗳️" sub="투표 결과를 집계하고 있어요…" />
    const winners = voteWinners(p)
    const canNop = (DEMO || winners.includes(me)) && (room.players[DEMO ? winners[0] : me]?.nop || 0) > 0
    return (
      <CongratsOverlay
        room={room}
        targets={winners}
        actorId={p.playerId}
        iAct={iAct}
        canNop={false}
        onDone={() => resolvePending(code, room, 'done')}
        onTargetNop={() => resolvePending(code, room, 'target-nop')}
        title={winners.length > 1 ? '🎉 동점! Congratulations! 🎉' : '🎉 Congratulations! 🎉'}
      />
    )
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🗳️ 다수결 지목</div>
        <h2>누가 마실까요?</h2>
        <div className="muted">각자 한 명을 고르세요. 가장 많은 표를 받은 사람이 마셔요. ({votedCount}/{ids.length} 투표)</div>
        <div className="steal-list">
          {ids.map((pid) => {
            const pl = room.players[pid]
            return (
              <button key={pid} className={`steal-btn ${myVote === pid ? 'picked' : ''}`} onClick={() => castVote(code, room, pid)}>
                <span className="avatar sm" style={{ background: pl.color }}>
                  {pl.name.slice(0, 1)}
                </span>
                <span className="pname">{pl.name}</span>
                {myVote === pid && <span className="me-tag">내 표</span>}
              </button>
            )
          })}
        </div>
        <div className="actions">
          {iAct ? (
            <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'result')} disabled={!allVoted(room, ids, votes)}>
              결과 공개 {votedCount < ids.length ? `(${votedCount}/${ids.length})` : ''}
            </button>
          ) : (
            <div className="waiting">모두 투표하면 {room.players[p.playerId]?.name}이(가) 결과를 공개해요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 훈민정음 게임: 3, 2, 1 → 두 글자 초성 제시
function HunminPanel({ room, pending: p, iAct, code, keyId }) {
  const step = useCountdown(keyId)
  if (step > 0) return <CountOverlay step={step} emoji="📝" sub="초성을 뽑고 있어요…" />
  const actor = room.players[p.playerId]
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">📝 훈민정음 게임</div>
        <h2>{p.title || '훈민정음 게임'}</h2>
        <div className="chosung">{p.chosung}</div>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b> — 이 초성으로 시작하는 두 글자 단어를 돌아가며 말해요.
        </div>
        {iAct ? (
          <div className="actions">
            <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
              수행 완료
            </button>
          </div>
        ) : (
          <div className="actions">
            <div className="waiting">{actor?.name}이(가) 진행 중…</div>
          </div>
        )}
      </div>
    </div>
  )
}

// 밸런스 게임: 주제 A vs B → 각자 양자택일 → 결과 (소수 마시기 / 동점 재투표 / 만장일치 룰렛)
function BalancePanel({ room, pending: p, me, iAct, code }) {
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  const [ta, tb] = (BALANCE_TOPICS[p.topic] || ' vs ').split(' vs ')
  const votes = p.votes || {}
  const votedCount = ids.filter((pid) => votes[pid]).length
  const myVote = DEMO ? null : votes[me]
  const r = balanceResult(p)
  const step = useCountdown(p.stage === 'vote' ? 'vote' : `${p.stage}-${p.revealedAt}`)
  const actor = room.players[p.playerId]
  const title = p.title || '밸런스 게임'

  if (p.stage === 'roulette')
    return (
      <RouletteOverlay
        room={room}
        actorId={p.playerId}
        iAct={iAct}
        revealKey={p.revealedAt}
        title="🎯 만장일치! 룰렛"
        note={`${ta} ${r.a} : ${r.b} ${tb}`}
        options={[
          { emoji: '🍻', label: '다같이 마셔', color: '#f47725' },
          { emoji: '😇', label: '아무도 안 마셔', color: '#4cc9f0' },
        ]}
        pick={p.roulette === 'drink' ? 0 : 1}
        resultText={p.roulette === 'drink' ? '다같이 마셔! 🍻' : '아무도 안 마셔! 😇'}
        onDone={() => resolvePending(code, room, 'done')}
      />
    )
  if (p.stage === 'result') {
    if (step > 0) return <CountOverlay step={step} emoji="⚖️" sub="투표 결과를 집계하고 있어요…" />
    const canNop = (DEMO || r.losers.includes(me)) && !p.refused?.[DEMO ? r.losers[0] : me] && (room.players[DEMO ? r.losers[0] : me]?.nop || 0) > 0
    return (
      <CongratsOverlay
        room={room}
        targets={r.losers}
        actorId={p.playerId}
        iAct={iAct}
        canNop={false}
        refused={p.refused || {}}
        note={`${ta} ${r.a} : ${r.b} ${tb} · 소수 의견`}
        onDone={() => resolvePending(code, room, 'done')}
        onTargetNop={() => resolvePending(code, room, 'target-nop')}
      />
    )
  }
  if (p.stage === 'tie' && step > 0) return <CountOverlay step={step} emoji="⚖️" sub="투표 결과를 집계하고 있어요…" />
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">⚖️ {title} · {p.round || 1}라운드</div>
        {p.stage === 'tie' ? (
          <>
            <h2>🤝 동점!</h2>
            <div className="bal-topic result">
              <div className="opt">
                {ta}
                <span className="cnt">{r.a}표</span>
              </div>
              <div className="vs">{r.a}:{r.b}</div>
              <div className="opt">
                {tb}
                <span className="cnt">{r.b}표</span>
              </div>
            </div>
            <div className="muted">다수결이 나올 때까지 다른 주제로 다시 투표해요.</div>
            <div className="actions">
              {iAct ? (
                <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'reroll')}>
                  🔄 다른 주제로 다시 투표
                </button>
              ) : (
                <div className="waiting">{actor?.name}이(가) 다음 주제를 열어요</div>
              )}
            </div>
          </>
        ) : (
          <>
            <h2>둘 중 하나만!</h2>
            <div className="muted">
              각자 고르세요. 소수 의견이 마셔요. 동점이면 다른 주제로, 만장일치면 룰렛! ({votedCount}/{ids.length} 투표)
            </div>
            <div className="bal-topic pick">
              <button className={`opt ${myVote === 'A' ? 'on' : ''}`} onClick={() => balanceVote(code, room, 'A')}>
                {ta}
                {myVote === 'A' && <span className="me-tag">내 선택</span>}
              </button>
              <div className="vs">VS</div>
              <button className={`opt ${myVote === 'B' ? 'on' : ''}`} onClick={() => balanceVote(code, room, 'B')}>
                {tb}
                {myVote === 'B' && <span className="me-tag">내 선택</span>}
              </button>
            </div>
            <div className="actions">
              {iAct ? (
                <>
                  <button className="btn btn-ghost" onClick={() => resolvePending(code, room, 'reroll')} title="다른 주제">
                    🔄 다른 주제
                  </button>
                  <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'result')} disabled={!allVoted(room, ids, votes)}>
                    결과 공개 {votedCount < ids.length ? `(${votedCount}/${ids.length})` : ''}
                  </button>
                </>
              ) : (
                <div className="waiting">모두 고르면 {actor?.name}이(가) 결과를 공개해요</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// 만장일치 룰렛: 50/50 다같이 마셔 / 아무도 안 마셔
function RouletteOverlay({ room, actorId, iAct, onDone, revealKey, title, note, options, pick, resultText }) {
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
  }, [revealKey])
  useEffect(() => {
    if (done) {
      try {
        navigator.vibrate?.([80, 40, 80, 40, 200])
      } catch {}
    }
  }, [done])
  // 바늘은 위(0deg). options[0] 은 0~180deg(오른쪽 반), options[1] 은 180~360deg(왼쪽 반)
  const finalDeg = 360 * 5 + (pick === 0 ? 270 : 90)
  const pieces = Array.from({ length: 28 })
  return (
    <div className="ai-overlay">
      <div className="ai-reveal">
        {done && (
          <div className="confetti" aria-hidden>
            {pieces.map((_, i) => (
              <i key={i} style={{ '--i': i, left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, background: ['#ea002c', '#f47725', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'][i % 6] }} />
            ))}
          </div>
        )}
        <div className="ai-congrats">{title}</div>
        {note && <div className="ai-note">{note}</div>}
        <div className="roulette">
          <div className="needle" />
          <div className="wheel" style={{ transform: spun ? `rotate(${finalDeg}deg)` : 'rotate(0deg)', background: `conic-gradient(${options[0].color} 0deg 180deg, ${options[1].color} 180deg 360deg)` }}>
            <span className="half drink">{options[0].emoji}</span>
            <span className="half safe">{options[1].emoji}</span>
          </div>
        </div>
        <div className="roulette-legend">
          {options.map((o, i) => (
            <span key={i}>
              <i className="sw" style={{ background: o.color }} /> {o.label}
            </span>
          ))}
        </div>
        <div className="ai-name">{done ? <b>{resultText}</b> : <span className="muted-light">돌아가는 중…</span>}</div>
        <div className="ai-actions">
          {done && iAct ? (
            <button className="btn btn-primary" onClick={onDone}>
              확인
            </button>
          ) : done ? (
            <div className="waiting">{room.players[actorId]?.name}이(가) 확인하면 다음 차례로</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// 놉카드 도박: 할지 말지 선택 → 룰렛. 카드 있으면 +2 vs 전부 소멸, 없으면 안 마셔 vs 마셔
function GamblePanel({ room, pending: p, iAct, code }) {
  const actor = room.players[p.playerId]
  const nop = actor?.nop || 0
  if (p.stage === 'spin') {
    const win = p.roulette === 'win'
    const had = p.nopAtSpin ?? nop
    const options =
      had > 0
        ? [
            { emoji: '🎫', label: '놉카드 +2', color: '#06d6a0' },
            { emoji: '💀', label: `놉카드 ${had}장 소멸`, color: '#ea002c' },
          ]
        : [
            { emoji: '😇', label: '안 마셔', color: '#06d6a0' },
            { emoji: '🍶', label: '마셔', color: '#ea002c' },
          ]
    const resultText = had > 0 ? (win ? '놉카드 +2! 🎫🎫' : `놉카드 ${had}장 소멸… 💀`) : win ? '안 마셔도 돼요! 😇' : '마셔! 🍶'
    return (
      <RouletteOverlay
        room={room}
        actorId={p.playerId}
        iAct={iAct}
        revealKey={p.revealedAt}
        title="🎰 놉카드 도박"
        note={`${actor?.name} · 놉카드 ${had}장`}
        options={options}
        pick={win ? 0 : 1}
        resultText={resultText}
        onDone={() => resolvePending(code, room, 'done')}
      />
    )
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🎰 놉카드 도박</div>
        <h2>도박, 할까요?</h2>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b> — 현재 놉카드 {nop}장.{' '}
          {nop > 0 ? (
            <>
              룰렛 50%로 <b>놉카드 +2</b> 아니면 <b>보유 놉카드 전부 소멸</b>이에요.
            </>
          ) : (
            <>
              카드가 없어서 룰렛 50%로 <b>안 마시기</b> 아니면 <b>마시기</b>예요.
            </>
          )}{' '}
          안 해도 아무 일 없어요.
        </div>
        <div className="actions">
          {iAct ? (
            <>
              <button className="btn btn-ghost" onClick={() => resolvePending(code, room, 'skip')}>
                😌 안 할래요
              </button>
              <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'spin')}>
                🎰 도박한다!
              </button>
            </>
          ) : (
            <div className="waiting">{actor?.name}이(가) 고민 중…</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 폭탄 돌리기: 주제에 맞는 단어를 돌아가며 말하다가 랜덤 타이밍에 터짐 → 말하던 사람 마시기
function BombPanel({ room, pending: p, iAct, code }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (p.stage !== 'ticking') return
    const t = setInterval(() => tick((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [p.stage])
  const exploded = p.stage === 'ticking' && p.explodeAt && serverNow() >= p.explodeAt
  const bombRef = useRef(false)
  useEffect(() => {
    if (exploded && !bombRef.current) {
      bombRef.current = true
      boom()
      try {
        navigator.vibrate?.([300, 100, 300, 100, 600])
      } catch {}
    }
    if (!exploded) bombRef.current = false
  }, [exploded])
  // 째깍 소리 (1초마다)
  useEffect(() => {
    if (p.stage !== 'ticking' || exploded) return
    const t = setInterval(tickSound, 1000)
    return () => clearInterval(t)
  }, [p.stage, exploded])
  const actor = room.players[p.playerId]
  if (p.stage === 'ticking') {
    return (
      <div className={`ai-overlay bomb ${exploded ? 'boom' : ''}`}>
        <div className="ai-reveal">
          {exploded ? (
            <>
              <div className="bomb-emo">💥</div>
              <div className="ai-congrats">터졌다!</div>
              <div className="ai-name">
                <b>지금 말하던 사람</b> 마셔! 🍶
              </div>
              <div className="ai-actions">
                {iAct ? (
                  <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
                    확인
                  </button>
                ) : (
                  <div className="waiting">{actor?.name}이(가) 확인하면 다음 차례로</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bomb-emo ticking">💣</div>
              <div className="ai-note">주제</div>
              <div className="bomb-topic">{p.topic}</div>
              <div className="ai-sub">{actor?.name}부터 돌아가며 하나씩 말하세요. 언제 터질지 아무도 몰라요!</div>
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">💣 {p.title || '폭탄 돌리기'}</div>
        <h2>주제: {p.topic}</h2>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b>부터 시계 방향으로 주제에 맞는 단어를 하나씩 말해요. 폭탄은 15~40초 사이 아무 때나 터지고, 터질 때 말하던(또는 머뭇거리던) 사람이 마셔요. 이미 나온 단어를 말하거나 3초 넘게 뜸 들이면 그 사람이 마셔요.
        </div>
        <div className="actions">
          {iAct ? (
            <>
              <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'start')}>
                💣 폭탄 시작
              </button>
            </>
          ) : (
            <div className="waiting">{actor?.name}이(가) 폭탄을 켜면 시작돼요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 반응속도 게임: 초록불이 되면 탭! 가장 느린 사람(부정출발 포함)이 마시기
function ReactionPanel({ room, pending: p, me, iAct, code }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (p.stage !== 'armed') return
    const t = setInterval(() => tick((x) => x + 1), 50)
    return () => clearInterval(t)
  }, [p.stage])
  const actor = room.players[p.playerId]
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  if (p.stage === 'armed') {
    const go = p.goAt && serverNow() >= p.goAt
    const mine = DEMO ? null : p.results?.[me]
    const tapped = mine != null
    const doneCount = ids.filter((pid) => p.results?.[pid] != null).length
    return (
      <div className={`ai-overlay react ${go ? 'go' : 'wait'}`} onClick={() => !tapped && reactionTap(code, room)}>
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
              <div className="ai-sub">화면이 초록색으로 바뀌면 바로 탭! 먼저 누르면 부정출발</div>
            </>
          )}
          {iAct && go && (
            <div className="ai-actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-primary" disabled={!allVoted(room, ids, p.results || {})} onClick={() => resolvePending(code, room, 'result')}>
                결과 공개 {doneCount < ids.length ? `(${doneCount}/${ids.length})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }
  if (p.stage === 'result') {
    const rows = reactionRanking(room, p)
    const loser = rows[rows.length - 1]
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="kicker">⚡ {p.title || '반응속도 게임'}</div>
          <h2>결과</h2>
          <div className="shuffle-list">
            {rows.map((r, i) => (
              <div key={r.pid} className={`shuffle-row ${r.pid === loser?.pid ? 'loser' : ''}`}>
                <span className="order">{i + 1}</span>
                <span className="avatar sm" style={{ background: room.players[r.pid]?.color }}>
                  {room.players[r.pid]?.name?.slice(0, 1)}
                </span>
                <span className="pname">{room.players[r.pid]?.name}</span>
                <span className="tag tag-gray">{r.label}</span>
                {r.pid === loser?.pid && <span className="tag">마셔! 🍶</span>}
              </div>
            ))}
          </div>
          <div className="actions">
            {iAct ? (
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
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">⚡ {p.title || '반응속도 게임'}</div>
        <h2>초록불이 되면 탭!</h2>
        <div className="muted">
          시작하면 모든 폰이 빨간 화면으로 바뀌고, 2~6초 뒤 아무 때나 초록색 "탭!"이 떠요. 가장 빨리 탭한 순서로 순위가 나오고 <b>가장 느린 사람이 마셔요.</b> 초록불 전에 누르면 부정출발로 꼴찌!
        </div>
        <div className="actions">
          {iAct ? (
            <>
              <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'start')}>
                ⚡ 시작
              </button>
            </>
          ) : (
            <div className="waiting">{actor?.name}이(가) 시작하면 준비하세요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 의리주: 3, 2, 1 → 무작위 순서 공개
function ShufflePanel({ room, pending: p, iAct, code }) {
  const step = useCountdown(`${p.startedAt}`)
  if (step > 0) return <CountOverlay step={step} emoji="🥂" sub="의리주 순서를 정하고 있어요…" />
  const order = (p.order || []).filter((pid) => room.players[pid]?.name)
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🥂 의리주</div>
        <h2>이 순서로 마셔요!</h2>
        <div className="shuffle-list">
          {order.map((pid, i) => (
            <div key={pid} className="shuffle-row">
              <span className="order">{i + 1}</span>
              <span className="avatar sm" style={{ background: room.players[pid].color }}>
                {room.players[pid].name.slice(0, 1)}
              </span>
              <span className="pname">{room.players[pid].name}</span>
              {i === 0 && <span className="tag">첫 잔</span>}
              {i === order.length - 1 && order.length > 1 && <span className="tag tag-gray">마지막</span>}
            </div>
          ))}
        </div>
        <div className="actions">
          {iAct ? (
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

// 라이어 게임(워드 울프): 키워드 확인 → 설명 → 투표 → 결과. 모든 폰에 표시
function LiarPanel({ room, pending: p, me, iAct, code }) {
  const [openTally, setOpenTally] = useState(null) // 결과 화면에서 펼친 득표 칸
  const [show, setShow] = useState(false)
  useEffect(() => setShow(false), [p.stage])
  const ids = Object.keys(p.words || {}).filter((pid) => room.players[pid]?.name)
  const myWord = DEMO ? p.majority : p.words?.[me]
  const revealedCount = ids.filter((pid) => p.revealed?.[pid]).length
  const votes = p.votes || {}
  const votedCount = ids.filter((pid) => votes[pid]).length
  const myVote = DEMO ? null : votes[me]
  const cat = liarCategory(p.category)
  // 설명 순서: 행동 주체부터 차례대로
  const order = roomOrder(room)
  const startIdx = Math.max(0, order.indexOf(p.playerId))
  const speak = [...order.slice(startIdx), ...order.slice(0, startIdx)].filter((pid) => ids.includes(pid))
  const res = p.stage === 'result' ? liarResult(room, p) : null
  const step = useCountdown(p.stage === 'result' ? 'result' : 'x')
  if (p.stage === 'result' && step > 0) return <CountOverlay step={step} emoji="🤥" sub="누가 다른 키워드였을까요…" />
  return (
    <div className="modal-backdrop">
      <div className="modal liar">
        <div className="kicker">🤥 라이어 게임 · {cat.emoji} {cat.name}</div>
        {p.stage === 'reveal' && (
          <>
            <h2>각자 키워드를 확인하세요!</h2>
            <div className="muted">한 명만 비슷하지만 다른 키워드를 받았어요. 누가 라이어인지는 본인도 몰라요. 키워드를 직접 말하지 말고 관련 설명만 하세요.</div>
            {myWord ? (
              <button
                className={`word-card ${show ? 'on' : ''}`}
                onClick={() => {
                  setShow((v) => !v)
                  if (!show) liarReveal(code, room)
                }}
              >
                {show ? (
                  <>
                    <span className="word-label">내 키워드</span>
                    <span className="word">{myWord}</span>
                    <span className="word-hint">다시 탭하면 숨겨요</span>
                  </>
                ) : (
                  <>
                    <span className="word-label">탭해서 확인</span>
                    <span className="word">🔒</span>
                    <span className="word-hint">다른 사람이 보지 않게 조심!</span>
                  </>
                )}
              </button>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>
                이 게임에 참여하지 않은 참가자예요 (게임 시작 후 입장).
              </div>
            )}
            <div className="section-title">설명 순서 · 확인 {revealedCount}/{ids.length}</div>
            <div className="speak-list">
              {speak.map((pid, i) => (
                <span key={pid} className={`speak ${p.revealed?.[pid] ? 'ok' : ''}`}>
                  <b>{i + 1}</b> {room.players[pid].name}
                  {p.revealed?.[pid] ? ' ✓' : ''}
                </span>
              ))}
            </div>
            <div className="actions">
              {iAct ? (
                <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'vote-start')}>
                  설명 끝 → 투표 시작 {revealedCount < ids.length ? `(확인 ${revealedCount}/${ids.length})` : ''}
                </button>
              ) : (
                <div className="waiting">설명이 끝나면 {room.players[p.playerId]?.name}이(가) 투표를 시작해요</div>
              )}
            </div>
          </>
        )}
        {p.stage === 'vote' && (
          <>
            <h2>라이어는 누구?</h2>
            <div className="muted">다른 키워드를 받은 것 같은 사람을 한 명 고르세요. ({votedCount}/{ids.length} 투표)</div>
            <div className="steal-list">
              {ids.map((pid) => {
                const pl = room.players[pid]
                    return (
                  <button key={pid} className={`steal-btn ${myVote === pid ? 'picked' : ''}`} disabled={!DEMO && !p.words?.[me]} onClick={() => liarVote(code, room, pid)}>
                    <span className="avatar sm" style={{ background: pl.color }}>
                      {pl.name.slice(0, 1)}
                    </span>
                    <span className="pname">{pl.name}</span>
                        {myVote === pid && <span className="me-tag">내 표</span>}
                  </button>
                )
              })}
            </div>
            <div className="actions">
              {iAct ? (
                <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'result')} disabled={!allVoted(room, ids, votes)}>
                  결과 공개 {votedCount < ids.length ? `(${votedCount}/${ids.length})` : ''}
                </button>
              ) : (
                <div className="waiting">모두 투표하면 {room.players[p.playerId]?.name}이(가) 결과를 공개해요</div>
              )}
            </div>
          </>
        )}
        {p.stage === 'result' && res && (
          <>
            <h2>결과 공개</h2>
            <div className="liar-reveal">
              <div className="liar-row">
                <span className="avatar" style={{ background: room.players[p.liar]?.color }}>
                  {room.players[p.liar]?.name?.slice(0, 1)}
                </span>
                <div>
                  <div className="muted">다른 키워드를 받은 사람</div>
                  <b>{room.players[p.liar]?.name}</b>
                </div>
              </div>
              <div className="muted">득표 칸을 누르면 누가 찍었는지 보여요 · 라이어를 맞힌 사람은 안 마셔요</div>
              <div className="tally">
                {ids
                  .map((pid) => ({ pid, n: res.tally[pid] || 0 }))
                  .sort((a, b) => b.n - a.n)
                  .map(({ pid, n }) => {
                    const voters = ids.filter((v) => p.votes?.[v] === pid)
                    const open = openTally === pid
                    return (
                      <div key={pid} className={`tally-item ${open ? 'open' : ''}`}>
                        <button type="button" className={`tally-row ${pid === p.liar ? 'liar' : ''}`} onClick={() => setOpenTally(open ? null : pid)}>
                          <span className="avatar sm" style={{ background: room.players[pid]?.color }}>
                            {room.players[pid]?.name?.slice(0, 1)}
                          </span>
                          <span className="pname">{room.players[pid]?.name}</span>
                          <span className="tally-bar">
                            <i style={{ width: `${ids.length ? (n / ids.length) * 100 : 0}%` }} />
                          </span>
                          <b>{n}표</b>
                          <span className="tally-chev">{open ? '▴' : '▾'}</span>
                        </button>
                        {open && (
                          <div className="tally-voters">
                            {voters.length === 0 && <span className="muted">아무도 안 찍었어요</span>}
                            {voters.map((v) => (
                              <span key={v} className={`voter-chip ${pid === p.liar ? 'right' : 'wrong'}`}>
                                <span className="avatar xs" style={{ background: room.players[v]?.color }}>
                                  {room.players[v]?.name?.slice(0, 1)}
                                </span>
                                {room.players[v]?.name}
                                <em>{pid === p.liar ? '✅ 맞힘' : '🍶 마셔'}</em>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
            <div className="actions">
              {iAct ? (
                <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
                  확인
                </button>
              ) : (
                <div className="waiting">{room.players[p.playerId]?.name}이(가) 확인하면 다음 차례로</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BalanceTopic({ topic }) {
  const [a, b] = topic.split(' vs ')
  return (
    <div className="bal-topic">
      <div className="opt">{a}</div>
      <div className="vs">VS</div>
      <div className="opt">{b}</div>
    </div>
  )
}

// 돌발 미션: 진행 배너(전원) + 수행자 전용 미션 보기
function MissionBanner({ room, me }) {
  const m = room.mission
  const [, tick] = useState(0)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => setShow(false), [m?.id])
  if (!m || m.stage !== 'active') return null
  const left = Math.max(0, m.endsAt - serverNow())
  const mm = String(Math.floor(left / 60000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  const mine = DEMO || m.playerId === me
  const pct = Math.max(0, Math.min(100, (left / (m.minutes * 60000)) * 100))
  return (
    <div className="timers">
      <div className={`timer mission ${left < 30000 ? 'soon' : ''}`} onClick={() => mine && setShow((v) => !v)} role={mine ? 'button' : undefined}>
        <div className="timer-bar" style={{ width: `${pct}%` }} />
        <span className="timer-text">🎯 {mine ? (show ? m.detail : '내 돌발 미션 · 탭해서 보기') : '누군가에게 돌발 미션이 주어졌습니다!'}</span>
        <span className="timer-who">{mine ? (show ? '탭해서 숨기기' : '🤫') : '???'}</span>
        <span className="timer-time">
          {mm}:{ss}
        </span>
      </div>
    </div>
  )
}

// 돌발 미션: 시작 시 전원 팝업 (수행자는 미션 내용, 나머지는 안내) + 확인 인원 표시
function MissionCard({ room, me, code, onClose }) {
  const m = room.mission
  if (!m || m.stage !== 'active') return null
  const mine = DEMO || m.playerId === me
  const done = () => {
    missionAck(code, room)
    onClose()
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">{mine ? '🤫 당신에게 돌발 미션!' : '🎯 돌발 미션!'}</div>
        <h2>{mine ? m.detail : '누군가에게 돌발 미션이 주어졌습니다!'}</h2>
        <div className="muted">
          {mine
            ? `${m.minutes}분 안에 아무도 눈치 못 채게 수행하세요. 시간이 끝나면 다른 사람들이 어떤 미션이었는지 5지선다로 맞혀요. 절반 이상이 맞히면 당신이, 못 맞히면 틀린 사람들이 마셔요.`
            : `${m.minutes}분 동안 누가 이상한 행동을 하는지 잘 관찰하세요 👀 시간이 끝나면 그 사람이 공개되고, 어떤 미션이었는지 5지선다로 맞히는 투표가 열려요. 절반 이상이 맞히면 그 사람이, 못 맞히면 틀린 사람들이 마셔요.`}
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={done}>
            {mine ? '알겠어요, 시작!' : '확인했어요'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 돌발 미션: 시간 종료 → 수행자 공개 → 5지선다 → 3·2·1 → 결과
function MissionQuiz({ room, me, code }) {
  const m = room.mission
  const step = useCountdown(m?.stage === 'result' ? `${m.revealedAt}` : 'x')
  if (!m || (m.stage !== 'quiz' && m.stage !== 'result')) return null
  const who = room.players[m.playerId]
  const isPerformer = !DEMO && m.playerId === me
  const canControl = DEMO || isPerformer || room.hostId === me
  const voters = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && pid !== m.playerId)
  const votes = m.votes || {}
  const votedCount = voters.filter((pid) => votes[pid] != null).length
  const myVote = DEMO ? null : votes[me]
  if (m.stage === 'result') {
    if (step > 0) return <CountOverlay step={step} emoji="🎯" sub="정답을 공개합니다…" />
    const r = missionResult(room, m)
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="kicker">🎯 돌발 미션 결과</div>
          <h2>{r.caught ? '들켰다! 😳' : '아무도 못 맞혔다! 😎'}</h2>
          <div className="mission-answer">
            <span className="muted">{who?.name}의 미션</span>
            <b>{m.text}</b>
          </div>
          <div className="steal-list">
            {voters.map((pid) => {
              const v = votes[pid]
              const ok = v === m.answer
              return (
                <div key={pid} className={`steal-btn ${v == null ? 'none' : ok ? 'picked' : 'wrong'}`}>
                  <span className="avatar sm" style={{ background: room.players[pid].color }}>
                    {room.players[pid].name.slice(0, 1)}
                  </span>
                  <span className="pname">{room.players[pid].name}</span>
                  <span className={`tag ${ok ? '' : 'tag-gray'}`}>{v == null ? '미투표' : ok ? '정답 ✓' : m.choices[v]}</span>
                </div>
              )
            })}
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {r.caught ? `절반 이상이 맞혔어요 → ${who?.name} 마셔! 🍶` : `${r.wrong.length ? r.wrong.map((pid) => room.players[pid]?.name).join(', ') + ' 마셔! 🍶' : '아무도 안 마셔요 😇'}`}
          </div>
          <div className="actions">
            {canControl ? (
              <button className="btn btn-primary" onClick={() => missionDone(code, room)}>
                확인
              </button>
            ) : (
              <div className="waiting">{who?.name} 또는 방장이 확인하면 닫혀요</div>
            )}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🎯 돌발 미션</div>
        <h2>
          <b style={{ color: who?.color }}>{who?.name}</b>의 미션 수행 시간이 끝났습니다!
        </h2>
        <div className="muted">어떤 미션이 주어졌을까요? ({votedCount}/{voters.length} 투표)</div>
        {isPerformer ? (
          <div className="mission-answer">
            <span className="muted">내 미션</span>
            <b>{m.detail}</b>
          </div>
        ) : (
          <div className="choice-list">
            {m.choices.map((c, i) => (
              <button key={i} className={`choice ${myVote === i ? 'on' : ''}`} onClick={() => missionVote(code, room, i)}>
                <span className="choice-no">{i + 1}</span>
                <span>{c}</span>
              </button>
            ))}
          </div>
        )}
        <div className="actions">
          {canControl ? (
            <button className="btn btn-primary" onClick={() => missionReveal(code, room)} disabled={!allVoted(room, voters, votes)}>
              결과 공개 {votedCount < voters.length ? `(${votedCount}/${voters.length})` : ''}
            </button>
          ) : (
            <div className="waiting">모두 고르면 {who?.name}이(가) 결과를 공개해요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 진행 중인 옵션 타이머 (모든 폰에 표시, 1초마다 갱신)
function OptionTimers({ options }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const list = Object.entries(options || {}).sort((a, b) => a[1].endsAt - b[1].endsAt)
  if (!list.length) return null
  const nowMs = Date.now()
  return (
    <div className="timers">
      {list.map(([k, o]) => {
        const left = Math.max(0, o.endsAt - nowMs)
        const mm = String(Math.floor(left / 60000)).padStart(2, '0')
        const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
        const pct = o.minutes ? Math.max(0, Math.min(100, (left / (o.minutes * 60000)) * 100)) : 0
        return (
          <div className={`timer ${left < 60000 ? 'soon' : ''}`} key={k}>
            <div className="timer-bar" style={{ width: `${pct}%` }} />
            <span className="timer-text">{o.text}</span>
            <span className="timer-who">{o.who || '모두'}</span>
            <span className="timer-time">{left === 0 ? '끝!' : `${mm}:${ss}`}</span>
          </div>
        )
      })}
    </div>
  )
}

// 진단 패널: 주소 뒤에 ?debug=1 을 붙이면 표시. 오류와 방 상태를 모아 복사할 수 있음
const DEBUG = new URLSearchParams(window.location.search).has('debug')
const errLog = []
if (DEBUG) {
  window.addEventListener('error', (e) => errLog.push(`[error] ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => errLog.push(`[promise] ${e.reason?.message || e.reason}`))
}
function DebugPanel({ room, code, me, connected }) {
  const [open, setOpen] = useState(true)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const info = {
    time: new Date().toISOString(),
    ua: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    connected,
    code,
    me,
    online: navigator.onLine,
    room: room && {
      status: room.status,
      hostId: room.hostId,
      teamCount: room.teamCount,
      teamTurn: room.teamTurn,
      memberIdx: room.memberIdx,
      turnNo: room.turnNo,
      yut: room.yut,
      pieces: room.pieces,
      players: Object.fromEntries(Object.entries(room.players || {}).map(([k, v]) => [k, `${v.name} team=${v.team} nop=${v.nop || 0} drinks=${v.drinks || 0} online=${v.online}`])),
      pending: room.pending,
      lastMove: room.lastMove && { id: room.lastMove.id, team: room.lastMove.team, path: room.lastMove.path, dest: room.lastMove.dest, caught: room.lastMove.caught },
      options: room.options,
      mission: room.mission && { stage: room.mission.stage, playerId: room.mission.playerId, endsIn: Math.round((room.mission.endsAt - Date.now()) / 1000), text: room.mission.text },
      serverOffset: serverNow() - Date.now(),
      rollsSinceMission: room.rollsSinceMission,
      event: room.event?.text,
    },
    errors: errLog.slice(-20),
  }
  const text = JSON.stringify(info, null, 1)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      alert('진단 정보를 복사했어요. 채팅에 붙여넣어 주세요.')
    } catch {
      prompt('아래 내용을 길게 눌러 복사하세요', text)
    }
  }
  return (
    <div className={`debug ${open ? '' : 'min'}`}>
      <div className="debug-bar">
        <b>DEBUG</b>
        <span className={connected ? 'ok' : 'bad'}>{connected ? '연결됨' : '연결 안 됨'}</span>
        <span>{room?.status || '-'}</span>
        <span>err {errLog.length}</span>
        <span className="spacer" />
        <button onClick={copy}>복사</button>
        <button onClick={() => setOpen((o) => !o)}>{open ? '접기' : '펼치기'}</button>
      </div>
      {open && <pre>{text}</pre>}
    </div>
  )
}

function NopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// 게임 종료 후 대기실에 뜨는 "오늘의 결과" (마신 잔 수 랭킹)
function SummaryCard({ summary, me, onClose }) {
  const rows = summary.rows || []
  const top = rows[0]?.drinks || 0
  const mins = summary.startedAt ? Math.max(1, Math.round((summary.at - summary.startedAt) / 60000)) : null
  const medal = (i, d) => (d === 0 ? '' : d === top ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '')
  return (
    <div className="card card-pad stack summary-card">
      <div className="row">
        <div>
          <div className="label">🏆 오늘의 결과</div>
          <div className="big-code" style={{ letterSpacing: '-0.02em', fontSize: 22 }}>
            {top === 0 ? '아무도 안 마셨어요 😇' : `오늘의 술고래: ${rows.filter((r) => r.drinks === top).map((r) => r.name).join(', ')} 🐳`}
          </div>
          {summary.winner != null && TEAM_INFO[summary.winner] && (
            <div className="summary-win" style={{ color: TEAM_INFO[summary.winner].color }}>
              🏆 {TEAM_INFO[summary.winner].name} 승리
            </div>
          )}
          {mins && (
            <div className="muted">
              총 {mins}분 · {rows.reduce((a, r) => a + r.drinks, 0)}잔
            </div>
          )}
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="닫기" title="닫기">
          ✕
        </button>
      </div>
      <div className="player-list">
        {rows.map((r, i) => (
          <div className="player-row" key={r.pid}>
            <span className="order">{i + 1}</span>
            <span className="avatar" style={{ background: r.color }}>
              {r.name.slice(0, 1)}
            </span>
            <span className="player-name">
              {r.name} {r.pid === me && <span className="me-tag">나</span>}
              {r.team != null && TEAM_INFO[r.team] && <span className="team-chip" style={{ '--tc': TEAM_INFO[r.team].color }}>{TEAM_INFO[r.team].short}</span>}
            </span>
            <span className="drink-badge">🍺 {r.drinks}잔</span>
            <span className="summary-medal">{medal(i, r.drinks)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 승리 화면 (모든 폰) → 방장이 대기실로
function WinOverlay({ room, pending: p, isHost, onDone }) {
  const info = TEAM_INFO[p.team] || TEAM_INFO[0]
  const mem = teamMembers(room, p.team)
  const pieces = Array.from({ length: 36 })
  return (
    <div className="ai-overlay">
      <div className="ai-reveal">
        <div className="confetti" aria-hidden>
          {pieces.map((_, i) => (
            <i key={i} style={{ '--i': i, left: `${(i * 29) % 100}%`, animationDelay: `${(i % 9) * 0.1}s`, background: [info.color, '#ffd166', '#06d6a0', '#4cc9f0', '#f47725'][i % 5] }} />
          ))}
        </div>
        <div className="ai-congrats">🏆 {info.name} 승리!</div>
        <div className="ai-avatars">
          {mem.map((t) => (
            <div key={t} className="ai-avatar" style={{ background: room.players[t]?.color }}>
              {room.players[t]?.name?.slice(0, 1)}
            </div>
          ))}
        </div>
        <div className="ai-note">{mem.map((t) => room.players[t]?.name).join(', ')} — 말 {pieceCountOf(room)}개 모두 골인!</div>
        <div className="ai-name">
          <b>나머지 팀</b> 다 마셔! 🍻
        </div>
        <div className="ai-actions">
          {isHost ? (
            <button className="btn btn-primary" onClick={onDone}>
              대기실로 (결과 보기)
            </button>
          ) : (
            <div className="waiting">방장이 대기실로 돌아가면 오늘의 결과가 보여요</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 판 아래 줄: 안내 + 판 크게/작게 보기
function BoardTools({ zoom, onToggle, hint }) {
  return (
    <div className="board-tools">
      <span className="muted">{zoom ? '좌우로 밀어서 판을 보세요' : hint}</span>
      <button className={`btn btn-ghost btn-sm ${zoom ? 'on' : ''}`} onClick={onToggle}>
        {zoom ? '판 작게 보기' : '🔍 판 크게 보기'}
      </button>
    </div>
  )
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const me = myId()

  // ---- 접속 정보 ----
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('name') || ''
    } catch {
      return ''
    }
  })
  const [code, setCode] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('room')
    if (q) return q.toUpperCase()
    try {
      return sessionStorage.getItem('room') || ''
    } catch {
      return ''
    }
  })
  const [room, setRoom] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [busyBtn, setBusyBtn] = useState(false)

  // ---- 화면 상태 ----
  const [toast, setToast] = useState(null)
  const [peek, setPeek] = useState(null)
  const [showLog, setShowLog] = useState(false)
  const [missionSeen, setMissionSeen] = useState(null) // 확인한 돌발 미션 id
  const [nopConfirm, setNopConfirm] = useState(null) // 놉카드 사용 확인 중인 참가자 id
  const [showDrinks, setShowDrinks] = useState(false) // 🍺 오늘의 술고래 순위 팝업
  const [summaryHidden, setSummaryHidden] = useState(null) // 닫은 결과 카드 id
  const [nopGive, setNopGive] = useState(false) // 양도 대상 선택 중
  const [pwInput, setPwInput] = useState('') // 방 만들 때 비밀번호(선택)
  const [roomList, setRoomList] = useState([]) // 홈 화면 방 목록
  const [joinTarget, setJoinTarget] = useState(null) // 비밀번호 입력 중인 방 {code}
  const [pwJoin, setPwJoin] = useState('')
  const [editing, setEditing] = useState(null) // { node, cell, text }
  const [throwAnim, setThrowAnim] = useState(null) // { id, value, sticks, playerId, phase }
  const [moveAnim, setMoveAnim] = useState(null) // { team, node, count }
  const [animating, setAnimating] = useState(false)
  const [sel, setSel] = useState(0) // 고른 윷 결과 번호
  const [zoom, setZoom] = useState(false) // 판 크게 보기 (칸 글자까지 보임, 좌우로 밀어서 봄)
  const boardRef = useRef(null)
  const [shake, setShake] = useState(() => {
    try {
      return localStorage.getItem('shake') === '1'
    } catch {
      return false
    }
  })
  const missionRef = useRef(null)
  const lastMoveId = useRef(null)
  const lastThrowId = useRef(null)
  const lastEventId = useRef(null)

  const flash = (msg, ms = 1800) => {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }

  useEffect(() => subscribeConnection(setConnected), [])
  useEffect(() => watchServerOffset(), [])

  // 앱을 열 때 한 번: 오래된 방 정리
  useEffect(() => {
    if (connected) purgeRooms()
  }, [connected])

  // 홈 화면: 열린 방 목록 구독
  useEffect(() => {
    if (code || !connected) return
    return subscribeRoomList(setRoomList)
  }, [code, connected])

  // 방 구독
  useEffect(() => {
    if (!code) {
      setRoom(null)
      return
    }
    try {
      sessionStorage.setItem('room', code)
    } catch {}
    let first = true
    const off = subscribeRoom(code, (r) => {
      if (first) {
        // 처음 받은 스냅샷의 던지기/이동/이벤트는 재생하지 않음
        first = false
        lastMoveId.current = r?.lastMove?.id ?? 'none'
        lastThrowId.current = r?.lastThrow?.id ?? 'none'
        lastEventId.current = r?.event?.id ?? 'none'
      }
      setRoom(r)
      if (r === null) {
        setCode('')
        setError('방이 사라졌어요.')
      }
    })
    return () => off()
  }, [code])

  // 참가가 확정된 뒤에만 접속 상태 기록
  const joined = !!room?.players?.[me]?.name
  useEffect(() => {
    if (code && joined) setupPresence(code)
  }, [code, joined])

  // 링크로 들어왔는데 아직 참가 전이면 자동 참가 시도 (이름이 있을 때)
  const leavingRef = useRef(false)
  useEffect(() => {
    if (room && !room.players?.[me]?.name) {
      if (leavingRef.current) return // 내가 나가는 중이면 자동 재참가 금지
      if (room.kicked?.[me]) {
        setCode('')
        setError('방장이 방에서 내보냈어요.')
        return
      }
      if (room.pw) {
        // 비밀번호 방: 링크로 들어와도 비밀번호를 물어봄
        setCode('')
        setJoinTarget({ code })
        setPwJoin('')
        return
      }
      if (name.trim()) {
        joinRoom(code, name.trim()).catch((e) => {
          setCode('')
          setError(e.message)
        })
      } else {
        setCode('')
        setError('이름을 입력하고 아래 목록에서 방을 눌러주세요.')
      }
    }
  }, [room, me, name, code])

  // 윷 던지기 애니메이션: lastThrow 가 바뀌면 모든 폰에서 같은 결과로 재생
  useEffect(() => {
    const th = room?.lastThrow
    if (!th || th.id === lastThrowId.current) return
    lastThrowId.current = th.id
    let cancelled = false
    ;(async () => {
      setThrowAnim({ ...th, phase: 'spin' })
      try {
        navigator.vibrate?.(40)
      } catch {}
      await sleep(900)
      if (cancelled) return
      setThrowAnim({ ...th, phase: 'show' })
      if (isBonus(th.value) || th.value === 0) ding()
      try {
        navigator.vibrate?.(isBonus(th.value) ? [60, 40, 60, 40, 140] : 60)
      } catch {}
      await sleep(isBonus(th.value) || th.value === 0 ? 1500 : 1100)
      if (cancelled) return
      setThrowAnim(null)
    })()
    return () => {
      cancelled = true
    }
  }, [room?.lastThrow?.id])

  // 말 이동 애니메이션: lastMove 경로대로 한 칸씩
  useEffect(() => {
    const mv = room?.lastMove
    if (!mv || mv.id === lastMoveId.current) return
    lastMoveId.current = mv.id
    let cancelled = false
    ;(async () => {
      setAnimating(true)
      for (const node of mv.path || []) {
        if (cancelled) return
        setMoveAnim({ team: mv.team, node, count: mv.count || 1 })
        await sleep(260)
      }
      await sleep(160)
      if (cancelled) return
      setMoveAnim(null)
      setAnimating(false)
    })()
    return () => {
      cancelled = true
    }
  }, [room?.lastMove?.id])

  // 이벤트 토스트
  useEffect(() => {
    const ev = room?.event
    if (!ev || ev.id === lastEventId.current) return
    lastEventId.current = ev.id
    setToast(oneLine(ev.text))
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [room?.event?.id])

  // ---- 파생 값 ----
  const isHost = room?.hostId === me
  const cells = room ? roomCells(room) : roomCells({})
  const tc = room ? teamCount(room) : 2
  const pieces = room ? roomPieces(room) : {}
  const curId = room ? currentPlayerId(room) : null
  const cur = curId && room?.players?.[curId]
  const curTeam = room ? currentTeam(room) : 0
  const curInfo = TEAM_INFO[curTeam] || TEAM_INFO[0]
  const myTurn = DEMO || (!!curId && curId === me)
  const pending = room?.pending
  const y = room?.yut || {}
  const results = arr(y.results)
  const extra = y.extra || 0
  const stage = y.stage || 'throw'
  const unplayedMove = !!room?.lastMove && room.lastMove.id !== lastMoveId.current
  const unplayedThrow = !!room?.lastThrow && room.lastThrow.id !== lastThrowId.current
  const busy = animating || !!throwAnim || unplayedMove || unplayedThrow
  // 윷가락이 돌아가는 동안에는 결과(칩·윷가락 모양)를 숨김 — 스포 방지
  const throwHidden = throwAnim ? throwAnim.phase === 'spin' : unplayedThrow
  const showPending = !!pending && !busy
  const iAct = DEMO || pending?.playerId === me
  const playing = room?.status === 'playing'
  const canThrow = playing && myTurn && !pending && stage === 'throw' && room.winner == null && !busy
  const canMove = playing && myTurn && !pending && stage === 'move' && room.winner == null && !busy
  const usable = results.map((v) => moveOptions(pieces, curTeam, v).length > 0)
  const selIdx = usable[sel] ? sel : usable.findIndex(Boolean)
  const options = canMove && selIdx >= 0 ? moveOptions(pieces, curTeam, results[selIdx]) : []
  const movable = new Set(options.filter((o) => o.from !== 'home').map((o) => o.from))
  movable.team = curTeam
  const dests = new Set(options.filter((o) => !o.finished).map((o) => o.dest))
  const playerCount = Object.keys(room?.players || {}).filter((pid) => room.players[pid]?.name).length

  // 결과가 바뀌면 첫 번째 쓸 수 있는 윷을 기본 선택
  useEffect(() => setSel(0), [results.length, room?.turnNo])

  // 이동 애니메이션 표시값: 움직이는 말 / 도착 칸에서 잠시 숨길 말 / 잡힌 말(애니메이션 끝까지 보여줌)
  const lm = room?.lastMove
  const mover = moveAnim || (unplayedMove && lm && lm.from !== 'home' ? { team: lm.team, node: lm.from, count: lm.count || 1 } : null)
  const hide = (moveAnim || unplayedMove) && lm && lm.dest !== 'goal' ? { team: lm.team, node: lm.dest, count: lm.count || 1 } : null
  const ghost = (moveAnim || unplayedMove) && lm?.caught ? { team: lm.caught.team, node: lm.caught.node, count: lm.caught.count } : null

  // 내 차례가 되면 진동 + 알림
  const prevTurnRef = useRef(null)
  useEffect(() => {
    if (!room || room.status !== 'playing') return
    const key = `${room.turnNo || 0}-${curId}`
    if (prevTurnRef.current === key) return
    const wasSet = prevTurnRef.current !== null
    prevTurnRef.current = key
    if (wasSet && curId === me && !DEMO) {
      try {
        navigator.vibrate?.([120, 60, 120])
      } catch {}
      flash('내 차례! 윷을 던지세요 🥢', 2000)
    }
  }, [room?.turnNo, room?.status, curId])

  // 흔들어서 던지기
  useEffect(() => {
    if (!shake || !canThrow) return
    let last = 0
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration
      if (!a) return
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2)
      if (mag > 22 && Date.now() - last > 1500) {
        last = Date.now()
        throwYut(code, room)
      }
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [shake, canThrow, room, code])
  const toggleShake = async () => {
    if (shake) {
      setShake(false)
      try {
        localStorage.setItem('shake', '0')
      } catch {}
      flash('📳 흔들어서 던지기를 껐어요')
      return
    }
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission()
        if (r !== 'granted') return flash('동작(흔들기) 권한을 허용해야 쓸 수 있어요')
      }
    } catch {
      return flash('이 기기에서는 흔들기를 쓸 수 없어요')
    }
    setShake(true)
    try {
      localStorage.setItem('shake', '1')
    } catch {}
    flash('📳 이제 내 차례에 폰을 흔들면 윷을 던져요')
  }

  // 돌발 미션: 새 미션이 오면 진동 / 방장은 시간 종료 감시
  useEffect(() => {
    const m = room?.mission
    if (!m || m.stage !== 'active' || missionRef.current === m.id) return
    missionRef.current = m.id
    try {
      navigator.vibrate?.(m.playerId === me ? [60, 40, 60, 40, 60] : [80, 60, 80])
    } catch {}
  }, [room?.mission?.id, room?.mission?.stage])
  useEffect(() => {
    if (!room || room.hostId !== me || room.mission?.stage !== 'active') return
    const t = setInterval(() => missionTick(code, room), 1000)
    return () => clearInterval(t)
  }, [room, me, code])

  // 대기실에서 1시간 넘게 시작하지 않은 내 방은 방장 기기가 스스로 닫음
  useEffect(() => {
    if (!room || room.hostId !== me || room.status !== 'lobby' || typeof room.createdAt !== 'number') return
    const check = () => {
      if (Date.now() - room.createdAt >= LOBBY_TTL_MS) removeRoom(code)
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [room, me, code])

  // 방장 기기: 로그가 길어지면 오래된 항목 정리
  useEffect(() => {
    if (room && room.hostId === me) trimLog(code, room)
  }, [Object.keys(room?.log || {}).length])

  // 방장 기기가 끝난 옵션 타이머를 정리 (1초마다 확인)
  useEffect(() => {
    if (!room || room.hostId !== me || !room.options) return
    const t = setInterval(() => clearExpiredOptions(code, room), 1000)
    return () => clearInterval(t)
  }, [room, me, code])

  // 판 크게 보기: 켤 때·고를 칸이 생길 때 그 칸이 보이게 좌우로 이동
  const destKey = [...dests].join(',')
  useEffect(() => {
    const box = boardRef.current
    if (!zoom || !box) return
    const el = box.querySelector('.ycell.dest, .ytoken.can') || box.querySelector('.ycell.home')
    if (!el) return
    const b = box.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    box.scrollTo({ left: box.scrollLeft + (r.left + r.width / 2) - (b.left + b.width / 2), behavior: 'smooth' })
  }, [zoom, destKey, room?.status])

  // 대기실 ↔ 게임 화면이 바뀌면 맨 위(점수판·윷판)부터 보이게
  useEffect(() => {
    if (room?.status) window.scrollTo(0, 0)
  }, [room?.status])

  // 아래 고정 조작 바 높이 → 화면 아래 여백 (판·팀 정보가 바에 가려지지 않게)
  const dockRef = useRef(null)
  const [dockH, setDockH] = useState(0)
  useEffect(() => {
    const el = dockRef.current
    if (!el) return
    const measure = () => setDockH(Math.ceil(el.getBoundingClientRect().height))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [playing])

  // ---- 홈 동작 ----
  const saveName = (n) => {
    setName(n)
    try {
      localStorage.setItem('name', n)
    } catch {}
  }
  const onCreate = async () => {
    if (!name.trim()) return setError('이름을 먼저 입력해주세요.')
    setBusyBtn(true)
    setError('')
    try {
      const c = await createRoom(name.trim(), pwInput)
      setPwInput('')
      setCode(c)
    } catch (e) {
      setError(e.message || '실패했어요. 다시 시도해주세요.')
    }
    setBusyBtn(false)
  }
  const tryJoin = async (c, pw) => {
    if (!name.trim()) return setError('이름을 먼저 입력해주세요.')
    setBusyBtn(true)
    setError('')
    try {
      const got = await joinRoom(c, name.trim(), pw)
      setJoinTarget(null)
      setPwJoin('')
      setCode(got)
    } catch (e) {
      if (e.needPassword) {
        setJoinTarget({ code: c.trim().toUpperCase(), error: pw ? e.message : '' })
      } else {
        setJoinTarget(null)
        setError(e.message || '실패했어요. 다시 시도해주세요.')
      }
    }
    setBusyBtn(false)
  }
  const onPickRoom = (r) => {
    if (r.locked && !r.members.includes(me)) {
      setPwJoin('')
      setJoinTarget({ code: r.code })
      return
    }
    return tryJoin(r.code, '')
  }
  const onLeave = async () => {
    if (room?.status === 'playing' && !confirm('게임이 진행 중이에요. 정말 나갈까요? (같은 팀 다른 사람이 이어서 던져요)')) return
    leavingRef.current = true
    if (room) await leaveRoom(code)
    setCode('')
    setRoom(null)
    setTimeout(() => (leavingRef.current = false), 1500)
    try {
      sessionStorage.removeItem('room')
    } catch {}
  }
  const shareLink = async () => {
    const url = `${location.origin}${location.pathname}?room=${code}`
    try {
      if (navigator.share) await navigator.share({ title: '주루윷놀이', text: '윷놀이 하러 와!', url })
      else {
        await navigator.clipboard.writeText(url)
        flash('초대 링크를 복사했어요')
      }
    } catch {}
  }

  // ---- 판 탭 ----
  const onCellTap = (node) => {
    if (!room) return
    const cell = cells[node] || {}
    if (canMove && dests.has(node)) {
      const o = options.find((x) => !x.finished && x.dest === node)
      if (o) return moveYut(code, room, selIdx, o.from, o.route)
    }
    if (isHost && !cell.locked && room.status === 'lobby') {
      setEditing({ node, cell, text: cell.text })
      return
    }
    setPeek({ node, cell })
  }
  const onStackTap = (node) => {
    if (!canMove || !movable.has(node)) return
    const mine = options.filter((o) => o.from === node)
    if (mine.length === 1) return moveYut(code, room, selIdx, node, mine[0].route)
    if (mine.length > 1) flash('대각선으로 갈지 직진할지 아래에서 골라 주세요 (빛나는 칸을 눌러도 돼요)')
  }

  // 도착 칸에 다른 팀/우리 팀 말이 있는지 (선택지 설명용)
  const occupant = (node) => {
    for (let t = 0; t < tc; t++) if ((pieces[t] || []).some((pc) => pc.n === node)) return t
    return null
  }

  const pendingCell = showPending ? cells[pending.pos] || {} : null
  const statusText = !playing
    ? ''
    : room.winner != null
      ? `${TEAM_INFO[room.winner]?.name} 승리!`
      : throwAnim || unplayedThrow
        ? '윷 던지는 중…'
        : animating || unplayedMove
          ? '말이 움직이는 중…'
          : pending
            ? iAct
              ? '도착! 칸의 내용을 진행하세요'
              : `${room.players[pending.playerId]?.name || ''}이(가) 진행 중…`
            : stage === 'throw'
              ? myTurn
                ? extra > 0 && !results.length
                  ? '보너스! 한 번 더 던지세요 🎯'
                  : results.length
                    ? '윷·모! 한 번 더 던지세요'
                    : shake
                      ? '버튼을 누르거나 폰을 흔들어 던지세요'
                      : '윷을 던지세요'
                : `${cur?.name || ''}이(가) 던질 차례`
              : myTurn
                ? '쓸 윷을 고르고, 움직일 말을 고르세요'
                : `${cur?.name || ''}이(가) 말을 고르는 중…`

  // ---------- 렌더 ----------
  return (
    <div className={`app ${playing ? 'with-dock' : ''}`} style={dockH ? { '--dock-h': `${dockH}px` } : undefined}>
      <header className="topbar">
        <div className="brand">
          <span className={`brand-dot ${connected ? '' : 'off'}`} title={connected ? '연결됨' : '연결 중…'} /> 주루윷놀이
        </div>
        <div className="row">
          {room && (
            <button className="icon-btn" onClick={() => setShowDrinks(true)} aria-label="오늘의 술고래" title="오늘의 술고래">
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>🍺</span>
            </button>
          )}
          {room && (
            <button className="icon-btn" onClick={() => setShowLog(true)} aria-label="게임 로그" title="게임 로그">
              <Icon name="log" />
            </button>
          )}
          {room && (
            <button className="icon-btn" onClick={onLeave} aria-label="나가기" title="나가기">
              <Icon name="exit" />
            </button>
          )}
          <button className="icon-btn" onClick={toggleTheme} aria-label="테마 전환">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      {/* ---------- 홈 ---------- */}
      {!room && (
        <>
          <div className="hero">
            <div className="sign">
              <span className="sign-kicker">팀 대항 · 술자리 윷놀이</span>
              <h1 className="neon">주루윷놀이</h1>
              <Sticks sticks={[true, false, true, true]} small />
            </div>
            <p>폰으로 윷을 던지고, 말이 멈춘 칸의 벌칙을 수행해요. 이름을 정하고 방을 만들거나, 아래 목록에서 친구 방에 들어가세요.</p>
          </div>

          <div className="card card-pad stack">
            <div>
              <div className="label">내 이름</div>
              <input className="field" placeholder="예) 상혁" value={name} maxLength={10} onChange={(e) => saveName(e.target.value)} />
            </div>
            <div>
              <div className="label">방 비밀번호 (선택)</div>
              <input className="field" placeholder="비워두면 누구나 입장" value={pwInput} maxLength={12} onChange={(e) => setPwInput(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" onClick={onCreate} disabled={busyBtn || !name.trim()}>
              {pwInput.trim() ? '🔒 비밀번호 방 만들기' : '새 방 만들기'}
            </button>
            {error && <div className="error">{error}</div>}
            {!connected && <div className="muted">서버에 연결 중이에요… 계속 이 상태면 Firebase 규칙(yutRooms)을 확인해주세요.</div>}
          </div>

          <div className="card card-pad stack">
            <div className="row">
              <div className="label" style={{ marginBottom: 0 }}>
                열린 방 {roomList.length}개
              </div>
              <div className="spacer" />
              <span className="muted">탭해서 입장</span>
            </div>
            {roomList.length === 0 ? (
              <div className="muted">아직 열린 방이 없어요. 위에서 새 방을 만들어보세요.</div>
            ) : (
              <div className="room-list">
                {roomList.map((r) => (
                  <button key={r.code} className={`room-row ${r.status === 'playing' ? 'playing' : ''}`} onClick={() => onPickRoom(r)} disabled={busyBtn || !name.trim()}>
                    <span className="room-lock">{r.locked ? '🔒' : '🔓'}</span>
                    <span className="room-main">
                      <b>{r.hostName ? `${r.hostName}의 방` : '방'}</b>
                      <span className="muted">
                        {r.count}명{r.online < r.count ? ` (접속 ${r.online})` : ''} · {new Date(r.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 생성
                      </span>
                    </span>
                    <span className={`tag ${r.status === 'playing' ? 'tag-live' : 'tag-open'}`}>{r.status === 'playing' ? '게임 중 · 합류 가능' : '대기 중'}</span>
                  </button>
                ))}
              </div>
            )}
            {!name.trim() && roomList.length > 0 && <div className="muted">입장하려면 먼저 이름을 입력하세요.</div>}
          </div>
        </>
      )}

      {/* ---------- 비밀번호 입력 ---------- */}
      {joinTarget && !room && (
        <div className="modal-backdrop" onClick={() => setJoinTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">🔒 비밀번호 방</div>
            <h2>{roomList.find((r) => r.code === joinTarget.code)?.hostName ? `${roomList.find((r) => r.code === joinTarget.code).hostName}의 방` : '비밀번호 방'}</h2>
            <div className="muted">이 방은 비밀번호가 있어요. 방장에게 물어보세요.</div>
            {!name.trim() && <input className="field" style={{ marginTop: 12 }} placeholder="내 이름" value={name} maxLength={10} onChange={(e) => saveName(e.target.value)} />}
            <input
              className="field"
              style={{ marginTop: 12 }}
              type="password"
              placeholder="비밀번호"
              value={pwJoin}
              maxLength={12}
              autoFocus
              onChange={(e) => setPwJoin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tryJoin(joinTarget.code, pwJoin)}
            />
            {joinTarget.error && (
              <div className="error" style={{ marginTop: 8 }}>
                {joinTarget.error}
              </div>
            )}
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setJoinTarget(null)}>
                취소
              </button>
              <button className="btn btn-primary" onClick={() => tryJoin(joinTarget.code, pwJoin)} disabled={busyBtn || !pwJoin || !name.trim()}>
                입장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 대기실 ---------- */}
      {room && room.status === 'lobby' && (
        <>
          {room.summary && room.summary.id !== summaryHidden && room.summary.rows?.length > 0 && (
            <SummaryCard summary={room.summary} me={me} onClose={() => setSummaryHidden(room.summary.id)} />
          )}
          <div className="card card-pad stack">
            <div className="row">
              <div>
                <div className="label">대기실</div>
                <div className="big-code" style={{ letterSpacing: '-0.02em', fontSize: 24 }}>
                  {room.pw ? '🔒 ' : ''}
                  {room.hostName || room.players?.[room.hostId]?.name}의 방
                </div>
              </div>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={shareLink}>
                초대 링크
              </button>
            </div>
            <div className="muted">
              팀마다 말 {pieceCountOf(room)}개. 오른쪽 아래 출발 칸에서 위로 돌아 말을 옮기고, {pieceCountOf(room)}개가 먼저 다 들어오는 팀이 이겨요. 모서리·가운데에 멈춘 말은 다음에 대각선(지름길)과 직진 중에서 골라요. 상대 말을 잡으면 그 팀이 마시고 한 번 더 던져요.
            </div>
          </div>

          <div className="card card-pad stack">
            <div className="row">
              <div className="label" style={{ marginBottom: 0 }}>
                팀 {tc}개 · 참가자 {playerCount}명
              </div>
              <div className="spacer" />
              {isHost && (
                <div className="seg" role="group" aria-label="팀 수">
                  {[2, 3, 4].map((n) => (
                    <button key={n} className={tc === n ? 'on' : ''} onClick={() => setTeamCount(code, room, n)}>
                      {n}팀
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="row">
              <div className="label" style={{ marginBottom: 0 }}>
                팀당 말 {pieceCountOf(room)}개
              </div>
              <div className="spacer" />
              {isHost && (
                <div className="seg" role="group" aria-label="팀당 말 개수">
                  {[2, 3, 4].map((n) => (
                    <button key={n} className={pieceCountOf(room) === n ? 'on' : ''} onClick={() => setPieceCount(code, room, n)}>
                      {n}개
                    </button>
                  ))}
                </div>
              )}
            </div>
            {Array.from({ length: tc }, (_, t) => {
              const info = TEAM_INFO[t]
              const mem = teamMembers(room, t)
              return (
                <div className="team-block" key={t} style={{ '--tc': info.color }}>
                  <div className="team-head">
                    <span className="team-dot" />
                    <b>{info.name}</b>
                    <span className="muted">{mem.length}명</span>
                  </div>
                  {mem.length === 0 && <div className="muted team-empty">아직 아무도 없어요</div>}
                  <div className="player-list">
                    {mem.map((pid, i) => {
                      const p = room.players[pid]
                      return (
                        <div className="player-row" key={pid}>
                          <span className="order">{i + 1}</span>
                          <span className="avatar" style={{ background: p.color }}>
                            {p.name.slice(0, 1)}
                          </span>
                          <span className="player-name">{p.name}</span>
                          {pid === me && <span className="me-tag">나</span>}
                          {pid === room.hostId && <span className="tag">방장</span>}
                          {isHost && (
                            <span className="order-btns">
                              <button className="swap" aria-label="팀 바꾸기" title="다음 팀으로" onClick={() => setPlayerTeam(code, room, pid, t + 1)}>
                                ⇄
                              </button>
                              <button aria-label="위로" disabled={i === 0} onClick={() => moveInTeam(code, room, pid, -1)}>
                                ▲
                              </button>
                              <button aria-label="아래로" disabled={i === mem.length - 1} onClick={() => moveInTeam(code, room, pid, 1)}>
                                ▼
                              </button>
                              {pid !== me && (
                                <button className="crown" aria-label="방장 위임" title="방장 위임" onClick={() => confirm(`${p.name} 님에게 방장을 넘길까요?`) && transferHost(code, room, pid)}>
                                  👑
                                </button>
                              )}
                              {pid !== me && (
                                <button className="kick" aria-label="강퇴" title="강퇴" onClick={() => confirm(`${p.name} 님을 방에서 내보낼까요? (다시 들어올 수 없어요)`) && kickPlayer(code, room, pid)}>
                                  ✕
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {isHost ? (
              <div className="row">
                <div className="muted" style={{ flex: 1 }}>
                  ⇄ 팀 바꾸기 · ▲▼ 팀 안 던지는 순서 · 👑 방장 위임 · ✕ 내보내기
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => shuffleTeams(code, room)} disabled={playerCount < 2}>
                  🔀 팀 섞기
                </button>
              </div>
            ) : (
              <div className="muted">같은 팀 안에서는 위에서부터 돌아가며 던져요. 팀은 방장이 정해요.</div>
            )}
          </div>

          {isHost ? (
            <div className="card card-pad stack">
              <div className="muted">아래 윷판에서 칸을 탭하면 내용을 고칠 수 있어요. 게임이 시작되면 고칠 수 없어요. (출발·골인 칸은 고정)</div>
              {(() => {
                const empty = Array.from({ length: tc }, (_, t) => teamMembers(room, t).length).some((n) => n === 0)
                return (
                  <button className="btn btn-primary btn-block" onClick={() => startGame(code, room)} disabled={playerCount < 2 || empty}>
                    {playerCount < 2 ? '2명 이상 모이면 시작할 수 있어요' : empty ? '모든 팀에 1명 이상 있어야 해요' : '게임 시작'}
                  </button>
                )
              })()}
            </div>
          ) : (
            <div className="card card-pad muted">방장이 시작하면 자동으로 게임 화면으로 넘어가요.</div>
          )}

          <div ref={boardRef} className={`board-scroll ${zoom ? 'zoom' : ''}`}>
            <YutBoard cells={cells} pieces={{}} teamCount={tc} onCellTap={onCellTap} zoom={zoom} />
          </div>
          <BoardTools zoom={zoom} onToggle={() => setZoom((z) => !z)} hint={isHost ? '칸을 누르면 내용을 고칠 수 있어요' : '칸을 누르면 벌칙이 크게 보여요'} />
        </>
      )}

      {/* ---------- 게임 ---------- */}
      {room && playing && (
        <>
          {/* 팀 점수판: 팀별 말 상태(○집 ●판 ◎골인)와 골인 수 */}
          <div className="scoreboard" style={{ '--n': tc }}>
            {Array.from({ length: tc }, (_, t) => {
              const info = TEAM_INFO[t]
              const pcs = pieces[t] || []
              const goal = pcs.filter((pc) => pc.n === 'goal').length
              return (
                <div className={`score ${t === curTeam ? 'turn' : ''}`} style={{ '--tc': info.color }} key={t}>
                  <div className="score-top">
                    <span className="team-dot" />
                    <b>{info.short}</b>
                    <span className="score-goal" title={`골인 ${goal}/${pcs.length}`}>
                      {goal}
                      <small>/{pcs.length}</small>
                    </span>
                  </div>
                  <span className="team-pcs">
                    {pcs.map((pc, i) => (
                      <i key={i} className={`pc ${pc.n === 'goal' ? 'goal' : pc.n === 'home' ? 'home' : 'board'}`} />
                    ))}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 아래 고정 조작 바: 지금 차례 · 윷 결과 · 말 고르기 · 던지기 */}
          <div ref={dockRef} className={`dock yut-turn ${myTurn ? 'mine' : ''}`} style={{ '--tc': curInfo.color }}>
            <div className="dock-head">
              <Sticks sticks={throwHidden ? null : room.lastThrow?.sticks} small spinning={throwHidden} />
              <div className="turn-info">
                <div className="who">
                  <span className="team-dot" />
                  {curInfo.name} · {cur ? (curId === me ? '내 차례!' : `${cur.name}`) : '—'}
                </div>
                <div className="sub">{statusText}</div>
              </div>
              <button className={`icon-btn shake-btn ${shake ? 'on' : ''}`} onClick={toggleShake} aria-label={`흔들어서 던지기 ${shake ? '켜짐' : '꺼짐'}`} title={`흔들어서 던지기 ${shake ? '켜짐' : '꺼짐'}`}>
                📳
              </button>
            </div>

            {(results.length > 0 || extra > 0) && room.winner == null && !throwHidden && (
              <div className="yut-chips">
                {results.map((v, i) => (
                  <button
                    key={i}
                    className={`ychip ${i === selIdx && canMove ? 'on' : ''} ${usable[i] ? '' : 'off'}`}
                    disabled={!canMove || !usable[i]}
                    onClick={() => setSel(i)}
                  >
                    <b>{yutName(v)}</b>
                    <span>{v === -1 ? '뒤로 1' : `${v}칸`}</span>
                  </button>
                ))}
                {extra > 0 && <span className="ychip bonus">🎯 보너스 +{extra}</span>}
              </div>
            )}

            {canMove && options.length > 0 && (
              <>
                <div className="move-opts">
                  {options.map((o) => {
                    const occ = o.finished ? null : occupant(o.dest)
                    const hint = occ == null ? '' : occ === curTeam ? ' · 🤝 업기' : ` · 🎯 ${TEAM_INFO[occ].short} 잡기!`
                    return (
                      <button key={moveKey(o)} className={`move-opt ${o.route ? `route-${o.route}` : ''}`} onClick={() => moveYut(code, room, selIdx, o.from, o.route)}>
                        <span className="mo-from">{o.from === 'home' ? `🆕 새 말 (${o.homeLeft}개 대기)` : `${o.count > 1 ? `말 ${o.count}개` : '말'} · ${nodeName(o.from)}`}</span>
                        <span className="mo-arrow">→</span>
                        <span className="mo-dest">
                          {o.route && (
                            <b className="mo-route">
                              {routeArrow(o)} {routeLabel(o)}
                            </b>
                          )}
                          {o.finished ? '🏁 골인!' : `${nodeName(o.dest)} ${cells[o.dest]?.emoji || ''} ${oneLine(cells[o.dest]?.text)}`}
                          {hint && <em>{hint}</em>}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="dock-hint">판에서 통통 튀는 말이나 빛나는 칸을 눌러도 옮겨져요</div>
              </>
            )}

            {stage !== 'move' && room.winner == null && (
              <button className="btn btn-primary btn-throw" onClick={() => throwYut(code, room)} disabled={!canThrow}>
                🥢 던지기
              </button>
            )}
          </div>

          <OptionTimers options={room.options} />
          <MissionBanner room={room} me={me} />

          <div ref={boardRef} className={`board-scroll ${zoom ? 'zoom' : ''}`}>
            <YutBoard
              cells={cells}
              pieces={pieces}
              teamCount={tc}
              onCellTap={onCellTap}
              onStackTap={onStackTap}
              movable={canMove ? movable : null}
              dests={canMove ? dests : null}
              activeNode={moveAnim?.node || null}
              mover={mover}
              hide={hide}
              ghost={ghost}
              zoom={zoom}
            />
          </div>
          <BoardTools zoom={zoom} onToggle={() => setZoom((z) => !z)} hint="칸을 누르면 벌칙이 크게 보여요" />
          <ThrowOverlay anim={throwAnim} who={room.players[throwAnim?.playerId]?.name || ''} teamColor={TEAM_INFO[teamOf(room, throwAnim?.playerId)]?.color} />

          {/* 팀원 · 놉카드 (내 배지를 눌러 사용/양도) */}
          <div className="card card-pad teams">
            <div className="teams-title">
              팀원 · 놉카드
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0 }}>
                내 🎫 배지를 누르면 사용·양도
              </span>
            </div>
            {Array.from({ length: tc }, (_, t) => {
              const info = TEAM_INFO[t]
              const mem = teamMembers(room, t)
              return (
                <div className={`team-card ${t === curTeam ? 'turn' : ''}`} style={{ '--tc': info.color }} key={t}>
                  <div className="team-head">
                    <b>{info.name}</b>
                    <span className="muted">{mem.length}명</span>
                  </div>
                  <div className="team-members">
                    {mem.map((pid) => {
                      const p = room.players[pid]
                      const mine = pid === me
                      return (
                        <div className={`mchip ${pid === curId ? 'turn' : ''} ${mine ? 'me' : ''} ${p.online === false ? 'offline' : ''}`} key={pid} title={p.online === false ? '연결 끊김' : ''}>
                          <span className="avatar xs" style={{ background: p.color }}>
                            {p.name.slice(0, 1)}
                          </span>
                          <span className="pname">{p.name}</span>
                          <button
                            className={`nop-badge ${(p.nop || 0) === 0 ? 'empty' : ''}`}
                            onClick={() => {
                              if ((mine || DEMO) && (p.nop || 0) > 0) {
                                setNopGive(false)
                                setNopConfirm(pid)
                              }
                            }}
                            disabled={(!mine && !DEMO) || (p.nop || 0) === 0}
                            title={mine ? '내 놉카드 사용' : '놉카드 보유 수'}
                          >
                            <NopIcon /> {p.nop || 0}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {isHost && (
            <div className="row host-row">
              <button className="btn btn-ghost btn-sm" onClick={() => confirm(`${curInfo.name} ${cur?.name || ''} 차례를 넘길까요? (남은 윷과 진행 중인 칸도 정리됩니다)`) && hostSkipTurn(code, room)}>
                ⏭ 차례 넘기기
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => confirm('게임을 끝내고 대기실로 돌아갈까요?') && restartGame(code, room)}>
                대기실로
              </button>
            </div>
          )}
        </>
      )}

      {/* ---------- 잡기 ---------- */}
      {room && showPending && pending.kind === 'caught' && (
        <CongratsOverlay
          room={room}
          targets={teamMembers(room, pending.victim)}
          actorId={pending.playerId}
          iAct={iAct}
          canNop={false}
          title="🎯 잡았다!"
          note={`${TEAM_INFO[pending.victim]?.name} 말 ${pending.count}개가 집으로!${pending.count > 1 ? ` · ${pending.count}잔씩` : ''} · ${room.players[pending.playerId]?.name} 한 번 더 던져요`}
          onDone={() => resolvePending(code, room, 'done')}
        />
      )}

      {/* ---------- 승리 ---------- */}
      {room && showPending && pending.kind === 'win' && <WinOverlay room={room} pending={pending} isHost={isHost || DEMO} onDone={() => resolvePending(code, room, 'done')} />}

      {/* ---------- AI 지목 ---------- */}
      {room && showPending && pending.kind === 'aiPick' && (
        <AiPickOverlay room={room} pending={pending} me={me} iAct={iAct} onDone={() => resolvePending(code, room, 'done')} onTargetNop={() => resolvePending(code, room, 'target-nop')} />
      )}

      {/* ---------- 너! 마셔! (지목) ---------- */}
      {room && showPending && pending.kind === 'pick' && pending.stage === 'result' && (
        <PickOverlay room={room} pending={pending} me={me} iAct={iAct} onDone={() => resolvePending(code, room, 'done')} onTargetNop={() => resolvePending(code, room, 'target-nop')} />
      )}

      {/* ---------- 라이어 게임 ---------- */}
      {room && showPending && pending.kind === 'liar' && pending.stage !== 'category' && <LiarPanel room={room} pending={pending} me={me} iAct={iAct} code={code} />}

      {/* ---------- 다수결 지목 ---------- */}
      {room && showPending && pending.kind === 'vote' && <VotePanel room={room} pending={pending} me={me} iAct={iAct} code={code} />}

      {/* ---------- 돌발 미션 ---------- */}
      {room && playing && room.mission?.stage === 'active' && missionSeen !== room.mission.id && !showPending && !busy && (
        <MissionCard room={room} me={me} code={code} onClose={() => setMissionSeen(room.mission.id)} />
      )}
      {room && playing && !showPending && !busy && <MissionQuiz room={room} me={me} code={code} />}

      {/* ---------- 폭탄 / 반응속도 / 놉카드 도박 ---------- */}
      {room && showPending && pending.kind === 'bomb' && <BombPanel room={room} pending={pending} iAct={iAct} code={code} />}
      {room && showPending && pending.kind === 'reaction' && <ReactionPanel room={room} pending={pending} me={me} iAct={iAct} code={code} />}
      {room && showPending && pending.kind === 'gamble' && <GamblePanel room={room} pending={pending} iAct={iAct} code={code} />}

      {/* ---------- 밸런스 게임 ---------- */}
      {room && showPending && pending.kind === 'balance' && <BalancePanel room={room} pending={pending} me={me} iAct={iAct} code={code} />}

      {/* ---------- 의리주 순서 ---------- */}
      {room && showPending && pending.kind === 'shuffle' && <ShufflePanel room={room} pending={pending} iAct={iAct} code={code} />}

      {/* ---------- 훈민정음 ---------- */}
      {room && showPending && pending.kind === 'hunmin' && (
        <HunminPanel room={room} pending={pending} iAct={iAct} code={code} keyId={`${room.lastMove?.id}-${pending.pos}-${pending.title || ''}`} />
      )}

      {/* ---------- 도착 칸 모달 ---------- */}
      {room &&
        showPending &&
        !['aiPick', 'vote', 'hunmin', 'shuffle', 'balance', 'bomb', 'reaction', 'gamble', 'caught', 'win'].includes(pending.kind) &&
        !(pending.kind === 'liar' && pending.stage !== 'category') &&
        !(pending.kind === 'pick' && pending.stage === 'result') &&
        pendingCell && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="kicker">
                {nodeName(pending.pos)} · {KIND_LABEL[pending.kind] || '미션'}
              </div>
              <h2>{pending.title || oneLine(pendingCell.text)}</h2>
              {pending.kind === 'option' && pendingCell.pair && pending.partner && (
                <div className="pair-card">
                  <span className="avatar" style={{ background: room.players[pending.playerId]?.color }}>
                    {room.players[pending.playerId]?.name?.slice(0, 1)}
                  </span>
                  <b>{room.players[pending.playerId]?.name}</b>
                  <span className="heart">❤️</span>
                  <b>{room.players[pending.partner]?.name}</b>
                  <span className="avatar" style={{ background: room.players[pending.partner]?.color }}>
                    {room.players[pending.partner]?.name?.slice(0, 1)}
                  </span>
                </div>
              )}
              {pending.kind === 'choose' && (
                <div className="cat-grid">
                  {[
                    ['balance', '⚖️', '밸런스 게임'],
                    ['liar', '🤥', '라이어 게임'],
                    ['hunmin', '📝', '훈민정음 게임'],
                    ['bomb', '💣', '폭탄 돌리기'],
                    ['reaction', '⚡', '반응속도 게임'],
                  ].map(([k, e, n]) => (
                    <button key={k} className="cat-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'choose', k)}>
                      <span className="cat-emo">{e}</span>
                      <span>{n}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="muted">
                <b style={{ color: room.players[pending.playerId]?.color }}>{room.players[pending.playerId]?.name}</b>
                {pending.kind === 'nop' && ' — 놉카드 1장이 지급되었어요.'}
                {pending.kind === 'normal' && (iAct ? ' — 수행하고 완료를 눌러주세요.' : ' — 수행 중이에요.')}
                {pending.kind === 'normal' && pendingCell.drink && (pendingCell.drink === 'all' ? ' (전원 잔 수 +1)' : pendingCell.drink === 'team' ? ' (우리 팀 잔 수 +1)' : ' (잔 수 +1)')}
                {pending.kind === 'again' && ' — 보너스! 이번 차례에 윷을 한 번 더 던져요 🎲'}
                {pending.kind === 'home' && ' — 빽도로 출발 칸에 들어왔어요. 다음에 이 말을 움직이면 바로 골인!'}
                {pending.kind === 'option' &&
                  !pendingCell.pair &&
                  (room.options?.[optionKey(pending.pos)]?.endsAt > Date.now()
                    ? ` — 이미 진행 중인 옵션이에요. 모두에게 ${pendingCell.minutes || 5}분이 추가됩니다. `
                    : ` — 모두에게 적용되는 옵션이에요. ${pendingCell.minutes || 5}분 타이머가 전원 화면에 표시됩니다. `)}
                {pending.kind === 'option' && pendingCell.pair && ` — 무작위로 정해진 짝과 ${pendingCell.minutes || 5}분 동안 벌칙을 함께 받아요. `}
                {pending.kind === 'release' && ' — 진행 중이던 옵션 타이머가 모두 종료됐어요.'}
                {pending.kind === 'steal' &&
                  (Object.entries(room.players).some(([pid, pl]) => pid !== pending.playerId && (pl.nop || 0) > 0)
                    ? iAct
                      ? ' — 놉카드를 가진 사람을 골라 1장 가져오세요.'
                      : ' — 누구의 놉카드를 가져갈지 고르고 있어요.'
                    : ' — 놉카드를 가진 사람이 없어요.')}
                {pending.kind === 'choose' && (iAct ? ' — 진행할 게임을 하나 고르세요.' : ' — 게임을 고르고 있어요.')}
                {pending.kind === 'liar' && (iAct ? ' — 키워드 카테고리를 고르면 모두에게 키워드가 배정돼요. 한 명만 비슷하지만 다른 키워드를 받아요.' : ' — 카테고리를 고르고 있어요.')}
                {pending.kind === 'pick' && (iAct ? ' — 마실 사람 한 명을 고르세요.' : ` — ${room.players[pending.playerId]?.name}이(가) 마실 사람을 고르고 있어요.`)}
              </div>
              {pending.kind === 'pick' && (
                <div className="steal-list">
                  {Object.entries(room.players)
                    .filter(([pid, pl]) => pid !== pending.playerId && pl.name)
                    .map(([pid, pl]) => (
                      <button key={pid} className="steal-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'choose', pid)}>
                        <span className="avatar sm" style={{ background: pl.color }}>
                          {pl.name.slice(0, 1)}
                        </span>
                        <span className="pname">{pl.name}</span>
                        <span className="team-chip" style={{ '--tc': TEAM_INFO[teamOf(room, pid)]?.color }}>
                          {TEAM_INFO[teamOf(room, pid)]?.short}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {pending.kind === 'liar' && (
                <div className="cat-grid">
                  {LIAR_CATEGORIES.map((c) => (
                    <button key={c.key} className="cat-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'category', c.key)}>
                      <span className="cat-emo">{c.emoji}</span>
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {pending.kind === 'steal' && (
                <div className="steal-list">
                  {Object.entries(room.players)
                    .filter(([pid, pl]) => pid !== pending.playerId && pl.name)
                    .map(([pid, pl]) => (
                      <button key={pid} className={`steal-btn ${(pl.nop || 0) > 0 ? '' : 'none'}`} disabled={!iAct || (pl.nop || 0) === 0} onClick={() => resolvePending(code, room, 'steal', pid)}>
                        <span className="avatar sm" style={{ background: pl.color }}>
                          {pl.name.slice(0, 1)}
                        </span>
                        <span className="pname">{pl.name}</span>
                        <span className={`nop-badge ${(pl.nop || 0) === 0 ? 'empty' : ''}`}>
                          <NopIcon /> {pl.nop || 0}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {iAct ? (
                <div className="actions">
                  {!['liar', 'choose', 'pick'].includes(pending.kind) && !(pending.kind === 'steal' && Object.entries(room.players).some(([pid, pl]) => pid !== pending.playerId && (pl.nop || 0) > 0)) && (
                    <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
                      {pending.kind === 'normal'
                        ? '수행 완료'
                        : pending.kind === 'option'
                          ? room.options?.[optionKey(pending.pos)]?.endsAt > Date.now()
                            ? `⏱ +${pendingCell.minutes || 5}분 추가`
                            : `⏱ ${pendingCell.minutes || 5}분 시작`
                          : pending.kind === 'again'
                            ? '🎲 한 번 더!'
                            : '확인'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="actions">
                  <div className="waiting">{room.players[pending.playerId]?.name}의 선택을 기다리는 중…</div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* ---------- 🍺 오늘의 술고래 순위 ---------- */}
      {showDrinks && room && <DrinksModal room={room} me={me} onClose={() => setShowDrinks(false)} />}

      {/* ---------- 놉카드 사용 / 양도 ---------- */}
      {nopConfirm && room?.players?.[nopConfirm] && (DEMO || nopConfirm === me) && (
        <div className="modal-backdrop" onClick={() => setNopConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">🎫 놉카드</div>
            {nopGive ? (
              <>
                <h2>누구에게 양도할까요?</h2>
                <div className="muted">
                  <b style={{ color: room.players[nopConfirm].color }}>{room.players[nopConfirm].name}</b>의 놉카드 1장을 넘겨요. 넘기면 모두에게 알림이 떠요.
                </div>
                <div className="steal-list">
                  {Object.entries(room.players)
                    .filter(([pid, pl]) => pid !== nopConfirm && pl.name)
                    .map(([pid, pl]) => (
                      <button
                        key={pid}
                        className="steal-btn"
                        onClick={() => {
                          giveNop(code, room, pid, nopConfirm)
                          setNopConfirm(null)
                          setNopGive(false)
                        }}
                      >
                        <span className="avatar sm" style={{ background: pl.color }}>
                          {pl.name.slice(0, 1)}
                        </span>
                        <span className="pname">{pl.name}</span>
                        <span className={`nop-badge ${(pl.nop || 0) === 0 ? 'empty' : ''}`}>
                          <NopIcon /> {pl.nop || 0}
                        </span>
                      </button>
                    ))}
                </div>
                <div className="actions">
                  <button className="btn btn-ghost" onClick={() => setNopGive(false)}>
                    뒤로
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>내 놉카드, 어떻게 할까요?</h2>
                <div className="muted">
                  <b style={{ color: room.players[nopConfirm].color }}>{room.players[nopConfirm].name}</b> · 보유 {room.players[nopConfirm].nop || 0}장. 사용하면 벌칙을 거부하고, 양도하면 다른 사람에게 1장을 넘겨요. 둘 다 모두에게 알림이 떠요.
                </div>
                <div className="actions">
                  <button className="btn btn-ghost" onClick={() => setNopConfirm(null)}>
                    취소
                  </button>
                  <button className="btn btn-ghost" onClick={() => setNopGive(true)}>
                    🎁 양도
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      useNopAnytime(code, room, nopConfirm)
                      setNopConfirm(null)
                    }}
                  >
                    🙅 사용
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- 게임 로그 ---------- */}
      {showLog && room && (
        <div className="modal-backdrop" onClick={() => setShowLog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">게임 로그</div>
            <h2>지금까지 일어난 일</h2>
            <div className="log">
              {roomLog(room).length === 0 && <div className="muted">아직 기록이 없어요.</div>}
              {roomLog(room).map((e) => (
                <div className="line" key={e.id}>
                  <span className="log-time">{new Date(e.t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setShowLog(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 칸 보기 ---------- */}
      {peek && !showPending && (
        <div className="modal-backdrop" onClick={() => setPeek(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">{nodeName(peek.node)}</div>
            <h2>
              {peek.cell.emoji} {oneLine(peek.cell.text)}
            </h2>
            {peek.cell.locked && <div className="muted">고정 칸 (편집 불가) — 여기에 도착하거나 지나가면 골인!</div>}
            {CORNERS.has(peek.node) && peek.node !== CORNER_BL && <div className="muted">이 모서리에 멈춘 말은 다음 이동 때 대각선(지름길)과 직진 중에서 골라요.</div>}
            {peek.node === CORNER_BL && <div className="muted">대각선이 끝나는 모서리예요. 여기서는 아래 변을 따라 출발 칸(골인) 쪽으로 가요.</div>}
            {peek.node === 'C' && <div className="muted">가운데에 멈춘 말은 다음 이동 때 골인 쪽 대각선과 직진 중에서 골라요.</div>}
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setPeek(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 방장 칸 편집 ---------- */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">{nodeName(editing.node)} 편집</div>
            <div className="edit-preview">
              <span className="edit-emo">{autoEmoji(editing.text, editing.cell.emoji)}</span>
              <span className="muted">내용에 맞는 이모지가 자동으로 붙어요 (단어에 따라 바뀜)</span>
            </div>
            <textarea
              className="field field-area"
              value={editing.text}
              maxLength={30}
              rows={2}
              autoFocus
              placeholder="칸에 보일 글자 (줄바꿈은 Enter)"
              onChange={(e) => setEditing({ ...editing, text: e.target.value.replace(/\n{2,}/g, '\n') })}
            />
            <div className="muted" style={{ marginTop: 6 }}>
              Enter 로 줄을 나눌 수 있어요 (칸에서 그대로 두 줄로 보여요).
            </div>
            {editing.cell.type && editing.cell.type !== 'normal' && (
              <div className="muted" style={{ marginTop: 8 }}>
                ⚠️ 내용을 바꾸면 이 칸의 기능({KIND_LABEL[editing.cell.type] || editing.cell.type})은 사라지고, 도착하면 글자와 <b>수행 완료</b> 버튼만 나오는 일반 칸이 돼요.
              </div>
            )}
            {editing.cell.edited && (
              <div className="muted" style={{ marginTop: 8 }}>
                이 칸은 수정된 칸이에요. 원래 내용과 기능으로 되돌리려면 <b>원래대로</b>를 누르세요.
              </div>
            )}
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                취소
              </button>
              {editing.cell.edited && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    saveCellText(code, room, editing.node, DEFAULT_YUT_CELLS[editing.node].text)
                    setEditing(null)
                  }}
                >
                  원래대로
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  saveCellText(code, room, editing.node, editing.text)
                  setEditing(null)
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {DEBUG && <DebugPanel room={room} code={code} me={me} connected={connected} />}
    </div>
  )
}
