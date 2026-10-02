// Firebase Realtime Database 방 로직 (주루윷놀이)
// yutRooms/{CODE} = {
//   hostId, hostName, pw?, createdAt, lastActive, status: 'lobby' | 'playing',
//   teamCount: 2~4, players/{pid}: { name, color, team, nop, drinks, online },
//   order: [pid...] (팀 안에서 던지는 순서), teamTurn, memberIdx/{team}, turnNo, throwNo,
//   pieces/{team}: [{ n: 'home'|'goal'|노드, p?: 직전 노드 } x4],
//   yut: { stage: 'throw'|'move'|'done', results: [값...], extra: 보너스 던지기 수 },
//   lastThrow: { id, playerId, value, sticks }, lastMove: { id, team, from, path, count, dest, caught },
//   pending: { kind, playerId, pos(노드) } | null, winner, event, log, options, mission, cells/{노드}: 텍스트
// }
import { dbGet, dbSet, dbUpdate, dbRemove, dbOn, dbOnConnected, dbPresence, now, DEMO, demoSeed, dbPurgeOldRooms, dbWatchServerOffset, serverNow, dbOnRooms, shouldPurge, ROOMS } from './db'
import './firebase'
import { DEFAULT_YUT_CELLS, TEAM_INFO, throwSticks, sticksFor, yutName, isBonus, moveOptions, teamDone, freshPieces, normPieces, nodeName } from './game/yut'
import { BALANCE_TOPICS } from './game/balance'
import { pickLiarWords } from './game/liar'
import { pickBombTopic } from './game/bomb'
import { drawMission, MISSION_CHANCE, MISSION_MIN_GAP } from './game/missions'
import { autoEmoji } from './game/emoji'

export const COLORS = ['#ea002c', '#2f6df6', '#1fa97a', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#84cc16', '#14b8a6', '#f97316']

// ---------- 내 아이디 (기기별 고정) ----------
export function myId() {
  // 테스트용: ?pid=abc 로 열면 그 탭은 별도 플레이어로 취급 (같은 브라우저에서 2인 테스트)
  const q = new URLSearchParams(window.location.search).get('pid')
  if (q) return 'p_' + q.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)
  try {
    let id = localStorage.getItem('pid')
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem('pid', id)
    }
    return id
  } catch {
    return 'p_' + Math.random().toString(36).slice(2, 10)
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode() {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const roomPath = (code) => `${ROOMS}/${code}`

// 방 상태 갱신 + event 가 있으면 게임 로그(log/{id})에도 같이 기록
export const LOG_MAX = 80
function roomUpdate(code, updates) {
  updates.lastActive = Date.now()
  const ev = updates.event
  if (ev && ev.id && ev.text) updates[`log/${ev.id}`] = { t: Date.now(), text: String(ev.text).replace(/\n/g, ' ') }
  return dbUpdate(roomPath(code), updates)
}
// 로그 최신순 배열
export function roomLog(room) {
  return Object.entries(room?.log || {})
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => b.t - a.t)
}
// 방장: 로그가 너무 길면 오래된 것 삭제
export async function trimLog(code, room) {
  if (room.hostId !== myId()) return
  const all = roomLog(room)
  if (all.length <= LOG_MAX) return
  const upd = {}
  all.slice(LOG_MAX).forEach((e) => (upd[`log/${e.id}`] = null))
  await dbUpdate(roomPath(code), upd)
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// ---------- 방 만들기 / 입장 ----------
export function purgeRooms() {
  return dbPurgeOldRooms().catch(() => 0)
}

export async function createRoom(name, password = '') {
  const id = myId()
  // 오래된/빈 방 정리 (실패해도 방 만들기는 계속)
  purgeRooms()
  let code = randomCode()
  for (let tries = 0; tries < 5; tries++) {
    if ((await dbGet(roomPath(code))) == null) break
    code = randomCode()
  }
  const pw = String(password || '').trim()
  await dbSet(roomPath(code), {
    hostId: id,
    hostName: name,
    createdAt: now(),
    lastActive: Date.now(),
    status: 'lobby',
    teamCount: 2,
    ...(pw ? { pw } : {}),
    players: { [id]: { name, color: COLORS[0], team: 0, nop: 0, joinedAt: now() } },
  })
  if (DEMO) {
    demoSeed(code, ['관희', '윤정', '민수'], COLORS)
    // 데모: &nop=2 처럼 내 놉카드 수 지정
    const myNop = parseInt(new URLSearchParams(window.location.search).get('nop'), 10)
    if (myNop >= 0) await dbUpdate(roomPath(code), { [`players/${id}/nop`]: myNop })
  }
  return code
}

export async function joinRoom(code, name, password = '') {
  code = code.trim().toUpperCase()
  const room = await dbGet(roomPath(code))
  if (room == null) throw new Error('그런 방이 없어요. 다시 확인해주세요.')
  const id = myId()
  const players = room.players || {}
  if (room.kicked?.[id]) throw new Error('방장이 이 방에서 내보낸 참가자예요.')
  if (!players[id]?.name) {
    if (room.pw && room.pw !== String(password || '').trim()) {
      const err = new Error(password ? '비밀번호가 틀렸어요.' : '비밀번호가 필요한 방이에요.')
      err.needPassword = true
      throw err
    }
    if (Object.keys(players).length >= 12) throw new Error('방이 가득 찼어요 (최대 12명).')
    const used = new Set(Object.values(players).map((p) => p.color))
    const color = COLORS.find((c) => !used.has(c)) || COLORS[Object.keys(players).length % COLORS.length]
    const team = smallestTeam(room)
    const upd = { [`players/${id}`]: { name, color, team, nop: 0, drinks: 0, joinedAt: now() } }
    if (room.order) upd.order = [...lobbyOrder(room), id]
    if (room.status === 'playing') upd.event = { id: newId(), text: `👋 ${name} 님이 ${TEAM_INFO[team].name}으로 합류했어요` }
    await roomUpdate(code, upd)
  } else if (players[id].name !== name) {
    await dbUpdate(`${ROOMS}/${code}/players/${id}`, { name })
  }
  return code
}

export async function leaveRoom(code) {
  const id = myId()
  const room = await dbGet(roomPath(code))
  if (room == null) return
  const rest = Object.keys(room.players || {}).filter((p) => p !== id && room.players[p]?.name)
  if (rest.length === 0) {
    await dbRemove(roomPath(code))
    return
  }
  const upd = { [`players/${id}`]: null }
  if (room.hostId === id) {
    // 방장 자동 위임: 접속 중인 사람 우선
    const next = rest.find((p) => room.players[p]?.online !== false) || rest[0]
    upd.hostId = next
    upd.event = { id: newId(), text: `👑 ${room.players[id]?.name}이(가) 나가서 ${room.players[next]?.name}이(가) 방장이 됐어요` }
  }
  if (room.status === 'playing') {
    // 게임 중 나가기: 같은 팀 다음 사람이 이어서 던짐 (내가 처리 중이던 칸은 정리)
    if (room.pending?.playerId === id) upd.pending = null
    if (!upd.event) upd.event = { id: newId(), text: `👋 ${room.players[id]?.name} 님이 나갔어요` }
  }
  await roomUpdate(code, upd)
}

// 방장 위임 (방장만, 대기실/게임 중 모두)
export async function transferHost(code, room, toId) {
  if (room.hostId !== myId() || !room.players?.[toId]?.name || toId === room.hostId) return
  await roomUpdate(code, { hostId: toId, event: { id: newId(), text: `👑 ${room.players[toId].name}이(가) 새 방장이 됐어요` } })
}

// 방 삭제 (모든 참가자 화면에 '방이 사라졌어요' 표시)
export function removeRoom(code) {
  return dbRemove(roomPath(code)).catch(() => {})
}

export function subscribeRoom(code, cb) {
  return dbOn(roomPath(code), cb)
}

export function watchServerOffset() {
  return dbWatchServerOffset()
}
export { serverNow }
export function subscribeConnection(cb) {
  return dbOnConnected(cb)
}

export function setupPresence(code) {
  dbPresence(`${ROOMS}/${code}/players/${myId()}/online`)
}

// ---------- 방 상태에서 파생되는 값 ----------
// 방장이 내용을 바꾼 칸: 원래 기능(놉카드·옵션·밸런스 등)은 사라지고 '수행 완료'만 있는 일반 칸이 됨
function withOverride(c, text) {
  return { text, emoji: autoEmoji(text), type: 'normal', edited: true }
}
// 노드id → 칸 { emoji, text, type, ... }
export function roomCells(room) {
  const ov = room?.cells || {}
  const out = {}
  Object.entries(DEFAULT_YUT_CELLS).forEach(([k, c]) => (out[k] = ov[k] != null && !c.locked ? withOverride(c, ov[k]) : { type: 'normal', ...c }))
  return out
}
// 참가자 순서 (방장이 정한 순서 → 팀 안에서 던지는 순서로 사용). 새로 들어온 사람은 뒤에 붙음
export function lobbyOrder(room) {
  const ids = Object.keys(room.players || {}).filter((id) => room.players[id]?.name)
  const set = (room.order || []).filter((id) => ids.includes(id))
  return [...set, ...ids.filter((id) => !set.includes(id))]
}
export const roomOrder = lobbyOrder

// ---------- 팀 ----------
export function teamCount(room) {
  return Math.min(4, Math.max(2, room?.teamCount || 2))
}
export function teamOf(room, pid) {
  const t = room.players?.[pid]?.team
  return typeof t === 'number' && t >= 0 && t < teamCount(room) ? t : 0
}
export function teamMembers(room, t) {
  return lobbyOrder(room).filter((pid) => teamOf(room, pid) === t)
}
function smallestTeam(room, counts) {
  const n = teamCount(room)
  const c = counts || Array.from({ length: n }, (_, t) => teamMembers(room, t).length)
  let best = 0
  for (let t = 1; t < n; t++) if (c[t] < c[best]) best = t
  return best
}
export function roomPieces(room) {
  return normPieces(room?.pieces, teamCount(room))
}
export const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])
export function currentTeam(room) {
  return room?.teamTurn || 0
}
export function currentPlayerId(room) {
  const t = currentTeam(room)
  const m = teamMembers(room, t)
  if (!m.length) return null
  return m[(room.memberIdx?.[t] || 0) % m.length]
}

