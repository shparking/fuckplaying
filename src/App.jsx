import { useEffect, useRef, useState } from 'react'
import YutBoard from './components/YutBoard'
import { ThrowOverlay, Sticks, preloadThrow3D } from './components/YutSticks'
import { SOLO, LOBBY_TTL_MS, PRACTICE, lobbySince } from './db'
import {
  myId,
  ini,
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
  setMissionOff,
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
  clearExpiredOptions,
  hostSkipTurn,
  purgeRooms,
  removeRoom,
  lobbyOrder,
  roomLog,
  trimLog,
  kickPlayer,
  transferHost,
  watchServerOffset,
  serverNow,
  missionTick,
  missionVote,
  missionReveal,
  missionResult,
  missionDone,
  missionAck,
  subscribeRoomList,
  teamNop,
  teamShield,
  shieldDecide,
  canShieldFor,
  teamAllOffline,
  FATE_CARDS,
  MAGNET_RANGE,
  teamsOf,
  teamLabel,
  teamName,
  loserTeamsText,
  loserLeft,
  nopKey,
  optionTargets,
  TEAM_GAMES,
  PRACTICE_GAMES,
  practiceStart,
  liveTeams,
} from './room'
import { SyncPanel, TapWarPanel, TeamReactPanel, TeamBombPanel, ColorTrapPanel, CirclePanel, PricePanel, TimeSumPanel, MapPinPanel, WorldPinPanel, MediaQuizPanel } from './components/TeamGames'
import { MQ_GAME } from './game/mediaquiz'
import { autoEmoji } from './game/emoji'
import { beep, ding, boom, tick as tickSound } from './sound'
import { subwayLine } from './game/subway'
import { DEFAULT_YUT_CELLS, TEAM_INFO, moveOptions, nodeName, yutName, isBonus, moveKey, routeLabel, pieceCountOf, CORNERS, CORNER_BL, NODE_BY_ID, START } from './game/yut'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 흔들어서 던지기 감도 (m/s², 횟수, ms): 세게 흔드는 동안 0.8초 안에 4번 이상 강한 움직임
const SHAKE_FORCE = 15
const SHAKE_HITS = 4
const SHAKE_WINDOW_MS = 800

const KIND_LABEL = {
  nop: '놉카드 획득',
  option: '옵션 타이머',
  release: '옵션 해제',
  steal: '놉카드 뺏기',
  aiPick: 'AI 지목',
  hunmin: '훈민정음 게임',
  subway: '지하철 게임',
  wordSong: '단어 노래',
  bunny: '바니바니 게임',
  magnet: '자석',
  fate: '운명의 카드',
  shield: '방패 +1',
  shieldAsk: '방패',
  choose: '게임 선택권',
  shuffle: '의리주 순서',
  gamble: '놉카드 도박',
  again: '한 번 더!',
  home: '출발·골인',
  caught: '잡기',
  win: '승리',
  teamSync: '팀 이구동성',
  tapWar: '연타 줄다리기',
  teamReact: '팀 반응속도',
  teamBomb: '폭탄 돌리기 팀전',
  colorTrap: '색깔 함정',
  circle: '완벽한 도형 그리기',
  priceGuess: '얼마게요',
  timeSum: '팀 시간 합치기',
  mapPin: '지도 찍기',
  worldPin: '세계 지도 찍기',
  mediaQuiz: MQ_GAME,
  allOptions: '모든 옵션 On',
  sojuAdd: '소주 +1 적립',
  sojuBank: '소주 보관소',
  pickTeam: '너희 팀 마셔 (지목)',
  toast: '같이 짠',
  nhaeng: '랜덤 n행시',
  back: '뒤로 가기',
}
const oneLine = (t) => String(t || '').replace(/\n/g, ' ')
// 칸 보기 팝업 설명 (새 칸들)
const KIND_DESC = {
  home: '골인은 이 칸을 지나가야 해요. 딱 멈춘 말은 여기 서 있다가 다음에 한 칸이라도 움직이면 골인 (빽도로 들어와도 같아요 — 도로 1번 갔다가 빽도면 대박!). 상대 말이 와서 멈추면 잡혀요.',
  pickTeam: '상대 팀 전원이 다 같이 마셔요. 2팀이면 바로 상대 팀, 3팀 이상이면 도착한 사람이 마실 팀을 골라요.',
  toast: '상대 팀에서 한 명을 골라 둘이 같이 짠! 둘만 마셔요.',
  nhaeng: '랜덤 키워드가 나오면 글자 수만큼 n행시를 짓고 다 같이 마셔요. 키워드는 바꿀 수 있어요.',
  back: '말이 4칸 뒤로 가요 (업힌 말도 같이). 도착한 칸 미션도 하고, 상대 말이 있으면 잡아요.',
  allOptions: '판에 있는 옵션(영어금지·투터치·아니·근데·진짜 금지)이 전부 상대 팀에 3분씩 걸려요.',
  shield: '도착한 팀 방패 +1. 우리 말이 잡힐 때 방패를 쓸지 골라요 (시간 제한 없음). 쓰면 안 잡히고(잡으려던 사람도 한 번 더 없음) 방패가 1개 줄어요.',
  subway: '3, 2, 1 → 서울 지하철 노선(1~9호선·수인분당선·경의중앙선·신분당선·공항철도 등) 중 하나가 나와요. 그 노선 역 이름을 돌아가며 말하고, 막히거나 틀리거나 나온 역을 또 말하면 마셔요.',
  circle: '게임마다 원·정삼각형·정사각형·정오각형·정육각형 중 하나가 나와요 (시작 화면에 보여요). 15초 안에 손가락으로 한 번에 그리면 0~100점, 팀 평균이 낮은 팀이 마셔요.',
  magnet: '앞뒤 2칸 안에 상대 말이 있으면 우리 말이 그쪽으로 끌려가서 잡아요 (여러 개면 고르기, 상대 팀 방패는 쓸 수 있어요). 2칸 안에 없으면 운명의 카드: 3칸 앞으로 · 2칸 뒤로 · 놉카드 +1 · 다 같이 마셔! 중 하나.',
  bunny: '오프라인 게임: 바니바니 게임을 하고, 걸린 사람이 마셔요. 끝나면 던진 사람이 수행 완료. 게임 선택권에서도 고를 수 있어요.',
  wordSong: '3, 2, 1 → 단어가 하나 나와요. 그 단어가 들어간 노래를 돌아가며 한 소절씩 부르고, 막히거나 이미 나온 노래를 부르면 마셔요.',
  worldPin: '팀 대결: 세계 지도에 도시·명소 핀 꽂기 (두 손가락으로 확대). 5문제, 가까울수록 점수, 팀 점수 낮은 팀이 마셔요.',
  mediaQuiz: '팀 대결: 노래는 걸린 사람 폰에서 1초 → 3초 → 5초씩 들려주고, 영화·드라마는 장면 사진이 흐릿했다가 선명해져요. 제목을 직접 써서 맞히기, 빨리 맞힐수록 점수. 5문제, 팀 점수 낮은 팀이 마셔요.',
}
// 받침이 있으면 a, 없으면 b (사랑이 / 비가)
const josa = (word, a, b) => {
  const c = String(word || '').charCodeAt(String(word || '').length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b
}
// 게임 선택권: 판에 있는 게임 전부 (팀 대결 + 다 같이 하는 오프라인 게임). 랜덤 n행시는 게임이 아니라 뺌
const CHOOSE_TEAM = [
  ['teamSync', '👯', '팀 이구동성'],
  ['tapWar', '🦦', '연타 줄다리기'],
  ['teamReact', '⚡', '팀 반응속도'],
  ['teamBomb', '💣', '폭탄 돌리기 팀전'],
  ['colorTrap', '🎨', '색깔 함정'],
  ['circle', '⭕', '완벽한 도형 그리기'],
  ['priceGuess', '💰', '얼마게요'],
  ['timeSum', '🕰️', '팀 시간 합치기'],
  ['mapPin', '🗺️', '지도 찍기'],
  ['worldPin', '🌍', '세계 지도 찍기'],
  ['mediaQuiz', '🎬', MQ_GAME],
]
const CHOOSE_OFFLINE = [
  ['hunmin', '📝', '훈민정음 게임'],
  ['subway', '🚇', '지하철 게임'],
  ['wordSong', '🎶', '단어 노래'],
  ['bunny', '🐰', '바니바니 게임'],
]
// 상대 팀 사람들 (같이 짠 칸)
const rivalsOf = (room, pid) => Object.keys(room.players || {}).filter((x) => room.players[x]?.name && teamOf(room, x) !== teamOf(room, pid))
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
function CongratsOverlay({ room, targets, actorId, iAct, onDone, title = '🎉 Congratulations! 🎉', note, refused = {}, teamWide = false }) {
  const pieces = Array.from({ length: 28 })
  const names = targets.map((t) => room.players[t]?.name).filter(Boolean)
  // 연대책임: 걸린 사람의 팀 전원이 같이 마심
  const drinkTeams = teamsOf(room, targets.filter((t) => !refused[t]))
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
              {ini(room.players[t]?.name)}
            </div>
          ))}
        </div>
        {note && <div className="ai-note">{note}</div>}
        <div className="ai-name">
          <b>{names.length ? nameEls : '—'}</b> {teamWide ? '' : '걸렸다!'}
        </div>
        {drinkTeams.length > 0 && (
          <div className="ai-team-drink">
            {drinkTeams.map((t, i) => (
              <span key={t} style={{ color: TEAM_INFO[t]?.color }}>
                {teamName(room, t)}
                {i < drinkTeams.length - 1 ? ', ' : ''}
              </span>
            ))}{' '}
            다 같이 마셔! 🍶
          </div>
        )}
        <div className="ai-actions">
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
function AiPickOverlay({ room, pending, me, iAct, onDone }) {
  const step = useCountdown(`${pending.target}-${pending.startedAt}`)
  if (step > 0) return <CountOverlay step={step} emoji="🤖" sub="AI가 한 명을 고르고 있어요…" />
  return <CongratsOverlay room={room} targets={[pending.target]} actorId={pending.playerId} iAct={iAct} onDone={onDone} />
}