// 방장: 팀 수 (대기실)
export async function setTeamCount(code, room, n) {
  if (room.hostId !== myId() || room.status !== 'lobby') return
  n = Math.min(4, Math.max(2, n))
  const upd = { teamCount: n }
  const next = { ...room, teamCount: n }
  const counts = Array.from({ length: n }, () => 0)
  const ids = lobbyOrder(room)
  ids.forEach((pid) => {
    const t = room.players[pid]?.team
    if (typeof t === 'number' && t < n) counts[t]++
  })
  const teamNow = {}
  ids.forEach((pid) => {
    const t = room.players[pid]?.team
    if (typeof t === 'number' && t < n) return (teamNow[pid] = t)
    const nt = smallestTeam(next, counts)
    counts[nt]++
    teamNow[pid] = nt
    upd[`players/${pid}/team`] = nt
  })
  // 팀이 늘어나 빈 팀이 생기면, 가장 많은 팀의 마지막 사람을 옮겨 인원을 고르게 맞춤
  for (let guard = 0; guard < 20; guard++) {
    let big = 0
    let small = 0
    for (let t = 1; t < n; t++) {
      if (counts[t] > counts[big]) big = t
      if (counts[t] < counts[small]) small = t
    }
    if (counts[big] - counts[small] < 2) break
    const mover = [...ids].reverse().find((pid) => teamNow[pid] === big)
    if (!mover) break
    teamNow[mover] = small
    counts[big]--
    counts[small]++
    upd[`players/${mover}/team`] = small
  }
  await roomUpdate(code, upd)
}
// 방장: 참가자 팀 바꾸기 (대기실, 다음 팀으로 순환)
export async function setPlayerTeam(code, room, pid, t) {
  if (room.hostId !== myId() || room.status !== 'lobby' || !room.players?.[pid]) return
  await roomUpdate(code, { [`players/${pid}/team`]: ((t % teamCount(room)) + teamCount(room)) % teamCount(room) })
}
// 방장: 팀 랜덤으로 고르게 섞기
export async function shuffleTeams(code, room) {
  if (room.hostId !== myId() || room.status !== 'lobby') return
  const n = teamCount(room)
  const ids = shuffle(lobbyOrder(room))
  const upd = {}
  const offset = Math.floor(Math.random() * n)
  ids.forEach((pid, i) => (upd[`players/${pid}/team`] = (i + offset) % n))
  await roomUpdate(code, upd)
}

// 방장: 던지는 순서 변경 (dir = -1 위로 / +1 아래로). 같은 팀 안에서 이 순서대로 돌아가며 던짐
export async function moveOrder(code, room, playerId, dir) {
  if (room.hostId !== myId()) return
  const order = lobbyOrder(room)
  const i = order.indexOf(playerId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j], order[i]]
  await roomUpdate(code, { order, orderSet: true })
}

// 방장: 같은 팀 안에서 던지는 순서 바꾸기 (dir = -1 위로 / +1 아래로)
export async function moveInTeam(code, room, playerId, dir) {
  if (room.hostId !== myId()) return
  const order = lobbyOrder(room)
  const mates = teamMembers(room, teamOf(room, playerId))
  const k = mates.indexOf(playerId)
  const other = mates[k + dir]
  if (k < 0 || !other) return
  const i = order.indexOf(playerId)
  const j = order.indexOf(other)
  ;[order[i], order[j]] = [order[j], order[i]]
  await roomUpdate(code, { order, orderSet: true })
}

// 방장: 순서 랜덤으로 섞기 (대기실)
export async function shuffleOrder(code, room) {
  if (room.hostId !== myId() || room.status !== 'lobby') return
  await roomUpdate(code, { order: shuffle(lobbyOrder(room)), orderSet: true })
}

// 방장: 대기실에서 참가자 강퇴 (다시 못 들어옴)
export async function kickPlayer(code, room, playerId) {
  if (room.hostId !== myId() || room.status !== 'lobby' || playerId === myId()) return
  const name = room.players?.[playerId]?.name || ''
  const order = lobbyOrder(room).filter((id) => id !== playerId)
  await roomUpdate(code, {
    [`players/${playerId}`]: null,
    [`kicked/${playerId}`]: true,
    order: room.orderSet ? order : null,
    event: { id: newId(), text: `${name} 님이 방에서 나갔어요 (방장 강퇴)` },
  })
}

export async function startGame(code, room) {
  if (room.hostId !== myId()) return
  const n = teamCount(room)
  for (let t = 0; t < n; t++) if (!teamMembers(room, t).length) return
  const pieces = freshPieces(n)
  // 데모: &place=0:o4,1:o5 처럼 팀별 말을 미리 판 위에 둠 (테스트용)
  if (DEMO) {
    const place = new URLSearchParams(window.location.search).get('place')
    ;(place || '').split(',').filter(Boolean).forEach((s) => {
      const [t, node] = s.split(':')
      const i = pieces[+t]?.findIndex((pc) => pc.n === 'home')
      if (i >= 0) pieces[+t][i] = node === 'goal' ? { n: 'goal' } : { n: node }
    })
  }
  const first = DEMO ? 0 : Math.floor(Math.random() * n)
  const memberIdx = {}
  for (let t = 0; t < n; t++) memberIdx[t] = 0
  const teamText = Array.from({ length: n }, (_, t) => `${TEAM_INFO[t].emoji}${teamMembers(room, t).map((id) => room.players[id].name).join('·')}`).join(' vs ')
  const upd = {
    status: 'playing',
    teamTurn: first,
    memberIdx,
    turnNo: 0,
    throwNo: 0,
    pieces,
    yut: { stage: 'throw', extra: 0 },
    winner: null,
    mission: null,
    summary: null,
    startedAt: Date.now(),
    rollsSinceMission: MISSION_MIN_GAP,
    pending: null,
    lastMove: null,
    lastThrow: null,
    options: null,
    event: { id: newId(), text: `${teamText} — ${TEAM_INFO[first].name} 먼저!` },
  }
  Object.keys(room.players || {}).forEach((pid) => (upd[`players/${pid}/drinks`] = 0))
  await roomUpdate(code, upd)
}

// 아직 안 나온 밸런스 주제 중 하나를 고름 (다 나오면 처음부터 다시)
export function pickTopic(room) {
  const used = room.usedTopics || []
  let pool = BALANCE_TOPICS.map((_, i) => i).filter((i) => !used.includes(i))
  if (!pool.length) pool = BALANCE_TOPICS.map((_, i) => i)
  return pool[Math.floor(Math.random() * pool.length)]
}

// 훈민정음: 두 글자 초성 (흔한 자음만)
const CHOSUNG = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
export function pickChosung(prev) {
  let c
  do {
    c = CHOSUNG[Math.floor(Math.random() * CHOSUNG.length)] + CHOSUNG[Math.floor(Math.random() * CHOSUNG.length)]
  } while (c === prev)
  return c
}

function pendingFor(room, playerId, pos) {
  const cell = roomCells(room)[pos] || {}
  return makePending(room, playerId, pos, cell.type || 'normal')
}
// kind 별 대기 상태 만들기 (게임 선택권에서 고른 게임에도 사용)
function makePending(room, playerId, pos, kind, title) {
  const p = { kind, playerId, pos }
  if (title) p.title = title
  if (kind === 'balance') {
    p.topic = pickTopic(room)
    p.stage = 'vote' // vote → (tie → vote) / result / roulette
    p.round = 1
  }
  if (kind === 'liar') p.stage = 'category' // category → reveal → vote → result
  if (kind === 'hunmin') p.chosung = pickChosung()
  if (kind === 'vote') p.stage = 'vote' // vote → result
  if (kind === 'shuffle') {
    // 의리주: 방에 있는 사람들 순서를 무작위로
    const ids = Object.keys(room.players || {}).filter((id) => room.players[id]?.name)
    p.order = shuffle(ids)
    p.startedAt = Date.now()
  }
  if (kind === 'choose') p.stage = 'choose'
  if (kind === 'bomb') {
    p.stage = 'ready' // ready → ticking (explodeAt) → 확인
    p.topic = pickBombTopic()
  }
  if (kind === 'reaction') p.stage = 'ready' // ready → armed(goAt) → result
  if (kind === 'gamble') {
    // ask → spin(roulette, revealedAt). 놉카드가 0장이면 선택 없이 바로 룰렛
    const nop = room.players?.[playerId]?.nop || 0
    if (nop > 0) p.stage = 'ask'
    else Object.assign(p, { stage: 'spin', roulette: Math.random() < 0.5 ? 'win' : 'lose', revealedAt: Date.now(), nopAtSpin: 0 })
  }
  if (kind === 'option') {
    const cell = roomCells(room)[pos] || {}
    if (cell.pair) {
      // 연대책임: 도착한 사람 외 한 명을 무작위로 짝 지정
      const others = Object.keys(room.players || {}).filter((id) => id !== playerId && room.players[id]?.name)
      p.partner = others.length ? others[Math.floor(Math.random() * others.length)] : null
    }
  }
  if (kind === 'pick') p.stage = 'choose'
  if (kind === 'aiPick') {
    // 방에 있는 사람(이름 있는 참가자) 중 아무나 한 명
    const ids = Object.keys(room.players || {}).filter((id) => room.players[id]?.name)
    p.target = ids[Math.floor(Math.random() * ids.length)] || playerId
    p.startedAt = Date.now()
  }
  return p
}

// 옵션 해제 칸에 도착하면 모든 옵션 타이머 삭제
function withReleaseUpdates(room, pending, updates, who) {
  if (pending?.kind === 'release') {
    updates.options = null
    const n = Object.keys(room.options || {}).length
    updates.event = { id: newId(), text: n ? `${who} 옵션 해제! 타이머 ${n}개 종료 ⏹` : `${who} 옵션 해제 (진행 중인 옵션 없음)` }
  }
  return updates
}
export const optionKey = (pos) => `n_${pos}`
const optionLabel = (cell) => cell.text.replace(/\s*\(option\)\s*/i, '').trim()

// 옵션 수행 확정 → 모두에게 적용되는 타이머 시작. 이미 진행 중이면 시간 추가(+10분)
function optionStartUpdates(room, cell, pos, me, id, updates, partner) {
  const minutes = cell.minutes || 10
  const key = optionKey(pos)
  const cur = room.options?.[key]
  const nowMs = Date.now()
  // 연대책임: 짝(도착한 사람 ❤️ 무작위 1명). 재방문이면 새 짝으로 교체
  const pair = cell.pair && partner ? [id, partner] : null
  const pairText = pair ? `${room.players[pair[0]]?.name} ❤️ ${room.players[pair[1]]?.name}` : ''
  if (cur && cur.endsAt > nowMs) {
    updates[`options/${key}`] = {
      ...cur,
      endsAt: cur.endsAt + minutes * 60 * 1000,
      minutes: (cur.minutes || 0) + minutes,
      ...(pair ? { pair, who: pairText } : {}),
    }
    const leftMin = Math.ceil((cur.endsAt + minutes * 60 * 1000 - nowMs) / 60000)
    updates.event = { id: newId(), text: `⏱ ${optionLabel(cell)} +${minutes}분 (남은 시간 ${leftMin}분)${pair ? ` — ${pairText}` : ''}` }
  } else {
    updates[`options/${key}`] = {
      text: optionLabel(cell),
      startedAt: nowMs,
      endsAt: nowMs + minutes * 60 * 1000,
      minutes,
      ...(pair ? { pair, who: pairText } : {}),
    }
    updates.event = { id: newId(), text: pair ? `⏱ ${optionLabel(cell)} ${minutes}분 — ${pairText} 함께 벌칙!` : `⏱ ${optionLabel(cell)} ${minutes}분 시작 — 모두 적용!` }
  }
  return updates
}

// 방장: 끝난 옵션 타이머 정리 + 알림
export async function clearExpiredOptions(code, room) {
  if (room.hostId !== myId()) return
  const nowMs = Date.now()
  const expired = Object.entries(room.options || {}).filter(([, o]) => o.endsAt <= nowMs)
  if (!expired.length) return
  const updates = {}
  expired.forEach(([k]) => (updates[`options/${k}`] = null))
  updates.event = { id: newId(), text: `⏰ ${expired.map(([, o]) => o.text).join(', ')} 끝!` }
  await roomUpdate(code, updates)
}