// 놉카드 사용 알림: 누가 팀 놉카드를 쓰면 모든 폰에 뜨고, 각자 '확인했어요'를 눌러 닫음 (무엇을 거부하는지는 말로)
// 늦게 들어온 폰·새로고침에는 오래된 알림(2분 넘음)은 안 띄움
const NOP_NOTICE_MS = 2 * 60 * 1000
function NopNotice({ room, notice, me, onClose }) {
  const info = TEAM_INFO[notice.team]
  const mine = !SOLO && notice.by === me
  useEffect(() => {
    try {
      navigator.vibrate?.([120, 60, 120])
    } catch {}
  }, [notice.id])
  return (
    <div className="modal-backdrop nop-notice-bg">
      <div className="modal nop-notice" style={{ '--tc': info.color }}>
        <div className="nop-notice-emo">🎫</div>
        <div className="kicker">놉카드 사용</div>
        <h2>
          <span style={{ color: info.color }}>{teamName(room, notice.team)}</span>
          <br />
          놉카드 1장 사용! 🙅
        </h2>
        <div className="muted">
          {mine ? '내가 썼어요' : notice.who ? `${notice.who}이(가) 썼어요` : '팀 놉카드를 썼어요'} · 남은 놉카드 {notice.left}장
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onClose}>
            확인했어요
          </button>
        </div>
      </div>
    </div>
  )
}

// 같이 짠: 상대를 고르면 모든 폰에 3, 2, 1 → 두 사람 공개 "A ❤️ B 둘이 마셔! (잘됐으면 좋겠다.. ❤️)"
function ToastReveal({ room, pending: p, iAct, onDone }) {
  const step = useCountdown(`${p.target}-${p.startedAt}`)
  const a = room.players[p.playerId]
  const b = room.players[p.target]
  if (step > 0) return <CountOverlay step={step} emoji="🥂" sub={`${a?.name}이(가) 같이 짠 할 사람은…`} />
  return (
    <div className="ai-overlay toast-reveal">
      <div className="ai-reveal">
        <div className="toast-hearts" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <i key={i} style={{ '--i': i, left: `${(i * 41) % 100}%`, animationDelay: `${(i % 7) * 0.18}s` }}>
              {i % 3 ? '❤️' : '💕'}
            </i>
          ))}
        </div>
        <div className="ai-congrats">🥂 같이 짠!</div>
        <div className="toast-pair">
          <div className="ai-avatar" style={{ background: a?.color }}>
            {ini(a?.name)}
          </div>
          <span className="toast-heart">❤️</span>
          <div className="ai-avatar" style={{ background: b?.color }}>
            {ini(b?.name)}
          </div>
        </div>
        <div className="ai-name">
          <b>{a?.name}</b> ❤️ <b>{b?.name}</b>
        </div>
        <div className="ai-team-drink">둘이 마셔! 🥂</div>
        <div className="ai-note">(잘됐으면 좋겠다.. ❤️)</div>
        <div className="ai-actions">
          {iAct ? (
            <button className="btn btn-primary" onClick={onDone}>
              확인
            </button>
          ) : (
            <div className="waiting">{a?.name}이(가) 확인하면 다음 차례로 넘어가요</div>
          )}
        </div>
      </div>
    </div>
  )
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
                {ini(r?.name)}
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