// 밸런스 주제가 정해질 때 usedTopics 갱신을 updates에 포함
function withTopicUpdates(room, pending, updates) {
  if (pending?.kind === 'balance' && pending.topic != null) {
    const used = room.usedTopics || []
    updates.usedTopics = used.length >= BALANCE_TOPICS.length - 1 ? [pending.topic] : [...used, pending.topic]
  }
  return updates
}

// 밸런스 게임: 다른 주제로 교체 (행동 주체만)
export async function rerollTopic(code, room) {
  const p = room.pending
  const id = DEMO ? p?.playerId : myId()
  if (!p || p.kind !== 'balance' || p.playerId !== id) return
  const next = { ...p, topic: pickTopic(room), stage: 'vote', votes: null, round: (p.round || 1) + 1, revealedAt: null, roulette: null, refused: null }
  await roomUpdate(code, withTopicUpdates(room, next, { pending: next }))
}

// 데모: ?yut=4,3,-1 처럼 던질 값을 차례대로 고정 (테스트용)
function demoYut(room) {
  if (!DEMO) return null
  const q = new URLSearchParams(window.location.search).get('yut')
  if (!q) return null
  const list = q.split(',').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x))
  return list.length ? list[(room.throwNo || 0) % list.length] : null
}

// 윷 던지기 (현재 차례인 사람만)
export async function throwYut(code, room) {
  const id = DEMO ? currentPlayerId(room) : myId()
  if (room.status !== 'playing' || room.pending || room.winner != null || currentPlayerId(room) !== id) return
  const y = room.yut || {}
  if ((y.stage || 'throw') !== 'throw') return
  let { value } = throwSticks()
  const forced = demoYut(room)
  if (forced != null) value = forced
  const me = room.players[id]
  const results = arr(y.results)
  const upd = {
    throwNo: (room.throwNo || 0) + 1,
    lastThrow: { id: newId(), playerId: id, value, sticks: value === 0 ? null : sticksFor(value) },
  }
  upd[`log/${newId()}`] = { t: Date.now(), text: `${me.name} 🥢 ${yutName(value)}${value === 0 ? ' — 마셔! 🍶' : ''}` }
  maybeMission(room, upd)
  if (value === 0) {
    // 낙: 이번 던지기는 무효 + 던진 사람 마시기
    addDrinks(room, upd, [id])
    Object.assign(upd, nextTurnUpdates({ ...room, yut: { ...y, results } }))
  } else {
    results.push(value)
    if (isBonus(value)) {
      upd['yut/stage'] = 'throw'
      upd['yut/results'] = results
    } else Object.assign(upd, nextTurnUpdates({ ...room, yut: { ...y, results } }))
  }
  await roomUpdate(code, upd)
}

// 말 옮기기: ri = 쓸 결과 번호, from = 옮길 말 묶음의 노드 (새 말은 'home')
export async function moveYut(code, room, ri, from) {
  const id = DEMO ? currentPlayerId(room) : myId()
  if (room.status !== 'playing' || room.pending || room.winner != null || currentPlayerId(room) !== id) return
  const y = room.yut || {}
  if (y.stage !== 'move') return
  const results = arr(y.results)
  const v = results[ri]
  if (v == null) return
  const t = currentTeam(room)
  const n = teamCount(room)
  const pieces = roomPieces(room)
  const opt = moveOptions(pieces, t, v).find((o) => o.from === from)
  if (!opt) return
  const me = room.players[id]
  const info = TEAM_INFO[t]
  const next = JSON.parse(JSON.stringify(pieces))
  const moving = from === 'home' ? [pieces[t].findIndex((pc) => pc.n === 'home')] : pieces[t].map((pc, i) => (pc.n === from ? i : -1)).filter((i) => i >= 0)
  const stacked = !opt.finished && pieces[t].some((pc) => pc.n === opt.dest)
  moving.forEach((i) => (next[t][i] = opt.finished ? { n: 'goal' } : { n: opt.dest, p: opt.prev }))
  // 잡기: 도착한 칸에 다른 팀 말이 있으면 전부 집으로
  let caught = null
  if (!opt.finished) {
    for (let o = 0; o < n; o++) {
      if (o === t) continue
      const idx = next[o].map((pc, i) => (pc.n === opt.dest ? i : -1)).filter((i) => i >= 0)
      if (idx.length) {
        idx.forEach((i) => (next[o][i] = { n: 'home' }))
        caught = { team: o, count: idx.length, node: opt.dest }
      }
    }
  }
  const rest = results.filter((_, k) => k !== ri)
  const destName = opt.finished ? '골인 🏁' : nodeName(opt.dest)
  const upd = {
    pieces: next,
    'yut/results': rest,
    lastMove: { id: newId(), team: t, from, path: opt.path, count: moving.length, dest: opt.finished ? 'goal' : opt.dest, caught },
  }
  upd[`log/${newId()}`] = {
    t: Date.now(),
    text: `${info.emoji} ${me.name} ${yutName(v)}${moving.length > 1 ? ` (말 ${moving.length}개)` : ''} → ${destName}${stacked ? ' · 업기' : ''}${caught ? ` · ${TEAM_INFO[caught.team].name} ${caught.count}개 잡기!` : ''}`,
  }
  const after = { ...room, pieces: next, yut: { ...y, results: rest } }
  if (teamDone(next, t)) {
    const losers = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && teamOf(room, pid) !== t)
    addDrinks(room, upd, losers)
    upd.winner = t
    upd['yut/stage'] = 'done'
    upd.pending = { kind: 'win', playerId: id, team: t, pos: 'o0', startedAt: Date.now() }
    upd.event = { id: newId(), text: `🏆 ${info.name} 승리! 나머지 팀 다 마셔! 🍻` }
  } else if (caught) {
    upd['yut/extra'] = (y.extra || 0) + 1
    upd.pending = { kind: 'caught', playerId: id, pos: opt.dest, victim: caught.team, count: caught.count, startedAt: Date.now() }
    upd.event = { id: newId(), text: `🎯 ${me.name} 잡았다! ${TEAM_INFO[caught.team].name} 말 ${caught.count}개 → 집으로` }
  } else if (opt.finished) {
    upd.event = { id: newId(), text: `🏁 ${info.name} 말 ${moving.length}개 골인!` }
    Object.assign(upd, nextTurnUpdates(after))
  } else {
    upd.pending = pendingFor(after, id, opt.dest)
    if (stacked) upd.event = { id: newId(), text: `🤝 ${info.name} 업었다! 말 ${next[t].filter((pc) => pc.n === opt.dest).length}개 함께 이동` }
    if ((roomCells(room)[opt.dest]?.type || 'normal') === 'nop') {
      upd[`players/${id}/nop`] = (me.nop || 0) + 1
      upd.event = { id: newId(), text: `${me.name} 놉카드 1장 획득 🎫` }
    }
    withReleaseUpdates(room, upd.pending, upd, me.name)
    withTopicUpdates(room, upd.pending, upd)
  }
  await roomUpdate(code, upd)
}