// 지하철 게임: 3, 2, 1 → 서울 지하철 노선 제시 (1~9호선 + 수인분당선·경의중앙선 등, 역 이름은 오프라인으로 돌아가며)
function SubwayPanel({ room, pending: p, iAct, code, keyId }) {
  const step = useCountdown(keyId)
  if (step > 0) return <CountOverlay step={step} emoji="🚇" sub="노선을 뽑고 있어요…" />
  const actor = room.players[p.playerId]
  const line = subwayLine(p.line)
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🚇 지하철 게임</div>
        <h2>{p.title || '지하철 게임'}</h2>
        <div className={`subway-card ${line.badge ? 'named' : ''}`} style={{ '--sub': line.color }}>
          <span className={`subway-badge ${line.badge ? 'named' : ''}`}>{line.badge || line.n}</span>
          <span className="subway-name">{line.name}</span>
        </div>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b>부터 돌아가며 {line.name} 역 이름을 말해요. 막히거나, 틀리거나, 나온 역을 또 말하면 마셔요!
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

// 자석: 앞뒤 2칸 안 상대 말 쪽으로 우리 말이 끌려가서 잡기 (여러 곳이면 던진 사람이 고름)
function MagnetPanel({ room, pending: p, iAct, code }) {
  const actor = room.players[p.playerId]
  const targets = arr(p.targets)
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">{nodeName(p.pos)} · 🧲 자석</div>
        <h2>🧲 자석! 끌려가서 잡아요</h2>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b> — 앞뒤 {MAGNET_RANGE}칸 안에 상대 말이 있어요.{' '}
          {targets.length > 1 ? (iAct ? '어느 쪽으로 끌려갈지 고르세요.' : '어느 쪽으로 끌려갈지 고르고 있어요.') : '우리 말(업힌 말도)이 그쪽으로 끌려가서 잡아요.'} 상대 팀에 방패가 있으면 쓸지 물어봐요.
        </div>
        <div className="steal-list magnet-list">
          {targets.map((tg, i) => (
            <button key={tg.node} className="steal-btn magnet-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'pull', i)}>
              <span className="magnet-dir">
                {tg.dir === 'fwd' ? '⏩ 앞으로' : '⏪ 뒤로'} {tg.steps}칸
              </span>
              <span className="pname">{nodeName(tg.node)}</span>
              <span className="magnet-who">
                {arr(tg.victims).map((v) => (
                  <span key={v.team} className="team-chip" style={{ '--tc': TEAM_INFO[v.team]?.color }}>
                    {TEAM_INFO[v.team]?.short} {v.count}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
        <div className="actions">{iAct ? <div className="waiting">🧲 눌러서 끌려가기</div> : <div className="waiting">{actor?.name}이(가) 고르는 중…</div>}</div>
      </div>
    </div>
  )
}

// 운명의 카드 (자석에 붙은 말이 없을 때): 카드를 뒤집어 공개 → 던진 사람이 적용
const FATE_DESC = {
  fwd3: '우리 말(업힌 말도)이 3칸 앞으로! 상대 말이 있으면 잡고, 도착한 칸 미션도 해요.',
  back2: '우리 말(업힌 말도)이 2칸 뒤로… 상대 말이 있으면 잡고, 도착한 칸 미션도 해요.',
  nop: '우리 팀 놉카드 +1 🎫',
  all: '전원 한 잔씩 🍻',
}
const FATE_BTN = { fwd3: '⏩ 3칸 앞으로', back2: '⏪ 2칸 뒤로', nop: '🎫 놉카드 받기', all: '🍻 다 같이 마셔!' }
function FatePanel({ room, pending: p, iAct, code, keyId }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(false)
    const t = setTimeout(() => {
      setOpen(true)
      ding()
    }, 1000)
    return () => clearTimeout(t)
  }, [keyId])
  const card = FATE_CARDS[p.card] || FATE_CARDS.all
  const actor = room.players[p.playerId]
  return (
    <div className="modal-backdrop">
      <div className="modal fate-modal">
        <div className="kicker">{nodeName(p.pos)} · 🎴 운명의 카드</div>
        <h2>{p.fromMagnet ? '🧲 붙은 말이 없어요 → 🎴 운명의 카드!' : '🎴 운명의 카드'}</h2>
        <div className={`fate-card ${open ? 'open' : ''}`}>
          <div className="fate-back">🎴</div>
          <div className="fate-front">
            <span className="fate-emo">{card.emoji}</span>
            <b>{card.text}</b>
          </div>
        </div>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b> — {open ? FATE_DESC[p.card] || '' : '카드를 뒤집는 중…'}
        </div>
        {iAct ? (
          <div className="actions">
            <button className="btn btn-primary" disabled={!open} onClick={() => resolvePending(code, room, 'done')}>
              {FATE_BTN[p.card] || '확인'}
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

// 단어 노래: 3, 2, 1 → 단어 제시 → 그 단어가 들어간 노래를 돌아가며 한 소절씩 (오프라인)
function SongPanel({ room, pending: p, iAct, code, keyId }) {
  const step = useCountdown(keyId)
  if (step > 0) return <CountOverlay step={step} emoji="🎶" sub="단어를 뽑고 있어요…" />
  const actor = room.players[p.playerId]
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🎶 단어 노래</div>
        <h2>{p.title || '단어 노래 부르기'}</h2>
        <div className="song-word" key={p.word}>
          {p.word}
        </div>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b>부터 돌아가며 「{p.word}」{josa(p.word, '이', '가')} 들어간 노래를 한 소절씩 불러요. 막히거나, 이미 나온 노래를 부르면 마셔요!
        </div>
        {iAct ? (
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => resolvePending(code, room, 'reroll')}>
              🔄 다른 단어
            </button>
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

// 방패: 잡히려는 팀이 방패를 쓸지 고름 (그 팀 사람 누구나, 시간 제한 없음). 그 팀이 모두 연결이 끊겼으면 방장·던진 사람이 대신
function ShieldAskPanel({ room, pending: p, me, code }) {
  const asks = p.asks || {}
  const askTeams = Object.keys(asks)
    .map((k) => Number(k.slice(1)))
    .filter((t) => TEAM_INFO[t])
    .sort((a, b) => a - b)
  const victims = arr(p.victims)
  const actor = room.players[p.playerId]
  const myT = teamOf(room, me)
  const mineWaiting = askTeams.some((t) => (SOLO || myT === t) && asks[`t${t}`] === 'wait')
  // 잡힐 팀 폰: 진동
  useEffect(() => {
    if (!mineWaiting || SOLO) return
    try {
      navigator.vibrate?.([120, 60, 120])
    } catch {}
  }, [p.startedAt])
  return (
    <div className="modal-backdrop">
      <div className="modal shield-modal">
        <div className="kicker">{nodeName(p.pos)} · 🛡️ 방패</div>
        <h2>🛡️ 방패를 쓸까요?</h2>
        <div className="muted">
          <b style={{ color: actor?.color }}>{actor?.name}</b>이(가) {victims.map((v) => `${teamName(room, v.team)} 말 ${v.count}개`).join(' · ')}를 잡으려 해요. 방패를 쓰면 안 잡히고 방패가 1개 줄어요. 안 쓰면 말이 집으로 가고 팀 전원이 마셔요.
        </div>
        <div className="shield-list">
          {askTeams.map((t) => {
            const info = TEAM_INFO[t]
            const v = victims.find((x) => x.team === t)
            const st = asks[`t${t}`]
            const mine = canShieldFor(room, t)
            const proxy = mine && !SOLO && myT !== t // 그 팀이 모두 연결 끊김 → 대신 고르기
            return (
              <div key={t} className={`shield-row ${st}`} style={{ '--tc': info.color }}>
                <div className="shield-head">
                  <span className="team-dot" />
                  <b>{teamName(room, t)}</b>
                  <span className="shield-have">🛡️ {teamShield(room, t)}개</span>
                </div>
                {st === 'wait' ? (
                  mine ? (
                    <>
                    {proxy && <div className="shield-proxy">{teamName(room, t)}이 모두 연결이 끊겨서 대신 골라요</div>}
                    <div className="shield-btns">
                      <button className="btn btn-primary" onClick={() => shieldDecide(code, room, t, true)}>
                        🛡️ 방패 쓰기
                      </button>
                      <button className="btn btn-ghost shield-skip" onClick={() => shieldDecide(code, room, t, false)}>
                        그냥 잡힐게요 · {v?.count || 1}잔씩
                      </button>
                    </div>
                    </>
                  ) : (
                    <div className="waiting">{teamName(room, t)}이 고르는 중…{teamAllOffline(room, t) ? ' (모두 연결 끊김 — 방장·던진 사람이 대신 고를 수 있어요)' : ''}</div>
                  )
                ) : (
                  <div className="shield-done">{st === 'use' ? '🛡️ 방패 씀' : '안 씀 → 잡혀요'}</div>
                )}
              </div>
            )
          })}
        </div>
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
  const myTeam = teamOf(room, p.playerId)
  const nop = teamNop(room, myTeam)
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
            { emoji: '🍶', label: '팀 다 같이 마셔', color: '#ea002c' },
          ]
    const resultText = had > 0 ? (win ? `${teamName(room, myTeam)} 놉카드 +2! 🎫🎫` : `${teamName(room, myTeam)} 놉카드 ${had}장 소멸… 💀`) : win ? '안 마셔도 돼요! 😇' : `${teamName(room, myTeam)} 다 같이 마셔! 🍶`
    return (
      <RouletteOverlay
        room={room}
        actorId={p.playerId}
        iAct={iAct}
        revealKey={p.revealedAt}
        title="🎰 놉카드 도박"
        note={`${actor?.name} · ${teamName(room, myTeam)} 놉카드 ${had}장`}
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
          <b style={{ color: actor?.color }}>{actor?.name}</b> — {teamName(room, myTeam)} 놉카드 {nop}장.{' '}
          {nop > 0 ? (
            <>
              룰렛 50%로 <b>팀 놉카드 +2</b> 아니면 <b>팀 놉카드 전부 소멸</b>이에요.
            </>
          ) : (
            <>
              카드가 없어서 룰렛 50%로 <b>안 마시기</b> 아니면 <b>우리 팀 다 같이 마시기</b>예요.
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
                {ini(room.players[pid]?.name)}
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
  const mine = SOLO || m.playerId === me
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
  const mine = SOLO || m.playerId === me
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
            ? `${m.minutes}분 안에 아무도 눈치 못 채게 수행하세요. 시간이 끝나면 다른 사람들이 어떤 미션이었는지 5지선다로 맞혀요. 절반 이상이 맞히면 우리 팀이, 못 맞히면 틀린 사람들의 팀이 다 같이 마셔요.`
            : `${m.minutes}분 동안 누가 이상한 행동을 하는지 잘 관찰하세요 👀 시간이 끝나면 그 사람이 공개되고, 어떤 미션이었는지 5지선다로 맞히는 투표가 열려요. 절반 이상이 맞히면 그 사람 팀이, 못 맞히면 틀린 사람들의 팀이 다 같이 마셔요.`}
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
  const isPerformer = !SOLO && m.playerId === me
  const canControl = SOLO || isPerformer || room.hostId === me
  const voters = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && pid !== m.playerId)
  const votes = m.votes || {}
  const votedCount = voters.filter((pid) => votes[pid] != null).length
  const myVote = SOLO ? null : votes[me]
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
                    {ini(room.players[pid]?.name)}
                  </span>
                  <span className="pname">{room.players[pid].name}</span>
                  <span className={`tag ${ok ? '' : 'tag-gray'}`}>{v == null ? '미투표' : ok ? '정답 ✓' : m.choices[v]}</span>
                </div>
              )
            })}
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {r.caught
              ? `절반 이상이 맞혔어요 → ${who?.name}의 ${teamLabel(teamsOf(room, [m.playerId]), room)} 다 같이 마셔! 🍶`
              : r.wrong.length
                ? `틀린 사람: ${r.wrong.map((pid) => room.players[pid]?.name).join(', ')} → ${teamLabel(teamsOf(room, r.wrong), room)} 다 같이 마셔! 🍶`
                : '아무도 안 마셔요 😇'}
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

// 소주 보관소 (가운데 40번): 모인 술을 도착한 팀이 의리주로. 도착한 사람이 마지막 순서
function SojuBankPanel({ room, pending: p, iAct, code }) {
  const n = Math.max(0, Number(p.count) || 0)
  const step = useCountdown(`soju-${room.lastMove?.id}-${p.pos}`)
  const t = teamOf(room, p.playerId)
  const info = TEAM_INFO[t] || TEAM_INFO[0]
  if (n > 0 && step > 0) return <CountOverlay step={step} emoji="🏺" sub="소주 보관소를 여는 중…" />
  const order = arr(p.order).filter((pid) => room.players[pid]?.name)
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="kicker">🏺 소주 보관소 · 가운데 40번</div>
        {n > 0 ? (
          <>
            <h2>
              <span style={{ color: info.color }}>{teamName(room, t)}</span> 의리주 {n}잔!
            </h2>
            <div className="soju-jar" aria-label={`소주 ${n}잔`}>
              {'🍶'.repeat(Math.min(n, 12))}
              {n > 12 && <b> +{n - 12}</b>}
            </div>
            <div className="muted">보관소에 모인 {n}잔을 한 글라스에 모아 이 순서로 나눠 마셔요. 마지막 사람(도착한 사람)이 남은 걸 다 마셔요!</div>
            <div className="shuffle-list">
              {order.map((pid, i) => (
                <div key={pid} className={`shuffle-row ${i === order.length - 1 ? 'loser' : ''}`}>
                  <span className="order">{i + 1}</span>
                  <span className="avatar sm" style={{ background: room.players[pid].color }}>
                    {ini(room.players[pid]?.name)}
                  </span>
                  <span className="pname">{room.players[pid].name}</span>
                  {i === order.length - 1 && <span className="tag">마지막 🥃</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>보관소가 비어 있어요 😇</h2>
            <div className="muted">아직 '소주 +1' 칸에서 모인 술이 없어요. {teamName(room, t)} 그냥 통과!</div>
          </>
        )}
        <div className="actions">
          {iAct ? (
            <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
              {n > 0 ? '다 마셨다! 🍻' : '확인'}
            </button>
          ) : (
            <div className="waiting">{room.players[p.playerId]?.name}이(가) 확인하면 다음 차례로</div>
          )}
        </div>
      </div>
    </div>
  )
}

// 진행 중인 옵션 타이머 (모든 폰에 표시, 1초마다 갱신) — 옵션이 걸린 팀 색으로
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
          <div className={`timer ${left < 60000 ? 'soon' : ''} ${o.team != null ? 'team' : ''}`} key={k} style={o.team != null && TEAM_INFO[o.team] ? { '--tc': TEAM_INFO[o.team].color } : undefined}>
            <div className="timer-bar" style={{ width: `${pct}%` }} />
            <span className="timer-text">{oneLine(o.text)}</span>
            <span className="timer-who">{o.team != null && TEAM_INFO[o.team] ? `${o.who && String(o.who).startsWith(TEAM_INFO[o.team].name) ? o.who : TEAM_INFO[o.team].name}에 걸림` : o.who || '모두'}</span>
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
      players: Object.fromEntries(Object.entries(room.players || {}).map(([k, v]) => [k, `${v.name} team=${v.team} drinks=${v.drinks || 0} online=${v.online}`])),
      teamNop: room.teamNop,
      teamShield: room.teamShield,
      sojuBank: room.sojuBank,
      pending: room.pending,
      lastMove: room.lastMove && { id: room.lastMove.id, team: room.lastMove.team, path: room.lastMove.path, dest: room.lastMove.dest, caught: room.lastMove.caught },
      options: room.options,
      mission: room.mission && { stage: room.mission.stage, playerId: room.mission.playerId, endsIn: Math.round((room.mission.endsAt - Date.now()) / 1000), text: room.mission.text },
      serverOffset: serverNow() - Date.now(),
      rollsSinceMission: room.rollsSinceMission,
      usedPlaces: room.usedPlaces, // 이번 판에 지도 찍기로 나온 곳 (판마다 비움)
      usedWorld: room.usedWorld,
      usedTitles: room.usedTitles, // 이번 판에 드라마·영화·노래 맞히기로 나온 제목 번호
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
              🏆 {TEAM_INFO[summary.winner].name}
              {rows.some((r) => r.team === summary.winner) ? `(${rows.filter((r) => r.team === summary.winner).map((r) => r.name).join(', ')})` : ''} 승리
            </div>
          )}
          {summary.left && Object.keys(summary.left).length > 0 && (
            <div className="muted summary-left">
              {Object.entries(summary.left)
                .map(([k, n]) => {
                  const t = Number(String(k).replace(/^t/, ''))
                  const names = rows.filter((r) => r.team === t).map((r) => r.name)
                  return `${TEAM_INFO[t]?.name || ''}${names.length ? `(${names.join(', ')})` : ''} 말 ${n}개 못 들어옴 → ${n}잔씩`
                })
                .join(' · ')}
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
              {ini(r?.name)}
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
  // 진 팀마다 못 들어온 말 수 (끝날 때 저장한 값, 없으면 지금 판에서 셈)
  const ls = p.left ? liveTeams(room).filter((x) => x !== p.team && p.left[nopKey(x)] != null).map((x) => ({ team: x, left: p.left[nopKey(x)] })) : loserLeft(room, p.team)
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
              {ini(room.players[t]?.name)}
            </div>
          ))}
        </div>
        <div className="ai-note">{mem.map((t) => room.players[t]?.name).join(', ')} — 말 {pieceCountOf(room)}개 모두 골인!</div>
        {/* 10/16: 진 팀은 못 들어온 말 수만큼 마심 — 팀마다 몇 개 못 들어왔는지 */}
        <div className="win-left">
          {ls.map((x) => (
            <div key={x.team} className="win-left-row" style={{ '--tc': TEAM_INFO[x.team]?.color }}>
              <b>{teamName(room, x.team)}</b>
              <span>
                말 <strong>{x.left}개</strong> 못 들어옴
              </span>
              <em>{x.left}잔씩 🍶</em>
            </div>
          ))}
        </div>
        <div className="ai-name">
          <b>{ls.length === 1 ? `${teamName(room, ls[0].team)} ${ls[0].left}잔씩 마셔!` : '못 들어온 말 수만큼 마셔!'}</b> 🍻
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

// 판 아래 안내 한 줄 (판은 항상 전체가 보이고 칸마다 글자가 보임)
function BoardHint({ hint }) {
  return <div className="board-hint">{hint}</div>
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
    if (PRACTICE) return '' // 혼자 연습: 연습 방을 새로 만듦 (아래)
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
  const [nopConfirm, setNopConfirm] = useState(null) // 놉카드 사용 확인 중인 팀 { team }
  // 놉카드 사용 알림: 이 폰에서 '확인했어요'를 누른 알림 id (새로고침해도 다시 안 뜨게 sessionStorage)
  const [nopSeen, setNopSeen] = useState(() => {
    try {
      return sessionStorage.getItem('yt-nop-seen') || ''
    } catch {
      return ''
    }
  })
  const [showDrinks, setShowDrinks] = useState(false) // 🍺 오늘의 술고래 순위 팝업
  const [summaryHidden, setSummaryHidden] = useState(null) // 닫은 결과 카드 id
  const [pwInput, setPwInput] = useState('') // 방 만들 때 비밀번호(선택)
  const [roomList, setRoomList] = useState([]) // 홈 화면 방 목록
  const [joinTarget, setJoinTarget] = useState(null) // 비밀번호 입력 중인 방 {code}
  const [pwJoin, setPwJoin] = useState('')
  const [editing, setEditing] = useState(null) // { node, cell, text }
  const [throwAnim, setThrowAnim] = useState(null) // { id, value, sticks, playerId, phase }
  const [moveAnim, setMoveAnim] = useState(null) // { team, node, count }
  const [animating, setAnimating] = useState(false)
  const [sel, setSel] = useState(0) // 고른 윷 결과 번호
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

  // 앱을 열 때(다시 연결될 때도): 오래된 방 정리 — 지금 들어가 있는 방은 빼고
  useEffect(() => {
    if (connected) purgeRooms(code)
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
      if (!PRACTICE) sessionStorage.setItem('room', code)
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

  // 참가가 확정된 뒤에만 접속 상태 기록. 연결이 끊겼다 다시 붙을 때마다 다시 기록
  // (끊기면 서버가 online=false 로 바꾸는데, 예전엔 다시 연결돼도 true 로 안 돌아와서 폰 화면을 한 번 껐다 켠 사람은 계속 '끊김'으로 보였음)
  const joined = !!room?.players?.[me]?.name
  useEffect(() => {
    if (code && joined && connected) setupPresence(code)
  }, [code, joined, connected])

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

  // ---- 혼자 연습 게임 (?practice=): 이 기기 메모리에 연습 방 → 바로 게임 화면 → 고른 게임 시작 ----
  const [practicePick, setPracticePick] = useState(false) // 홈 화면의 연습 게임 고르기 창
  const practiceRef = useRef({ creating: false, started: false })
  useEffect(() => {
    if (!PRACTICE || code || practiceRef.current.creating) return
    practiceRef.current.creating = true
    createRoom(name.trim() || '나', '')
      .then(setCode)
      .catch((e) => setError(e.message || '연습을 시작하지 못했어요'))
  }, [])
  useEffect(() => {
    if (!PRACTICE || !room) return
    if (room.status === 'lobby' && room.hostId === me) startGame(code, room)
    else if (room.status === 'playing' && !practiceRef.current.started) {
      practiceRef.current.started = true
      if (!room.pending && PRACTICE_GAMES.some(([k]) => k === PRACTICE)) practiceStart(code, room, PRACTICE)
    }
  }, [room?.status])
  const goHome = () => {
    try {
      sessionStorage.removeItem('room')
    } catch {}
    window.location.href = window.location.pathname
  }
  const openPractice = (k) => (window.location.href = `${window.location.pathname}?practice=${k}`)

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
      // 윷가락이 날아가 떨어져 멈출 때까지 (3D 던지기 시간에 맞춤)
      await sleep(1300)
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
  const myTurn = SOLO || (!!curId && curId === me)
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
  const iAct = SOLO || pending?.playerId === me
  // 팀 대결 게임은 도착한 사람 또는 방장이 진행 (도착한 사람이 자리를 비워도 막히지 않게)
  // 팀 대결 진행(시작·룰렛·확인)은 그 칸에 걸린 사람만 — 그 사람이 연결 끊겼을 때만 방장이 대신 (게임이 안 멈추게)
  const ctlTeam = SOLO || pending?.playerId === me || (isHost && room?.players?.[pending?.playerId]?.online === false)
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
    if (wasSet && curId === me && !SOLO) {
      try {
        navigator.vibrate?.([120, 60, 120])
      } catch {}
      flash('내 차례! 윷을 던지세요 🥢', 2000)
    }
  }, [room?.turnNo, room?.status, curId])

  // 흔들어서 던지기: 가만히 두거나 탁자에 내려놓는 충격·살짝 부딪힘은 무시하고, '세게 여러 번' 흔들 때만 던짐
  //  - 중력을 뺀 가속도(없는 기기는 직전 값과의 차이)가 SHAKE_FORCE 를 넘는 순간이 SHAKE_WINDOW_MS 안에 SHAKE_HITS 번 이상
  //  - 내 차례가 되고 1초 동안은 무시 (폰을 집어 드는 움직임)
  const shakeRef = useRef({ room: null, code: '' })
  shakeRef.current = { room, code }
  useEffect(() => {
    if (!shake || !canThrow) return
    const armedAt = Date.now() + 1000
    let prev = null
    let hits = []
    let fired = false
    const onMotion = (e) => {
      const now = Date.now()
      const lin = e.acceleration
      let force = 0
      if (lin && lin.x != null) force = Math.hypot(lin.x || 0, lin.y || 0, lin.z || 0)
      else {
        const g = e.accelerationIncludingGravity
        if (!g || g.x == null) return
        const cur = { x: g.x || 0, y: g.y || 0, z: g.z || 0 }
        if (prev) force = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z)
        prev = cur
      }
      if (fired || now < armedAt) return
      if (force > SHAKE_FORCE) hits.push(now)
      hits = hits.filter((t) => now - t < SHAKE_WINDOW_MS)
      if (hits.length >= SHAKE_HITS) {
        fired = true
        throwYut(shakeRef.current.code, shakeRef.current.room)
      }
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [shake, canThrow])
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
    // 방장 폰 + 수행자 폰 (수행자는 3초 늦게, 방장 폰이 잠겨 있을 때만 실제로 넘김)
    if (!room || (room.hostId !== me && room.mission?.playerId !== me) || room.mission?.stage !== 'active') return
    const t = setInterval(() => missionTick(code, room), 1000)
    return () => clearInterval(t)
  }, [room, me, code])

  // 대기실에서 1시간 넘게 시작하지 않은 내 방은 방장 기기가 스스로 닫음 (게임 끝나고 대기실로 온 때부터 셈)
  useEffect(() => {
    if (!room || room.hostId !== me || room.status !== 'lobby' || typeof room.createdAt !== 'number') return
    const check = () => {
      if (Date.now() - lobbySince(room) >= LOBBY_TTL_MS) removeRoom(code)
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


  // 게임 화면에 들어오면 3D 윷 던지기를 미리 불러 둠 (첫 던지기부터 바로 나오게)
  useEffect(() => {
    if (room?.status === 'playing') preloadThrow3D()
  }, [room?.status])

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
  // 그 칸에 있는 팀들 (방패로 막은 뒤에는 여러 팀이 한 칸에 있을 수 있음)
  const occupants = (node) => Array.from({ length: tc }, (_, t) => t).filter((t) => (pieces[t] || []).some((pc) => pc.n === node))

  const pendingCell = showPending ? cells[pending.pos] || {} : null
  const statusText = !playing
    ? ''
    : room.winner != null
      ? `${teamName(room, room.winner)} 승리!`
      : throwAnim || unplayedThrow
        ? '윷 던지는 중…'
        : animating || unplayedMove
          ? '말이 움직이는 중…'
          : pending
            ? pending.kind === 'shieldAsk'
              ? '🛡️ 방패를 쓸지 고르는 중…'
              : iAct
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
          {room && !PRACTICE && (
            <button className="icon-btn" onClick={() => setShowDrinks(true)} aria-label="오늘의 술고래" title="오늘의 술고래">
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>🍺</span>
            </button>
          )}
          {room && !PRACTICE && (
            <button className="icon-btn" onClick={() => setShowLog(true)} aria-label="게임 로그" title="게임 로그">
              <Icon name="log" />
            </button>
          )}
          {(room || PRACTICE) && (
            <button className="icon-btn" onClick={PRACTICE ? goHome : onLeave} aria-label={PRACTICE ? '홈으로' : '나가기'} title={PRACTICE ? '홈으로' : '나가기'}>
              <Icon name="exit" />
            </button>
          )}
          <button className="icon-btn" onClick={toggleTheme} aria-label="테마 전환">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      {/* ---------- 혼자 연습 게임 ---------- */}
      {PRACTICE && (
        <div className="practice">
          <div className="card card-pad practice-head">
            <div className="kicker">🎯 혼자 연습 게임</div>
            <h2>해 볼 게임을 고르세요</h2>
            <div className="muted">판에 있는 팀 대결 게임을 미리 해 봐요. 우리 팀 1명과 상대 팀 2명은 가짜 참가자예요 (진짜 방과 상관없고 기록도 안 남아요).</div>
          </div>
          <div className="practice-grid">
            {PRACTICE_GAMES.map(([k, e, n, d]) => (
              <button key={k} className={`card practice-card ${room?.practiceKind === k ? 'last' : ''}`} disabled={!room || room.status !== 'playing' || !!room.pending} onClick={() => practiceStart(code, room, k)}>
                <span className="practice-emo">{e}</span>
                <b>{n}</b>
                <span className="muted">{d}</span>
                {room?.practiceKind === k && <em>↻ 다시 하기</em>}
              </button>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-ghost btn-block" onClick={goHome}>
            🏠 홈으로
          </button>
        </div>
      )}

      {/* ---------- 홈 ---------- */}
      {!room && !PRACTICE && (
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

          <button className="card card-pad home-link" onClick={() => setPracticePick(true)}>
            <span className="home-link-emo">🎯</span>
            <span>
              <b>혼자 연습 게임</b>
              <span className="muted">판에 있는 팀 게임(폭탄 돌리기·연타 줄다리기 등)을 혼자 미리 해 봐요</span>
            </span>
            <span className="home-link-go">→</span>
          </button>
        </>
      )}

      {/* ---------- 홈: 연습 게임 고르기 (게임 선택권처럼) ---------- */}
      {practicePick && !room && !PRACTICE && (
        <div className="modal-backdrop" onClick={() => setPracticePick(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">🎯 혼자 연습 게임</div>
            <h2>어떤 게임을 해 볼까요?</h2>
            <div className="cat-grid">
              {PRACTICE_GAMES.map(([k, e, n]) => (
                <button key={k} className="cat-btn" onClick={() => openPractice(k)}>
                  <span className="cat-emo">{e}</span>
                  <span>{n}</span>
                </button>
              ))}
            </div>
            <div className="muted">다른 참가자는 가짜예요. 진짜 방에는 아무 영향이 없어요.</div>
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setPracticePick(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
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
      {room && !PRACTICE && room.status === 'lobby' && (
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
              <br />
              🍶 걸리면 <b>팀 전원이 같이</b> 마셔요 (연대책임) · 🎫 놉카드는 <b>팀 단위</b> · ⏱ 옵션 칸은 <b>상대 팀</b>에 걸려요 · 🏺 가운데 40번은 소주 보관소
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
            <div className="row mission-row">
              <div className="label" style={{ marginBottom: 0 }}>
                🎯 돌발 미션 {room.missionOff ? 'Off' : 'On'}
              </div>
              <div className="spacer" />
              {isHost && (
                <div className="seg" role="group" aria-label="돌발 미션">
                  {[
                    [false, 'On'],
                    [true, 'Off'],
                  ].map(([off, label]) => (
                    <button key={label} className={!!room.missionOff === off ? 'on' : ''} onClick={() => setMissionOff(code, room, off)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="muted mission-note">{room.missionOff ? '이번 게임에는 돌발 미션이 안 나와요.' : '윷을 던질 때 가끔 한 명에게 몰래 미션이 와요 (끝나면 누군지 맞히기).'}</div>
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
                            {ini(p?.name)}
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

          <div ref={boardRef} className="board-scroll">
            <YutBoard cells={cells} pieces={{}} teamCount={tc} onCellTap={onCellTap} />
          </div>
          <BoardHint hint={isHost ? '칸을 누르면 내용을 고칠 수 있어요' : '칸을 누르면 벌칙이 크게 보여요'} />
        </>
      )}

      {/* ---------- 게임 ---------- */}
      {room && !PRACTICE && playing && (
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
                    <span className={`score-nop ${teamNop(room, t) ? '' : 'empty'}`} title={`${info.name} 놉카드 ${teamNop(room, t)}장`}>
                      🎫{teamNop(room, t)}
                    </span>
                    {teamShield(room, t) > 0 && (
                      <span className="score-shield" title={`${info.name} 방패 ${teamShield(room, t)}개`}>
                        🛡️{teamShield(room, t)}
                      </span>
                    )}
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
                    const occ = o.finished ? [] : occupants(o.dest)
                    const foes = occ.filter((t) => t !== curTeam)
                    const hint = `${occ.includes(curTeam) ? ' · 🤝 업기' : ''}${foes.length ? ` · 🎯 ${foes.map((t) => TEAM_INFO[t].short).join('·')} 잡기!${foes.some((t) => teamShield(room, t) > 0) ? ' (🛡️ 방패 있음)' : ''}` : ''}`
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
                          {o.finished ? '🏁 골인!' : o.dest === START ? '🏁 출발·골인 칸에 멈춤 (다음에 한 칸만 가도 골인)' : `${nodeName(o.dest)} ${cells[o.dest]?.emoji || ''} ${oneLine(cells[o.dest]?.text)}`}
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

          <div ref={boardRef} className="board-scroll">
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
              bank={room.sojuBank || 0}
            />
          </div>
          <BoardHint hint="칸을 누르면 벌칙이 크게 보여요" />
          <ThrowOverlay anim={throwAnim} who={room.players[throwAnim?.playerId]?.name || ''} teamColor={TEAM_INFO[teamOf(room, throwAnim?.playerId)]?.color} />

          {/* 팀원 · 팀 놉카드 (우리 팀 배지를 눌러 사용) */}
          <div className="card card-pad teams">
            <div className="teams-title">
              팀원 · 팀 놉카드
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0 }}>
                우리 팀 🎫 배지를 누르면 사용
              </span>
            </div>
            {Array.from({ length: tc }, (_, t) => {
              const info = TEAM_INFO[t]
              const mem = teamMembers(room, t)
              const n = teamNop(room, t)
              const ours = SOLO || teamOf(room, me) === t
              return (
                <div className={`team-card ${t === curTeam ? 'turn' : ''}`} style={{ '--tc': info.color }} key={t}>
                  <div className="team-head">
                    <b>{info.name}</b>
                    <span className="muted">{mem.length}명</span>
                    <span className="spacer" />
                    <button
                      className={`nop-badge team ${n === 0 ? 'empty' : ''}`}
                      onClick={() => ours && n > 0 && setNopConfirm({ team: t })}
                      disabled={!ours || n === 0}
                      title={ours ? '우리 팀 놉카드 사용' : `${info.name} 놉카드`}
                    >
                      <NopIcon /> 팀 놉카드 {n}
                    </button>
                    {teamShield(room, t) > 0 && <span className="shield-badge">🛡️ 방패 {teamShield(room, t)}</span>}
                  </div>
                  <div className="team-members">
                    {mem.map((pid) => {
                      const p = room.players[pid]
                      const mine = pid === me
                      return (
                        <div className={`mchip ${pid === curId ? 'turn' : ''} ${mine ? 'me' : ''} ${p.online === false ? 'offline' : ''}`} key={pid} title={p.online === false ? '연결 끊김' : ''}>
                          <span className="avatar xs" style={{ background: p.color }}>
                            {ini(p?.name)}
                          </span>
                          <span className="pname">{p.name}</span>
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
      {room &&
        showPending &&
        pending.kind === 'caught' &&
        (() => {
          // 여러 팀이 한 번에 잡힐 수도 있음 (방패로 막아서 한 칸에 같이 있던 말)
          const vs = arr(pending.victims).length ? arr(pending.victims) : [{ team: pending.victim, count: pending.count }]
          // 10/16: 잡아도 그 칸 벌칙은 그대로 → 확인 누르면 그 칸 벌칙, 끝나면 한 번 더
          const ct = oneLine(cells[pending.pos]?.text)
          return (
            <CongratsOverlay
              room={room}
              targets={vs.flatMap((v) => teamMembers(room, v.team))}
              actorId={pending.playerId}
              iAct={iAct}
              title="🎯 잡았다!"
              teamWide
              note={`${vs.map((v) => `${teamName(room, v.team)} 말 ${v.count}개${v.count > 1 ? `(${v.count}잔씩)` : ''}`).join(' · ')}가 집으로! · ${room.players[pending.playerId]?.name}${ct ? ` 이 칸 「${ct}」 하고` : ''} 한 번 더 던져요`}
              onDone={() => resolvePending(code, room, 'done')}
            />
          )
        })()}

      {/* ---------- 방패: 잡히려는 팀이 쓸지 고름 ---------- */}
      {room && showPending && pending.kind === 'shieldAsk' && <ShieldAskPanel room={room} pending={pending} me={me} code={code} />}

      {/* ---------- 승리 ---------- */}
      {room && showPending && pending.kind === 'win' && <WinOverlay room={room} pending={pending} isHost={isHost || SOLO} onDone={() => resolvePending(code, room, 'done')} />}

      {/* ---------- 같이 짠: 3·2·1 → 두 사람 공개 ---------- */}
      {room && showPending && pending.kind === 'toast' && pending.stage === 'reveal' && room.players[pending.target] && (
        <ToastReveal room={room} pending={pending} iAct={iAct} onDone={() => resolvePending(code, room, 'done')} />
      )}

      {/* ---------- AI 지목 ---------- */}
      {room && showPending && pending.kind === 'aiPick' && (
        <AiPickOverlay room={room} pending={pending} me={me} iAct={iAct} onDone={() => resolvePending(code, room, 'done')} />
      )}

      {/* ---------- 돌발 미션 ---------- */}
      {room && playing && room.mission?.stage === 'active' && missionSeen !== room.mission.id && !showPending && !busy && (
        <MissionCard room={room} me={me} code={code} onClose={() => setMissionSeen(room.mission.id)} />
      )}
      {room && playing && !showPending && !busy && <MissionQuiz room={room} me={me} code={code} />}

      {/* ---------- 놉카드 도박 ---------- */}
      {room && showPending && pending.kind === 'gamble' && <GamblePanel room={room} pending={pending} iAct={iAct} code={code} />}

      {/* ---------- 의리주 순서 ---------- */}
      {room && showPending && pending.kind === 'shuffle' && <ShufflePanel room={room} pending={pending} iAct={iAct} code={code} />}

      {/* ---------- 팀 대결 미니게임 (도착한 사람 또는 방장이 진행) ---------- */}
      {room && showPending && pending.kind === 'teamSync' && <SyncPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'tapWar' && <TapWarPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'teamReact' && <TeamReactPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'teamBomb' && <TeamBombPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'colorTrap' && <ColorTrapPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'circle' && <CirclePanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'priceGuess' && <PricePanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'timeSum' && <TimeSumPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'mapPin' && <MapPinPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'worldPin' && <WorldPinPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}
      {room && showPending && pending.kind === 'mediaQuiz' && <MediaQuizPanel room={room} pending={pending} me={me} ctl={ctlTeam} code={code} />}

      {/* ---------- 소주 보관소 (가운데 40번) ---------- */}
      {room && showPending && pending.kind === 'sojuBank' && <SojuBankPanel room={room} pending={pending} iAct={iAct} code={code} />}

      {/* ---------- 훈민정음 ---------- */}
      {room && showPending && pending.kind === 'hunmin' && (
        <HunminPanel room={room} pending={pending} iAct={iAct} code={code} keyId={`${room.lastMove?.id}-${pending.pos}-${pending.title || ''}`} />
      )}

      {/* ---------- 자석 · 운명의 카드 ---------- */}
      {room && showPending && pending.kind === 'magnet' && <MagnetPanel room={room} pending={pending} iAct={iAct} code={code} />}
      {room && showPending && pending.kind === 'fate' && <FatePanel room={room} pending={pending} iAct={iAct} code={code} keyId={`${room.lastMove?.id}-${pending.pos}-${pending.card}`} />}

      {/* ---------- 단어 노래 ---------- */}
      {room && showPending && pending.kind === 'wordSong' && (
        <SongPanel room={room} pending={pending} iAct={iAct} code={code} keyId={`${room.lastMove?.id}-${pending.pos}-${pending.title || ''}`} />
      )}

      {/* ---------- 지하철 게임 ---------- */}
      {room && showPending && pending.kind === 'subway' && (
        <SubwayPanel room={room} pending={pending} iAct={iAct} code={code} keyId={`${room.lastMove?.id}-${pending.pos}-${pending.title || ''}`} />
      )}

      {/* ---------- 도착 칸 모달 ---------- */}
      {room &&
        showPending &&
        !['aiPick', 'hunmin', 'subway', 'wordSong', 'shieldAsk', 'magnet', 'fate', 'shuffle', 'gamble', 'caught', 'win', 'sojuBank'].includes(pending.kind) &&
        !TEAM_GAMES.has(pending.kind) &&
        !(pending.kind === 'toast' && pending.stage === 'reveal') &&
        pendingCell && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="kicker">
                {nodeName(pending.pos)} · {KIND_LABEL[pending.kind] || '미션'}
              </div>
              <h2>{pending.title || pendingCell.full || oneLine(pendingCell.text)}</h2>
              {pending.kind === 'option' && pendingCell.pair && pending.partner && (
                <div className="pair-card">
                  <span className="avatar" style={{ background: room.players[pending.playerId]?.color }}>
                    {ini(room.players[pending.playerId]?.name)}
                  </span>
                  <b>{room.players[pending.playerId]?.name}</b>
                  <span className="heart">❤️</span>
                  <b>{room.players[pending.partner]?.name}</b>
                  <span className="avatar" style={{ background: room.players[pending.partner]?.color }}>
                    {ini(room.players[pending.partner]?.name)}
                  </span>
                </div>
              )}
              {pending.kind === 'choose' &&
                [
                  ['⚔️ 팀 대결 · 폰으로 다 같이', CHOOSE_TEAM],
                  ['🗣️ 말로 하는 게임 · 오프라인', CHOOSE_OFFLINE],
                ].map(([label, list]) => (
                  <div key={label} className="cat-section">
                    <div className="cat-group">{label}</div>
                    <div className="cat-grid">
                      {list.map(([k, e, n]) => (
                        <button key={k} className="cat-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'choose', k)}>
                          <span className="cat-emo">{e}</span>
                          <span>{n}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              <div className="muted">
                <b style={{ color: room.players[pending.playerId]?.color }}>{room.players[pending.playerId]?.name}</b>
                {pending.kind === 'nop' && ` — ${teamName(room, teamOf(room, pending.playerId))} 놉카드 +1! (지금 ${pending.teamNop ?? teamNop(room, teamOf(room, pending.playerId))}장 · 팀 누구나 쓸 수 있어요)`}
                {pending.kind === 'shield' &&
                  ` — ${teamName(room, teamOf(room, pending.playerId))} 방패 +1! (지금 ${pending.teamShield ?? teamShield(room, teamOf(room, pending.playerId))}개) 우리 말이 잡힐 때 방패를 쓸지 고를 수 있어요. 쓰면 안 잡혀요 🛡️`}
                {pending.kind === 'normal' && (iAct ? ' — 수행하고 완료를 눌러주세요.' : ' — 수행 중이에요.')}
                {pending.kind === 'bunny' && ' — 오프라인으로 바니바니 게임을 하고, 걸린 사람이 마셔요. 끝나면 수행 완료!'}
                {pending.kind === 'normal' &&
                  pendingCell.drink &&
                  (pendingCell.drink === 'all'
                    ? ' (전원 다 같이 마셔요)'
                    : pendingCell.drink === 'only'
                      ? ` (이름에 '${pendingCell.who}'이 들어간 사람만 마셔요)`
                      : pendingCell.drink === 'except'
                        ? ` (이름에 '${pendingCell.who}'이 들어간 사람 빼고 전원 마셔요)`
                        : ` (연대책임! ${teamName(room, teamOf(room, pending.playerId))} 다 같이 마셔요)`)}
                {pending.kind === 'allOptions' &&
                  ` — 상대 팀(${teamLabel(optionTargets(room, pending.playerId), room)})에 판에 있는 옵션(${Object.values(cells)
                    .filter((c) => c.type === 'option')
                    .map((c) => oneLine(c.text))
                    .join(' · ')})이 전부 ${pendingCell.minutes || 3}분씩 걸려요. 이미 걸려 있으면 시간이 더해져요.`}
                {pending.kind === 'sojuAdd' && ` — 소주 보관소에 1잔 적립! 지금 ${pending.bank ?? room.sojuBank ?? 0}잔 모였어요. 가운데 40번 보관소에 도착한 팀이 의리주로 다 마셔요 🏺`}
                {pending.kind === 'again' && ' — 보너스! 이번 차례에 윷을 한 번 더 던져요 🎲'}
                {pending.kind === 'home' && ' — 출발·골인 칸에 딱 멈췄어요! 골인은 이 칸을 지나가야 해서, 다음에 이 말을 한 칸이라도 움직이면 골인 🏁'}
                {pending.kind === 'option' &&
                  (() => {
                    const ts = optionTargets(room, pending.playerId)
                    const on = ts.some((t) => room.options?.[optionKey(pending.pos, t)]?.endsAt > Date.now())
                    return ` — 상대 팀(${teamLabel(ts, room)})에 ${oneLine(pendingCell.text)} ${pendingCell.minutes || 5}분이 걸려요${on ? ' (이미 걸려 있어서 시간 추가)' : ''}. 시간 안에 어기면 그 팀이 다 같이 마셔요! 남은 시간은 모든 폰 위에 떠요.`
                  })()}
                {pending.kind === 'release' &&
                  (pending.released
                    ? ` — ${teamName(room, teamOf(room, pending.playerId))}에 걸린 옵션 ${pending.released}개가 풀렸어요 🔓`
                    : ` — ${teamName(room, teamOf(room, pending.playerId))}에 걸린 옵션이 없어요.`)}
                {pending.kind === 'steal' &&
                  (liveTeams(room).some((t) => t !== teamOf(room, pending.playerId) && teamNop(room, t) > 0)
                    ? iAct
                      ? ' — 놉카드가 있는 팀을 골라 1장을 우리 팀으로 가져오세요.'
                      : ' — 어느 팀 놉카드를 가져올지 고르고 있어요.'
                    : ' — 다른 팀에 놉카드가 없어요.')}
                {pending.kind === 'choose' && (iAct ? ' — 진행할 게임을 하나 고르세요.' : ' — 게임을 고르고 있어요.')}
                {pending.kind === 'pickTeam' &&
                  (pending.stage === 'confirm' && TEAM_INFO[pending.target]
                    ? ` — 상대 팀 ${TEAM_INFO[pending.target].emoji} ${teamName(room, pending.target)} 다 같이 마셔요! 🍻`
                    : liveTeams(room).some((t) => t !== teamOf(room, pending.playerId))
                      ? iAct
                        ? ' — 다 같이 마실 팀을 고르세요.'
                        : ' — 마실 팀을 고르고 있어요.'
                      : ' — 마실 상대 팀이 없어요.')}
                {pending.kind === 'toast' &&
                  (rivalsOf(room, pending.playerId).length
                    ? iAct
                      ? ' — 상대 팀에서 한 명을 골라 둘이 같이 짠! 🥂 (둘만 마셔요)'
                      : ' — 같이 짠 할 사람을 고르고 있어요 🥂'
                    : ' — 같이 짠 할 상대가 없어요.')}
                {pending.kind === 'nhaeng' && ` — 이 키워드로 ${[...(pending.word || '')].length}행시! 다 지으면 다 같이 마셔요 🍻`}
                {pending.kind === 'back' &&
                  (pending.to
                    ? ` — 말이 ${pending.steps || 4}칸 뒤로 가서 ${nodeName(pending.to)}「${oneLine(cells[pending.to]?.text)}」에 도착해요. 업힌 말도 같이 가고, 도착한 칸 미션도 해요.`
                    : ' — 뒤로 갈 칸이 없어요.')}
              </div>
              {pending.kind === 'pickTeam' && pending.stage === 'choose' && (
                <div className="steal-list">
                  {liveTeams(room)
                    .filter((t) => t !== teamOf(room, pending.playerId))
                    .map((t) => (
                      <button key={t} className="steal-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'pickTeam', t)}>
                        <span className="team-dot" style={{ '--tc': TEAM_INFO[t].color }} />
                        <span className="pname">{teamName(room, t)}</span>
                        <span className="cnt">{teamMembers(room, t).length}명</span>
                      </button>
                    ))}
                </div>
              )}
              {pending.kind === 'toast' && (
                <div className="steal-list">
                  {rivalsOf(room, pending.playerId).map((pid) => {
                    const pl = room.players[pid]
                    return (
                      <button key={pid} className="steal-btn" disabled={!iAct} onClick={() => resolvePending(code, room, 'choose', pid)}>
                        <span className="avatar sm" style={{ background: pl.color }}>
                          {ini(pl?.name)}
                        </span>
                        <span className="pname">{pl.name}</span>
                        <span className="team-chip" style={{ '--tc': TEAM_INFO[teamOf(room, pid)]?.color }}>
                          {TEAM_INFO[teamOf(room, pid)]?.short}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {pending.kind === 'nhaeng' && pending.word && (
                <div className="nhaeng-card" key={pending.word}>
                  <div className="nhaeng-word">
                    {[...pending.word].map((ch, i) => (
                      <span key={i}>{ch}</span>
                    ))}
                  </div>
                  <div className="nhaeng-n">{[...pending.word].length}행시</div>
                </div>
              )}
              {pending.kind === 'steal' && (
                <div className="steal-list">
                  {liveTeams(room)
                    .filter((t) => t !== teamOf(room, pending.playerId))
                    .map((t) => (
                      <button key={t} className={`steal-btn ${teamNop(room, t) > 0 ? '' : 'none'}`} disabled={!iAct || teamNop(room, t) === 0} onClick={() => resolvePending(code, room, 'steal', t)}>
                        <span className="team-dot" style={{ '--tc': TEAM_INFO[t].color }} />
                        <span className="pname">{teamName(room, t)}</span>
                        <span className={`nop-badge ${teamNop(room, t) === 0 ? 'empty' : ''}`}>
                          <NopIcon /> {teamNop(room, t)}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {iAct ? (
                <div className="actions">
                  {pending.kind === 'nhaeng' && (
                    <button className="btn btn-ghost" onClick={() => resolvePending(code, room, 'reroll')}>
                      🔄 다른 키워드
                    </button>
                  )}
                  {pending.kind !== 'choose' &&
                    !(pending.kind === 'steal' && liveTeams(room).some((t) => t !== teamOf(room, pending.playerId) && teamNop(room, t) > 0)) &&
                    !(pending.kind === 'pickTeam' && pending.stage === 'choose' && liveTeams(room).some((t) => t !== teamOf(room, pending.playerId))) &&
                    !(pending.kind === 'toast' && rivalsOf(room, pending.playerId).length) && (
                      <button className="btn btn-primary" onClick={() => resolvePending(code, room, 'done')}>
                        {pending.kind === 'normal' || pending.kind === 'bunny'
                          ? '수행 완료'
                          : pending.kind === 'option'
                            ? `⏱ 상대 팀에 ${pendingCell.minutes || 5}분 걸기`
                            : pending.kind === 'allOptions'
                              ? `🚨 상대 팀에 ${pendingCell.minutes || 3}분씩 걸기`
                            : pending.kind === 'again'
                              ? '🎲 한 번 더!'
                              : pending.kind === 'pickTeam' && pending.stage === 'confirm' && TEAM_INFO[pending.target]
                                ? `👉 ${teamName(room, pending.target)} 마셔!`
                                : pending.kind === 'nhaeng'
                                  ? '🍻 다 같이 마셔!'
                                  : pending.kind === 'back' && pending.to
                                    ? `⏪ ${pending.steps || 4}칸 뒤로`
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

      {/* ---------- 팀 놉카드 사용 ---------- */}
      {nopConfirm && room && TEAM_INFO[nopConfirm.team] && (SOLO || teamOf(room, me) === nopConfirm.team) && (
        <div className="modal-backdrop" onClick={() => setNopConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">🎫 팀 놉카드</div>
            <h2>{teamName(room, nopConfirm.team)} 놉카드를 쓸까요?</h2>
            <div className="muted">
              우리 팀 놉카드 {teamNop(room, nopConfirm.team)}장. 놉카드는 말로 쓰는 거예요 — 무엇을 거부하는지 말하고 1장 쓰면, 모든 폰에 '놉카드 사용' 알림이 떠요. 팀원 누구나 쓸 수 있어요.
            </div>
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setNopConfirm(null)}>
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  useNopAnytime(code, room, nopConfirm.team)
                  setNopConfirm(null)
                }}
              >
                🙅 1장 사용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 놉카드 사용 알림 (모든 폰, 각자 '확인했어요'로 닫음) ---------- */}
      {room && room.status === 'playing' && room.nopNotice?.id && room.nopNotice.id !== nopSeen && serverNow() - (room.nopNotice.at || 0) < NOP_NOTICE_MS && TEAM_INFO[room.nopNotice.team] && (
        <NopNotice
          room={room}
          notice={room.nopNotice}
          me={me}
          onClose={() => {
            setNopSeen(room.nopNotice.id)
            try {
              sessionStorage.setItem('yt-nop-seen', room.nopNotice.id)
            } catch {}
          }}
        />
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
              {peek.cell.emoji} {peek.cell.full || oneLine(peek.cell.text)}
            </h2>
            {KIND_DESC[peek.cell.type] && <div className="muted">{KIND_DESC[peek.cell.type]}</div>}
            {peek.node === 'o0' && <div className="muted">고정 칸 (편집 불가) — 여기에 도착하거나 지나가면 골인!</div>}
            {peek.cell.type === 'sojuBank' && (
              <div className="muted">
                고정 칸 · '소주 +1' 칸에 걸릴 때마다 여기에 한 잔씩 모여요. 지금 <b>{room?.sojuBank || 0}잔</b>. 여기에 도착한 팀이 모인 술을 의리주로 다 마시고, 도착한 사람이 마지막 순서예요.
              </div>
            )}
            {CORNERS.has(peek.node) && peek.node !== CORNER_BL && <div className="muted">이 모서리에 멈춘 말은 다음 이동 때 대각선(지름길)과 직진 중에서 골라요.</div>}
            {peek.node === CORNER_BL && <div className="muted">대각선이 끝나는 모서리예요. 여기서는 아래 변을 따라 출발 칸(골인) 쪽으로 가요.</div>}
            {peek.node === 'C' && <div className="muted" style={{ marginTop: 6 }}>가운데에 멈춘 말은 다음 이동 때 골인 쪽 대각선과 직진 중에서 골라요.</div>}
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