// 돌발 미션: 진행 중인 미션이 없을 때 10% 확률로 한 명에게 몰래 전달 (데모: ?mission=초 로 강제)
function maybeMission(room, updates) {
  // 직전 미션이 끝난 뒤 굴린 횟수 (미션이 없을 때만 셈)
  const since = room.mission ? room.rollsSinceMission || 0 : (room.rollsSinceMission || 0) + 1
  updates.rollsSinceMission = since
  if (room.mission) return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  if (ids.length < 2) return
  const forced = DEMO ? parseInt(new URLSearchParams(window.location.search).get('mission'), 10) : NaN
  if (since < MISSION_MIN_GAP) return
  if (!(forced > 0) && Math.random() >= MISSION_CHANCE) return
  updates.rollsSinceMission = 0
  const who = ids[Math.floor(Math.random() * ids.length)]
  const others = ids.filter((pid) => pid !== who)
  const targetName = room.players[others[Math.floor(Math.random() * others.length)]]?.name || ''
  const m = drawMission(targetName)
  const dur = forced > 0 ? forced * 1000 : m.minutes * 60 * 1000
  const nowMs = serverNow()
  updates.mission = { id: newId(), playerId: who, text: m.text, detail: m.detail, minutes: m.minutes, choices: m.choices, answer: m.answer, startedAt: nowMs, endsAt: nowMs + dur, stage: 'active' }
  updates[`log/${newId()}`] = { t: Date.now(), text: `🎯 누군가에게 돌발 미션이 주어졌습니다! (${m.minutes}분)` }
}

// 방장: 미션 시간이 끝나면 퀴즈 단계로
export async function missionTick(code, room) {
  const m = room.mission
  if (!m || m.stage !== 'active' || room.hostId !== myId()) return
  if (serverNow() < m.endsAt) return
  await roomUpdate(code, { 'mission/stage': 'quiz', event: { id: newId(), text: `⏰ ${room.players[m.playerId]?.name}의 미션 수행 시간이 끝났습니다!` } })
}
// 수행자 외 참가자: 5지선다 투표
export async function missionVote(code, room, idx) {
  const m = room.mission
  if (!m || m.stage !== 'quiz') return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && pid !== m.playerId)
  const id = DEMO ? ids.find((pid) => m.votes?.[pid] == null) : myId()
  if (!id || !ids.includes(id)) return
  await roomUpdate(code, { [`mission/votes/${id}`]: idx })
}
// 결과 공개 (수행자 또는 방장)
export async function missionReveal(code, room) {
  const m = room.mission
  if (!m || m.stage !== 'quiz') return
  if (!DEMO && myId() !== m.playerId && myId() !== room.hostId) return
  await roomUpdate(code, { 'mission/stage': 'result', 'mission/revealedAt': Date.now() })
}
// 결과 계산: 투표자 과반이 맞히면 수행자 마시기, 아니면 틀린 사람들 마시기
export function missionResult(room, m) {
  const votes = m.votes || {}
  const voters = Object.keys(votes)
  const correct = voters.filter((pid) => votes[pid] === m.answer)
  const wrong = voters.filter((pid) => votes[pid] !== m.answer)
  const caught = voters.length > 0 && correct.length * 2 >= voters.length
  return { voters, correct, wrong, caught }
}
export async function missionDone(code, room) {
  const m = room.mission
  if (!m || m.stage !== 'result') return
  if (!DEMO && myId() !== m.playerId && myId() !== room.hostId) return
  const r = missionResult(room, m)
  const who = room.players[m.playerId]?.name
  const text = r.caught
    ? `🎯 돌발 미션 "${m.text}" — 들켰다! ${who} 마셔 🍶`
    : `🎯 돌발 미션 "${m.text}" — 못 맞힘! ${r.wrong.map((pid) => room.players[pid]?.name).filter(Boolean).join(', ') || '아무도'} 마셔 🍶`
  await roomUpdate(code, addDrinks(room, { mission: null, rollsSinceMission: 0, event: { id: newId(), text } }, r.caught ? [m.playerId] : r.wrong))
}


// 마신 잔 수 +n (자동 집계용)
function addDrinks(room, upd, ids, n = 1) {
  ;(ids || []).forEach((pid) => {
    if (!room.players?.[pid]) return
    upd[`players/${pid}/drinks`] = (room.players[pid].drinks || 0) + n
  })
  return upd
}

// 다음 팀으로 차례 넘기기 (같은 팀 안에서는 던지는 사람이 돌아감)
function advanceTeamUpdates(room) {
  const n = teamCount(room)
  const t = currentTeam(room)
  const members = teamMembers(room, t)
  const pieces = roomPieces(room)
  const upd = {}
  upd[`memberIdx/${t}`] = members.length ? (((room.memberIdx?.[t] || 0) % members.length) + 1) % members.length : 0
  let nt = t
  for (let k = 1; k <= n; k++) {
    const c = (t + k) % n
    if (teamMembers(room, c).length && !teamDone(pieces, c)) {
      nt = c
      break
    }
  }
  upd.teamTurn = nt
  upd.turnNo = (room.turnNo || 0) + 1
  upd['yut/stage'] = 'throw'
  upd['yut/results'] = null
  upd['yut/extra'] = 0
  return upd
}
// 칸 처리가 끝난 뒤: 남은 윷 결과가 있으면 계속 옮기기 → 보너스 던지기 → 다음 팀
function nextTurnUpdates(room) {
  const y = room.yut || {}
  const results = arr(y.results)
  const t = currentTeam(room)
  const pieces = roomPieces(room)
  const upd = { pending: null }
  if (results.some((v) => moveOptions(pieces, t, v).length)) {
    upd['yut/stage'] = 'move'
    upd['yut/results'] = results
    return upd
  }
  if (results.length) upd[`log/${newId()}`] = { t: Date.now(), text: `${results.map(yutName).join(', ')} — 움직일 말이 없어서 무효` }
  if ((y.extra || 0) > 0) {
    upd['yut/stage'] = 'throw'
    upd['yut/results'] = null
    upd['yut/extra'] = y.extra - 1
    return upd
  }
  return { ...upd, ...advanceTeamUpdates(room) }
}

// 도착 칸 모달의 버튼 처리. action: 'done' | 'nop-use' | 'pick'(travel, target)
export async function resolvePending(code, room, action, target) {
  const p = room.pending
  if (!p) return

  // 밸런스 게임 소수 의견: 각자 놉카드로 본인만 거부 (턴은 행동자가 확인할 때 넘어감)
  if (action === 'target-nop' && p.kind === 'balance' && p.stage === 'result') {
    const r = balanceResult(p)
    const tid = DEMO ? r.losers.find((x) => !p.refused?.[x]) : myId()
    if (!tid || !r.losers.includes(tid) || p.refused?.[tid]) return
    const t = room.players[tid]
    if (!t || (t.nop || 0) <= 0) return
    await roomUpdate(code, {
      [`pending/refused/${tid}`]: true,
      [`players/${tid}/nop`]: t.nop - 1,
      event: { id: newId(), text: `${t.name} 놉카드 사용! 밸런스 벌주 거부 🙅` },
    })
    return
  }

  // AI 지목 / 다수결 지목: 지목된 사람이 놉카드로 거부할 수 있음 (행동 주체가 아니어도)
  if (action === 'target-nop' && (p.kind === 'aiPick' || (p.kind === 'pick' && p.stage === 'result') || (p.kind === 'vote' && p.stage === 'result'))) {
    const targets = p.kind === 'vote' ? voteWinners(p) : [p.target]
    const tid = DEMO ? targets[0] : myId()
    if (!targets.includes(tid)) return
    const t = room.players[tid]
    if (!t || (t.nop || 0) <= 0) return
    await roomUpdate(code, {
      ...nextTurnUpdates(room),
      [`players/${tid}/nop`]: t.nop - 1,
      event: { id: newId(), text: `${t.name} 놉카드 사용! ${p.kind === 'aiPick' ? 'AI 지목' : p.kind === 'pick' ? '지목' : '다수결 지목'} 거부 🙅` },
    })
    return
  }

  // 승리 화면 → 방장이 대기실로 (행동 주체가 아니어도)
  if (p.kind === 'win') {
    if (action === 'done' && (DEMO || room.hostId === myId())) await restartGame(code, room)
    return
  }

  const id = DEMO ? p.playerId : myId()
  if (p.playerId !== id) return
  const me = room.players[id] || {}
  const cell = roomCells(room)[p.pos] || {}

  if (action === 'nop-use') {
    if (p.kind === 'option' || p.kind === 'release') return // 옵션은 놉카드로 거부 불가
    if (p.kind === 'liar' && p.stage !== 'category') return // 라이어 게임은 시작 전에만 거부 가능
    if (p.kind === 'balance' && p.stage !== 'vote') return
    if (p.kind === 'vote' || p.kind === 'choose' || p.kind === 'shuffle' || p.kind === 'gamble' || p.kind === 'caught' || p.kind === 'win' || p.kind === 'again') return
    if ((p.kind === 'bomb' || p.kind === 'reaction') && p.stage !== 'ready') return
    await roomUpdate(code, {
      ...nextTurnUpdates(room),
      [`players/${id}/nop`]: Math.max(0, (me.nop || 0) - 1),
      event: { id: newId(), text: `${me.name} 놉카드 사용! "${cell.text}" 거부 🙅` },
    })
    return
  }

  switch (p.kind) {
    case 'option': {
      await roomUpdate(code, optionStartUpdates(room, cell, p.pos, me, id, { ...nextTurnUpdates(room) }, p.partner))
      return
    }
    case 'steal': {
      // action === 'steal' + target(playerId): 그 사람 놉카드 1장을 내게로
      if (action === 'steal' && target && room.players[target] && (room.players[target].nop || 0) > 0 && target !== id) {
        await roomUpdate(code, {
          ...nextTurnUpdates(room),
          [`players/${target}/nop`]: room.players[target].nop - 1,
          [`players/${id}/nop`]: (me.nop || 0) + 1,
          event: { id: newId(), text: `${me.name}이(가) ${room.players[target].name}의 놉카드 1장을 가져갔어요 🎫` },
        })
        return
      }
      // 가져올 사람이 없을 때 '확인'
      const anyone = Object.entries(room.players || {}).some(([pid, pl]) => pid !== id && (pl.nop || 0) > 0)
      if (!anyone) await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `놉카드 내놔! — 가져올 카드가 없어요 😅` } })
      return
    }
    case 'again': {
      // 한 번 더 던지기: 보너스 던지기 +1
      await roomUpdate(code, {
        ...nextTurnUpdates({ ...room, yut: { ...(room.yut || {}), extra: (room.yut?.extra || 0) + 1 } }),
        event: { id: newId(), text: `🎲 ${me.name} 한 번 더 던져요!` },
      })
      return
    }
    case 'caught': {
      // 잡기: 잡힌 팀 전원이 잡힌 말 수만큼 마심 (보너스 던지기는 이미 +1)
      const victims = teamMembers(room, p.victim)
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `🎯 ${TEAM_INFO[p.victim]?.name} ${victims.map((x) => room.players[x]?.name).join(', ')} ${p.count > 1 ? `${p.count}잔씩 ` : ''}마셔! 🍶` },
      }, victims, p.count || 1))
      return
    }
    case 'choose': {
      // 게임 선택권: 'choose' + target(balance|liar|hunmin) → 그 게임으로 전환
      const titles = { balance: '밸런스 게임', liar: '라이어 게임', hunmin: '훈민정음 게임', bomb: '폭탄 돌리기', reaction: '반응속도 게임' }
      if (action === 'choose' && titles[target]) {
        const np = makePending(room, id, p.pos, target, titles[target])
        await roomUpdate(code, withTopicUpdates(room, np, { pending: np, event: { id: newId(), text: `${me.name} 🎁 ${titles[target]} 선택!` } }))
      }
      return
    }
    case 'vote': {
      // 다수결 지목: 행동자가 결과 공개 → 카운트다운 후 최다 득표자 공개
      if (action === 'result' && Object.keys(p.votes || {}).length > 0) {
        await roomUpdate(code, { 'pending/stage': 'result', 'pending/revealedAt': Date.now() })
        return
      }
      if (action === 'done' && p.stage === 'result') {
        const winners = voteWinners(p)
        await roomUpdate(code, addDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: `🗳️ 다수결 지목 → ${winners.map((w) => room.players[w]?.name).join(', ')} 마셔! 🍶` },
        }, winners))
      }
      return
    }
    case 'shuffle': {
      await roomUpdate(code, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `🥂 의리주 순서: ${(p.order || []).map((pid) => room.players[pid]?.name).filter(Boolean).join(' → ')}` },
      })
      return
    }
    case 'bomb': {
      if (action === 'start' && p.stage === 'ready') {
        // 15~40초 사이 랜덤 폭발 (서버 시각 기준)
        const dur = 15000 + Math.floor(Math.random() * 25000)
        await roomUpdate(code, { 'pending/stage': 'ticking', 'pending/startedAt': serverNow(), 'pending/explodeAt': serverNow() + dur })
        return
      }
      if (action === 'done' && p.stage === 'ticking') {
        await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `💣 폭탄 돌리기(${p.topic}) 터짐! 말하던 사람 마셔 🍶` } })
      }
      return
    }
    case 'reaction': {
      if (action === 'start' && p.stage === 'ready') {
        const wait = 2500 + Math.floor(Math.random() * 3500) // 2.5~6초 뒤 초록불
        await roomUpdate(code, { 'pending/stage': 'armed', 'pending/goAt': serverNow() + wait, 'pending/results': null })
        return
      }
      if (action === 'result' && p.stage === 'armed') {
        await roomUpdate(code, { 'pending/stage': 'result', 'pending/revealedAt': Date.now() })
        return
      }
      if (action === 'done' && p.stage === 'result') {
        const r = reactionRanking(room, p)
        const loser = r[r.length - 1]
        await roomUpdate(code, addDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: loser ? `⚡ 반응속도 꼴찌 ${room.players[loser.pid]?.name} (${loser.label}) 마셔! 🍶` : '⚡ 반응속도 게임 종료' },
        }, loser ? [loser.pid] : []))
      }
      return
    }
    case 'gamble': {
      // ask: 도박 하기(spin) / 패스(skip). 카드가 있으면 +2 vs 전부 소멸, 없으면 안 마셔 vs 마셔
      if (action === 'spin' && p.stage === 'ask') {
        await roomUpdate(code, { 'pending/stage': 'spin', 'pending/roulette': Math.random() < 0.5 ? 'win' : 'lose', 'pending/revealedAt': Date.now(), 'pending/nopAtSpin': me.nop || 0 })
        return
      }
      if (action === 'skip' && p.stage === 'ask') {
        await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `🎰 ${me.name} 도박 패스 😌` } })
        return
      }
      if (action === 'done' && p.stage === 'spin') {
        const nop = me.nop || 0
        const upd = { ...nextTurnUpdates(room) }
        if (nop > 0) {
          if (p.roulette === 'win') {
            upd[`players/${id}/nop`] = nop + 2
            upd.event = { id: newId(), text: `🎰 ${me.name} 도박 성공! 놉카드 +2 🎫` }
          } else {
            upd[`players/${id}/nop`] = 0
            upd.event = { id: newId(), text: `🎰 ${me.name} 도박 실패… 놉카드 ${nop}장 소멸 💀` }
          }
        } else {
          upd.event = { id: newId(), text: p.roulette === 'win' ? `🎰 ${me.name} 도박 성공! 안 마셔도 돼요 😇` : `🎰 ${me.name} 도박 실패… 마셔! 🍶` }
          if (p.roulette !== 'win') addDrinks(room, upd, [id])
        }
        await roomUpdate(code, upd)
      }
      return
    }
    case 'hunmin': {
      await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `${me.name} 훈민정음 (${p.chosung}) 수행 ✅` } })
      return
    }
    case 'liar': {
      // 'category' + target(카테고리 key): 단어 배정 → 확인 단계
      if (action === 'category' && target) {
        const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
        const liar = ids[Math.floor(Math.random() * ids.length)]
        const [majority, minority] = pickLiarWords(target)
        const words = {}
        ids.forEach((pid) => (words[pid] = pid === liar ? minority : majority))
        await roomUpdate(code, {
          pending: { ...p, stage: 'reveal', category: target, liar, words, majority, minority, revealed: null, votes: null },
          event: { id: newId(), text: `🤥 라이어 게임 시작! 각자 키워드를 확인하세요` },
        })
        return
      }
      if (action === 'vote-start') {
        await roomUpdate(code, { 'pending/stage': 'vote', event: { id: newId(), text: `🗳️ 투표 시간! 라이어 같은 사람을 고르세요` } })
        return
      }
      if (action === 'result') {
        await roomUpdate(code, { 'pending/stage': 'result' })
        return
      }
      if (action === 'done' && p.stage === 'result') {
        const r = liarResult(room, p)
        const names = (ids) => ids.map((x) => room.players[x]?.name).filter(Boolean).join(', ') || '없음'
        await roomUpdate(code, addDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: `🤥 라이어 게임 결과: 다른 키워드는 ${room.players[p.liar]?.name} · 맞힘 ${names(r.right)} · ${r.wrong.length ? `틀린 ${names(r.wrong)} 마셔 🍶` : '모두 맞혔어요 😇'}` },
        }, r.wrong))
        return
      }
      return
    }
    case 'pick': {
      // 너! 마셔! (지목): 도착한 사람이 한 명을 고름 → 3·2·1 → 축하 화면
      if (action === 'choose' && target && room.players[target]?.name && p.stage !== 'result') {
        await roomUpdate(code, {
          pending: { ...p, stage: 'result', target, startedAt: Date.now() },
          // 누구를 골랐는지는 카운트다운 뒤 공개 (로그·토스트 스포 방지)
          event: { id: newId(), text: `👉 ${me.name}이(가) 마실 사람을 골랐어요! 3, 2, 1…` },
        })
        return
      }
      if (action === 'done' && p.stage === 'result') {
        const t = room.players[p.target]
        await roomUpdate(code, addDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: `👉 지목 → ${t?.name || '?'} 마셔! 🍶` },
        }, [p.target]))
      }
      return
    }
    case 'aiPick': {
      const t = room.players[p.target]
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `🤖 AI 지목 → ${t?.name || '?'} 마셔! 🍶` },
      }, [p.target]))
      return
    }
    case 'balance': {
      const [ta, tb] = (BALANCE_TOPICS[p.topic] || ' vs ').split(' vs ')
      if (action === 'reroll') return rerollTopic(code, room)
      if (action === 'result' && p.stage === 'vote') {
        const r = balanceResult(p)
        if (r.total === 0) return
        if (r.tie) {
          await roomUpdate(code, { 'pending/stage': 'tie', 'pending/revealedAt': Date.now() })
        } else if (r.unanimous) {
          await roomUpdate(code, { 'pending/stage': 'roulette', 'pending/revealedAt': Date.now(), 'pending/roulette': Math.random() < 0.5 ? 'drink' : 'safe' })
        } else {
          await roomUpdate(code, { 'pending/stage': 'result', 'pending/revealedAt': Date.now() })
        }
        return
      }
      if (action === 'done' && (p.stage === 'result' || p.stage === 'roulette')) {
        const r = balanceResult(p)
        const text =
          p.stage === 'roulette'
            ? `⚖️ ${ta} ${r.a} : ${r.b} ${tb} 만장일치 → 룰렛 ${p.roulette === 'drink' ? '다같이 마셔! 🍻' : '아무도 안 마셔 😇'}`
            : `⚖️ ${ta} ${r.a} : ${r.b} ${tb} → 소수 ${r.losers.map((x) => room.players[x]?.name).filter(Boolean).join(', ')} 마셔! 🍶`
        const upd = { ...nextTurnUpdates(room), event: { id: newId(), text } }
        if (p.stage === 'roulette') {
          if (p.roulette === 'drink') addDrinks(room, upd, Object.keys(room.players || {}))
        } else addDrinks(room, upd, r.losers)
        await roomUpdate(code, upd)
      }
      return
    }
    case 'normal': {
      // drink: self(나) / team(우리 팀) / all(전원) 이면 잔 수 자동 +1
      const who = cell.drink === 'all' ? Object.keys(room.players || {}).filter((x) => room.players[x]?.name) : cell.drink === 'team' ? teamMembers(room, teamOf(room, id)) : cell.drink === 'self' ? [id] : []
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `${me.name} "${String(cell.text).replace(/\n/g, ' ')}" 수행 ✅` },
      }, who))
      return
    }
    default:
      await roomUpdate(code, nextTurnUpdates(room))
  }
}

// 놉카드 언제든 사용 (본인 것만)
// 놉카드 수동 사용: 순서 목록에서 내 배지를 눌러 내 카드를 1장 사용 → 전원 알림 (본인만)
export async function useNopAnytime(code, room, targetId) {
  const id = DEMO ? targetId || myId() : myId()
  const t = room.players?.[id]
  if (!t || (t.nop || 0) <= 0) return
  await roomUpdate(code, {
    [`players/${id}/nop`]: t.nop - 1,
    event: { id: newId(), text: `🎫 ${t.name}님이 놉카드를 사용했습니다!` },
  })
}

// 방장: 칸 텍스트 편집 (locked 칸 제외)
export async function saveCellText(code, room, node, text) {
  if (room.hostId !== myId() || room.status !== 'lobby') return
  const base = DEFAULT_YUT_CELLS[node]
  if (!base || base.locked) return
  const t = text.trim()
  await dbSet(`${ROOMS}/${code}/cells/${node}`, t && t !== base.text ? t : null)
}

// 방장: 자리 비운 사람 등 때문에 막혔을 때 차례 강제 넘기기 (대기 중인 칸·남은 윷도 정리)
export async function hostSkipTurn(code, room) {
  if (room.hostId !== myId() || room.status !== 'playing' || room.winner != null) return
  const cur = room.players?.[currentPlayerId(room)]
  await roomUpdate(code, {
    pending: null,
    ...advanceTeamUpdates(room),
    event: { id: newId(), text: `방장이 ${TEAM_INFO[currentTeam(room)]?.name} ${cur?.name || ''} 차례를 넘겼어요 ⏭` },
  })
}

export async function restartGame(code, room) {
  if (room.hostId !== myId() && !DEMO) return
  // 오늘의 결과 (마신 잔 수 랭킹 + 이긴 팀) — 대기실 상단에 표시
  const rows = Object.entries(room.players || {})
    .filter(([, p]) => p?.name)
    .map(([pid, p]) => ({ pid, name: p.name, color: p.color, drinks: p.drinks || 0, team: teamOf(room, pid) }))
    .sort((a, b) => b.drinks - a.drinks)
  const updates = {
    status: 'lobby',
    pending: null,
    lastMove: null,
    lastThrow: null,
    pieces: null,
    yut: null,
    teamTurn: 0,
    memberIdx: null,
    winner: null,
    options: null,
    log: null,
    mission: null,
    summary: { id: newId(), at: Date.now(), startedAt: room.startedAt || null, rows, ...(room.winner != null ? { winner: room.winner } : {}) },
  }
  Object.keys(room.players || {}).forEach((pid) => (updates[`players/${pid}/nop`] = 0))
  await roomUpdate(code, updates)
}

// ---------- 라이어 게임: 모든 참가자가 쓰는 동작 ----------
// 내 키워드를 확인했다고 표시
export async function liarReveal(code, room) {
  const p = room.pending
  const id = DEMO ? null : myId()
  if (!p || p.kind !== 'liar' || p.stage !== 'reveal') return
  if (DEMO) {
    // 데모: 모든 참가자를 확인 처리
    const upd = {}
    Object.keys(p.words || {}).forEach((pid) => (upd[`pending/revealed/${pid}`] = true))
    return roomUpdate(code, upd)
  }
  if (!p.words?.[id]) return
  await roomUpdate(code, { [`pending/revealed/${id}`]: true })
}
// 투표 (본인 표만)
export async function liarVote(code, room, target) {
  const p = room.pending
  if (!p || p.kind !== 'liar' || p.stage !== 'vote' || !target) return
  const id = DEMO ? Object.keys(p.words || {}).find((pid) => !p.votes?.[pid]) : myId()
  if (!id || !p.words?.[id]) return
  await roomUpdate(code, { [`pending/votes/${id}`]: target })
}
// 결과 계산: 최다 득표(단독)가 라이어면 시민 승리
export function liarResult(room, p) {
  const tally = {}
  Object.values(p.votes || {}).forEach((t) => (tally[t] = (tally[t] || 0) + 1))
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1])
  const top = sorted[0]
  const unique = top && (!sorted[1] || sorted[1][1] < top[1])
  const caught = !!(unique && top[0] === p.liar)
  // 라이어를 찍은 사람은 안 마시고, 못 찍은 사람(라이어 본인 포함)은 마심
  const voters = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && p.words?.[pid])
  const right = voters.filter((pid) => p.votes?.[pid] === p.liar)
  const wrong = voters.filter((pid) => p.votes?.[pid] !== p.liar)
  return { tally, top: top?.[0] || null, tie: !!(top && !unique), caught, right, wrong }
}

// ---------- 다수결 지목 ----------
export async function castVote(code, room, target) {
  const p = room.pending
  if (!p || p.kind !== 'vote' || p.stage !== 'vote' || !target) return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  const id = DEMO ? ids.find((pid) => !p.votes?.[pid]) : myId()
  if (!id || !ids.includes(id)) return
  await roomUpdate(code, { [`pending/votes/${id}`]: target })
}
// 최다 득표자(들)
export function voteWinners(p) {
  const tally = {}
  Object.values(p.votes || {}).forEach((t) => (tally[t] = (tally[t] || 0) + 1))
  const max = Math.max(0, ...Object.values(tally))
  return Object.keys(tally).filter((k) => tally[k] === max)
}
export function voteTally(p) {
  const tally = {}
  Object.values(p.votes || {}).forEach((t) => (tally[t] = (tally[t] || 0) + 1))
  return tally
}

// ---------- 밸런스 게임 투표 ----------
export async function balanceVote(code, room, choice) {
  const p = room.pending
  if (!p || p.kind !== 'balance' || p.stage !== 'vote' || !['A', 'B'].includes(choice)) return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  const id = DEMO ? ids.find((pid) => !p.votes?.[pid]) || ids[0] : myId()
  if (!id || !ids.includes(id)) return
  await roomUpdate(code, { [`pending/votes/${id}`]: choice })
}
// 결과: a/b 표 수, 동점, 만장일치, 소수 의견(마시는 사람들)
export function balanceResult(p) {
  const votes = p.votes || {}
  const A = Object.keys(votes).filter((k) => votes[k] === 'A')
  const B = Object.keys(votes).filter((k) => votes[k] === 'B')
  const total = A.length + B.length
  const tie = total > 0 && A.length === B.length
  const unanimous = total > 0 && (A.length === 0 || B.length === 0)
  const losers = tie || unanimous ? [] : A.length < B.length ? A : B
  const loserSide = losers.length ? (A.length < B.length ? 'A' : 'B') : null
  return { a: A.length, b: B.length, A, B, total, tie, unanimous, losers, loserSide }
}

// ---------- 반응속도 게임 ----------
// 내 탭 기록: goAt 이전이면 부정출발('early'), 아니면 반응 시간(ms)
export async function reactionTap(code, room) {
  const p = room.pending
  if (!p || p.kind !== 'reaction' || p.stage !== 'armed' || !p.goAt) return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  const id = DEMO ? ids.find((pid) => p.results?.[pid] == null) : myId()
  if (!id || !ids.includes(id) || p.results?.[id] != null) return
  const t = serverNow()
  const val = t < p.goAt ? -1 : t - p.goAt
  await roomUpdate(code, { [`pending/results/${id}`]: DEMO ? (val < 0 ? -1 : val + Math.floor(Math.random() * 300)) : val })
}
// 순위: 반응 빠른 순. 부정출발(-1)과 미참여는 맨 뒤
export function reactionRanking(room, p) {
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  const rows = ids.map((pid) => {
    const v = p.results?.[pid]
    if (v == null) return { pid, v: Infinity, label: '미참여' }
    if (v < 0) return { pid, v: 1e9, label: '부정출발' }
    return { pid, v, label: `${(v / 1000).toFixed(3)}초` }
  })
  return rows.sort((a, b) => a.v - b.v)
}

// 놉카드 양도: 내 카드 1장을 다른 사람에게 (본인만)
export async function giveNop(code, room, toId, fromId) {
  const id = DEMO ? fromId || myId() : myId()
  const from = room.players?.[id]
  const to = room.players?.[toId]
  if (!from || !to || toId === id || (from.nop || 0) <= 0) return
  await roomUpdate(code, {
    [`players/${id}/nop`]: from.nop - 1,
    [`players/${toId}/nop`]: (to.nop || 0) + 1,
    event: { id: newId(), text: `🎫 ${from.name}님이 ${to.name}님에게 놉카드 1장을 양도했습니다!` },
  })
}
// 돌발 미션 알림 확인 (전원)
export async function missionAck(code, room) {
  const m = room.mission
  if (!m || m.stage !== 'active') return
  const id = DEMO ? Object.keys(room.players || {}).find((pid) => room.players[pid]?.name && !m.acks?.[pid]) : myId()
  if (!id || !room.players?.[id]) return
  await roomUpdate(code, { [`mission/acks/${id}`]: true })
}

// ---------- 홈 화면 방 목록 ----------
export function subscribeRoomList(cb) {
  return dbOnRooms((all) => {
    const nowMs = Date.now()
    const list = Object.entries(all || {})
      .filter(([, r]) => r && typeof r === 'object' && !shouldPurge(r, nowMs))
      .map(([code, r]) => {
        const players = Object.values(r.players || {}).filter((p) => p && p.name)
        return {
          code,
          hostName: r.hostName || r.players?.[r.hostId]?.name || '',
          count: players.length,
          online: players.filter((p) => p.online !== false).length,
          locked: !!r.pw,
          status: r.status,
          createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
          members: Object.keys(r.players || {}),
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
    cb(list)
  })
}
