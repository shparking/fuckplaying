// Firebase Realtime Database 방 로직 (주루윷놀이)
// yutRooms/{CODE} = {
//   hostId, hostName, pw?, createdAt, lastActive, status: 'lobby' | 'playing',
//   teamCount: 2~4, players/{pid}: { name, color, team, drinks, online },
//   teamNop/{team}: 놉카드 수 (팀 단위로 모으고 씀), teamShield/{team}: 방패 수 (잡힐 때 쓸지 고름), sojuBank: 소주 보관소에 모인 잔 수,
//   order: [pid...] (팀 안에서 던지는 순서), teamTurn, memberIdx/{team}, turnNo, throwNo,
//   pieceCount: 2~4 (팀당 말 수, 방장이 대기실에서 고름), missionOff: true 면 돌발 미션 안 나옴 (방장이 대기실에서 끔), pieces/{team}: [{ n: 'home'|'goal'|노드, p?: 직전 노드 } x pieceCount],
//   yut: { stage: 'throw'|'move'|'done', results: [값...], extra: 보너스 던지기 수 },
//   lastThrow: { id, playerId, value, sticks }, lastMove: { id, team, from, path, count, dest, caught },
//   pending: { kind, playerId, pos(노드) } | null, winner, event, log, options/{칸_팀}: 상대 팀에 건 옵션 타이머, mission, cells/{노드}: 텍스트
// }
import { dbGet, dbSet, dbUpdate, dbRemove, dbOn, dbOnConnected, dbPresence, now, DEMO, SOLO, PRACTICE, demoSeed, dbPurgeOldRooms, dbWatchServerOffset, serverNow, dbOnRooms, shouldPurge, ROOMS } from './db'
import './firebase'
import { DEFAULT_YUT_CELLS, TEAM_INFO, throwSticks, sticksFor, yutName, isBonus, moveOptions, movePiece, BRANCH_NODES, teamDone, freshPieces, normPieces, nodeName, routeLabel, pieceCountOf, backPath, prevNode } from './game/yut'
import { pickNhaengWord } from './game/words'
import { pickSubwayLine } from './game/subway'
import { fakeCircle } from './game/circle'
import { PRICE_ITEMS, pricePoints, pickPriceRounds } from './game/prices'
import { PLACES, mapPoints, pickMapRounds } from './game/places'
import { toXY, toLatLon, distKm, MAP_W, MAP_H } from './game/mapdata'
import { WORLD_PLACES, worldPoints, pickWorldRounds } from './game/worldplaces'
import { WORLD_W, WORLD_H, WORLD_LAT, toWorldXY, worldToLatLon } from './game/worldgeo'
import { pickSongWord } from './game/songwords'
import { BALANCE_TOPICS } from './game/balance'
import { pickLiarWords } from './game/liar'
import { pickBombTopic } from './game/bomb'
import { SYNC_QUESTIONS, makeColorRounds } from './game/teamgames'
import { drawMission, MISSION_CHANCE, MISSION_MIN_GAP } from './game/missions'
import { autoEmoji } from './game/emoji'

export const COLORS = ['#ff5a36', '#3d7bfa', '#14b06a', '#e89a00', '#8b5cf6', '#ec4899', '#0ea5e9', '#65a30d', '#14b8a6', '#d946ef']

// ---------- 내 아이디 (기기별 고정) ----------
// 아바타 글자: 이름 첫 글자 (연습봇1 → '1')
export function ini(name) {
  const n = String(name || '')
  const bot = n.match(/^연습봇\s*(\d+)$/)
  if (bot) return bot[1]
  return Array.from(n)[0] || ''
}
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
    players: { [id]: { name, color: COLORS[0], team: 0, joinedAt: now() } },
  })
  if (DEMO) {
    // 혼자 연습: 가짜 참가자는 연습봇1(우리 팀)·연습봇2·연습봇3(상대 팀). 테스트용 데모는 사람 이름
    demoSeed(code, PRACTICE ? ['연습봇2', '연습봇1', '연습봇3'] : ['관희', '윤정', '민수'], COLORS)
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
    const upd = { [`players/${id}`]: { name, color, team, drinks: 0, joinedAt: now() } }
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
// 팀 놉카드 (팀 단위로 모으고 씀). 키는 t0·t1… (Firebase 가 숫자 키를 배열로 바꾸지 않게)
export const nopKey = (t) => `t${t}`
export function teamNop(room, t) {
  return Math.max(0, Number(room?.teamNop?.[nopKey(t)]) || 0)
}
// 팀 방패 (방패 칸에서 모음). 우리 말이 잡힐 때 쓸지 고름 → 쓰면 안 잡힘 (고를 때까지 기다림, 시간 제한 없음). 키는 놉카드와 같이 t0·t1…
export function teamShield(room, t) {
  return Math.max(0, Number(room?.teamShield?.[nopKey(t)]) || 0)
}
// 그 팀 사람이 모두 연결이 끊김 → 방장·던진 사람이 대신 고를 수 있음 (게임이 멈추지 않게)
export function teamAllOffline(room, t) {
  const m = teamMembers(room, t)
  return m.length > 0 && m.every((pid) => room.players?.[pid]?.online === false)
}
// 연대책임: 마셔야 하는 사람이 있으면 그 사람 팀 전원이 같이 마심
export function withTeams(room, ids) {
  const teams = new Set((ids || []).filter((pid) => room.players?.[pid]?.name).map((pid) => teamOf(room, pid)))
  return lobbyOrder(room).filter((pid) => teams.has(teamOf(room, pid)))
}
export function teamsOf(room, ids) {
  return [...new Set((ids || []).filter((pid) => room.players?.[pid]?.name).map((pid) => teamOf(room, pid)))].sort((a, b) => a - b)
}
// '🔴 빨강팀' / '🔴 빨강팀·🔵 파랑팀'
export function teamLabel(teams) {
  return teams.map((t) => `${TEAM_INFO[t]?.emoji || ''} ${TEAM_INFO[t]?.name || ''}`.trim()).join('·')
}
export function roomPieces(room) {
  return normPieces(room?.pieces, teamCount(room), pieceCountOf(room))
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
// 방장: 팀당 말 개수 (대기실, 2~4개)
export async function setPieceCount(code, room, n) {
  if (room.hostId !== myId() || room.status !== 'lobby') return
  await roomUpdate(code, { pieceCount: Math.min(4, Math.max(2, n)) })
}
// 방장: 돌발 미션 켜기·끄기 (대기실, 게임 시작 전에)
export async function setMissionOff(code, room, off) {
  if (room.hostId !== myId() || room.status !== 'lobby') return
  await roomUpdate(code, { missionOff: !!off })
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
  const pieces = freshPieces(n, pieceCountOf(room))
  // 데모: &place=0:o4,1:o9 처럼 팀별 말을 미리 판 위에 둠 (테스트용)
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
    sojuBank: 0,
    teamNop: null,
    teamShield: null,
    event: { id: newId(), text: `${teamText} — ${TEAM_INFO[first].name} 먼저!` },
  }
  // 데모: &nop=2 처럼 빨강팀 놉카드 수 지정 (테스트용)
  const demoNop = DEMO ? parseInt(new URLSearchParams(window.location.search).get('nop'), 10) : NaN
  if (demoNop >= 0) upd.teamNop = { t0: demoNop }
  // 데모: &offline=b,d 처럼 그 참가자(탭의 pid 또는 참가자 id)를 연결 끊김으로 표시 (테스트용)
  const demoOff = DEMO ? new URLSearchParams(window.location.search).get('offline') : null
  if (demoOff)
    demoOff
      .split(',')
      .map((x) => (room.players?.[x]?.name ? x : room.players?.[`p_${x}`]?.name ? `p_${x}` : null))
      .filter(Boolean)
      .forEach((x) => (upd[`players/${x}/online`] = false))
  // 데모: &shield=1:2 처럼 팀별 방패 수 지정 (테스트용)
  const demoShield = DEMO ? new URLSearchParams(window.location.search).get('shield') : null
  if (demoShield) {
    upd.teamShield = {}
    demoShield.split(',').filter(Boolean).forEach((x) => {
      const [tt, k] = x.split(':')
      upd.teamShield[nopKey(+tt)] = Math.max(0, +k || 0)
    })
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
  if (kind === 'subway') p.line = pickSubwayLine(room.lastLine) // 지하철 게임: 1~9호선 (직전 호선 빼고)
  if (kind === 'wordSong') p.word = pickSongWord(arr(room.songUsed)) // 단어 노래: 최근에 나온 단어 빼고
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
  // 팀 대결 미니게임: ready → (play | armed | ticking) → (roulette) → 확인
  if (kind === 'teamSync') {
    p.stage = 'ready'
    p.qs = pickSyncQuestions(room)
  }
  if (['tapWar', 'teamReact', 'colorTrap', 'circle', 'priceGuess', 'timeSum', 'mapPin', 'worldPin'].includes(kind)) p.stage = 'ready'
  if (kind === 'teamBomb') {
    p.stage = 'ready'
    p.topic = pickBombTopic()
    p.holder0 = teamOf(room, playerId) // 도착한 사람의 팀부터 말함 (폭탄은 오프라인으로 돌림)
  }
  if (kind === 'gamble') {
    // ask → spin(roulette, revealedAt). 우리 팀 놉카드가 0장이면 선택 없이 바로 룰렛
    const nop = teamNop(room, teamOf(room, playerId))
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
  if (kind === 'toast') p.stage = 'choose' // 상대 팀에서 한 명 골라 같이 짠
  if (kind === 'pickTeam') {
    // 너희 팀 다 같이 마셔: 상대 팀이 하나면 그 팀으로 정해짐, 여럿이면 도착한 사람이 고름
    const others = liveTeams(room).filter((t) => t !== teamOf(room, playerId))
    if (others.length === 1) Object.assign(p, { stage: 'confirm', target: others[0] })
    else p.stage = 'choose'
  }
  if (kind === 'nhaeng') p.word = pickNhaengWord(room.lastWord)
  if (kind === 'back') {
    // N칸 뒤로: 갈 칸을 미리 계산해서 보여 줌
    const cell = roomCells(room)[pos] || {}
    p.steps = cell.steps || 4
    const t = teamOf(room, playerId)
    const piece = roomPieces(room)[t]?.find((pc) => pc.n === pos)
    const path = piece ? backPath(piece, p.steps) : []
    if (path.length) p.to = path[path.length - 1]
  }
  if (kind === 'magnet') {
    // 자석: 앞뒤 2칸 안 상대 말 → 끌려가서 잡기 (고르기), 없으면 운명의 카드
    const cell = roomCells(room)[pos] || {}
    const targets = magnetTargets(room, teamOf(room, playerId), pos, cell.range || MAGNET_RANGE)
    if (targets.length) Object.assign(p, { stage: 'pick', targets })
    else Object.assign(p, { kind: 'fate', fromMagnet: true, card: pickFate() })
  }
  if (kind === 'sojuBank') {
    // 소주 보관소: 모인 술을 도착한 팀이 의리주로 (도착한 사람이 마지막 순서)
    p.count = Math.max(0, Number(room.sojuBank) || 0)
    const mates = teamMembers(room, teamOf(room, playerId)).filter((pid) => pid !== playerId)
    p.order = [...shuffle(mates), playerId]
  }
  if (kind === 'aiPick') {
    // 방에 있는 사람(이름 있는 참가자) 중 아무나 한 명
    const ids = Object.keys(room.players || {}).filter((id) => room.players[id]?.name)
    p.target = ids[Math.floor(Math.random() * ids.length)] || playerId
    p.startedAt = Date.now()
  }
  return p
}

// 옵션 해제 칸에 도착하면 우리 팀에 걸린 옵션 타이머를 모두 풂
function withReleaseUpdates(room, pending, updates) {
  if (pending?.kind === 'release') {
    const t = teamOf(room, pending.playerId)
    const mine = Object.entries(room.options || {}).filter(([, o]) => o && (o.team == null || o.team === t))
    mine.forEach(([k]) => (updates[`options/${k}`] = null))
    const info = TEAM_INFO[t]
    updates.event = {
      id: newId(),
      text: mine.length ? `🔓 ${info.name} 옵션 해제! ${[...new Set(mine.map(([, o]) => o.text))].join(', ')} 끝 ⏹` : `🔓 ${info.name}에 걸린 옵션이 없어요`,
    }
    pending.released = mine.length
  }
  return updates
}
// 옵션 타이머 키: 칸 + 걸린 팀
export const optionKey = (pos, t) => `n_${pos}_t${t}`
const optionLabel = (cell) => oneLineText(cell.text.replace(/\s*\(option\)\s*/i, ''))
const oneLineText = (t) => String(t || '').replace(/\s*\n\s*/g, ' ').trim()
// 옵션이 걸릴 팀: 도착한 사람 팀을 뺀 나머지 팀 전부
export function optionTargets(room, playerId) {
  const mine = teamOf(room, playerId)
  return liveTeams(room).filter((t) => t !== mine)
}

// 옵션 수행 확정 → 상대 팀에 옵션 타이머 시작 (예: 영어금지 5분). 이미 걸려 있으면 시간 추가
function optionStartUpdates(room, cell, pos, me, id, updates) {
  const minutes = cell.minutes || 5
  const nowMs = Date.now()
  const label = optionLabel(cell)
  const targets = optionTargets(room, id)
  const extended = []
  targets.forEach((t) => {
    const key = optionKey(pos, t)
    const cur = room.options?.[key]
    if (cur && cur.endsAt > nowMs) {
      extended.push(t)
      updates[`options/${key}`] = { ...cur, endsAt: cur.endsAt + minutes * 60 * 1000, minutes: (cur.minutes || 0) + minutes }
    } else {
      updates[`options/${key}`] = { text: label, startedAt: nowMs, endsAt: nowMs + minutes * 60 * 1000, minutes, team: t, who: TEAM_INFO[t].name }
    }
  })
  updates.event = {
    id: newId(),
    text: targets.length
      ? `⏱ ${me.name} → ${teamLabel(targets)}에 ${label} ${minutes}분${extended.length ? ' 추가' : ''}! (어기면 마셔 🍶)`
      : `⏱ ${label} — 옵션을 걸 상대 팀이 없어요`,
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

// 밸런스 주제·이구동성 질문이 정해질 때 사용 기록(usedTopics·usedSync) 갱신을 updates에 포함
function withTopicUpdates(room, pending, updates) {
  if (pending?.kind === 'balance' && pending.topic != null) {
    const used = room.usedTopics || []
    updates.usedTopics = used.length >= BALANCE_TOPICS.length - 1 ? [pending.topic] : [...used, pending.topic]
  }
  if (pending?.kind === 'teamSync' && pending.qs) {
    const used = arr(room.usedSync)
    const next = [...used, ...pending.qs]
    updates.usedSync = next.length > SYNC_QUESTIONS.length - SYNC_QN ? [...pending.qs] : next
  }
  return updates
}

// 밸런스 게임: 다른 주제로 교체 (행동 주체만)
export async function rerollTopic(code, room) {
  const p = room.pending
  const id = SOLO ? p?.playerId : myId()
  if (!p || p.kind !== 'balance' || p.playerId !== id) return
  const next = { ...p, topic: pickTopic(room), stage: 'vote', votes: null, round: (p.round || 1) + 1, revealedAt: null, roulette: null, refused: null }
  await roomUpdate(code, withTopicUpdates(room, next, { pending: next }))
}

// 데모: ?yut=4,3,-1 처럼 던질 값을 차례대로 고정 (테스트용)
function demoYut(room) {
  if (!DEMO) return null
  const q = new URLSearchParams(window.location.search).get('yut')
  if (!q) return null
  const list = q.split(',').map((x) => parseInt(x, 10)).filter((x) => [1, 2, 3, 4, 5, -1].includes(x))
  return list.length ? list[(room.throwNo || 0) % list.length] : null
}

// 윷 던지기 (현재 차례인 사람만)
export async function throwYut(code, room) {
  const id = SOLO ? currentPlayerId(room) : myId()
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
    lastThrow: { id: newId(), playerId: id, value, sticks: sticksFor(value) },
  }
  upd[`log/${newId()}`] = { t: Date.now(), text: `${me.name} 🥢 ${yutName(value)}` }
  maybeMission(room, upd)
  // 낙 없음: 도·개·걸·윷·모·빽도 중 하나 (윷·모는 한 번 더)
  results.push(value)
  if (isBonus(value)) {
    upd['yut/stage'] = 'throw'
    upd['yut/results'] = results
  } else Object.assign(upd, nextTurnUpdates({ ...room, yut: { ...y, results } }))
  await roomUpdate(code, upd)
}

// 말 옮기기: ri = 쓸 결과 번호, from = 옮길 말 묶음의 노드 (새 말은 'home'),
// route = 모서리·가운데에 멈춰 있던 말이 고른 길 ('short' 대각선 / 'long' 직진, 갈림길이 아니면 없음)
export async function moveYut(code, room, ri, from, route) {
  const id = SOLO ? currentPlayerId(room) : myId()
  if (room.status !== 'playing' || room.pending || room.winner != null || currentPlayerId(room) !== id) return
  const y = room.yut || {}
  if (y.stage !== 'move') return
  const results = arr(y.results)
  const v = results[ri]
  if (v == null) return
  const t = currentTeam(room)
  const n = teamCount(room)
  const pieces = roomPieces(room)
  const opt = moveOptions(pieces, t, v).find((o) => o.from === from && (o.route || '') === (route || ''))
  if (!opt) return
  const me = room.players[id]
  const info = TEAM_INFO[t]
  const next = JSON.parse(JSON.stringify(pieces))
  const moving = from === 'home' ? [pieces[t].findIndex((pc) => pc.n === 'home')] : pieces[t].map((pc, i) => (pc.n === from ? i : -1)).filter((i) => i >= 0)
  const stacked = !opt.finished && pieces[t].some((pc) => pc.n === opt.dest)
  moving.forEach((i) => (next[t][i] = opt.finished ? { n: 'goal' } : { n: opt.dest, p: opt.prev }))
  // 잡기: 도착한 칸에 다른 팀 말이 있으면 전부 집으로. 그 팀에 방패가 있으면 먼저 쓸지 물어봄 (shieldAsk)
  const victims = opt.finished ? [] : victimsAt(next, n, t, opt.dest)
  const asking = victims.filter((v) => teamShield(room, v.team) > 0)
  let caught = null
  if (victims.length && !asking.length) {
    sendHome(next, victims.map((v) => v.team), opt.dest)
    caught = { team: victims[0].team, count: victims[0].count, node: opt.dest }
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
    text: `${info.emoji} ${me.name} ${yutName(v)}${moving.length > 1 ? ` (말 ${moving.length}개)` : ''}${opt.route ? ` · ${routeLabel(opt)}` : ''} → ${destName}${stacked ? ' · 업기' : ''}${caught ? ` · ${victimText(victims)} 잡기!` : ''}${asking.length ? ` · ${victimText(victims)} 잡기 전 🛡️ 방패?` : ''}`,
  }
  const after = { ...room, pieces: next, yut: { ...y, results: rest } }
  if (teamDone(next, t)) {
    winUpdates(room, upd, id, t)
  } else if (asking.length) {
    upd.pending = shieldAskPending(id, opt.dest, victims, asking, stacked, 'move')
    upd.event = { id: newId(), text: `🛡️ ${me.name} → ${victimText(victims)} 잡기 직전! ${teamLabel(asking.map((x) => x.team))} 방패를 쓸까요?` }
  } else if (caught) {
    caughtUpdates(room, upd, id, opt.dest, victims)
  } else if (opt.finished) {
    upd.event = { id: newId(), text: `🏁 ${info.name} 말 ${moving.length}개 골인!` }
    Object.assign(upd, nextTurnUpdates(after))
  } else arriveUpdates(room, after, upd, id, t, opt.dest, stacked)
  await roomUpdate(code, upd)
}

// ---------- 잡기 · 방패 ----------
// dest 칸에 있는 다른 팀 말 (팀별 개수). 방패로 막은 뒤에는 한 칸에 여러 팀 말이 같이 있을 수 있음
function victimsAt(pieces, n, t, dest) {
  const out = []
  for (let o = 0; o < n; o++) {
    if (o === t) continue
    const count = (pieces[o] || []).filter((pc) => pc.n === dest).length
    if (count) out.push({ team: o, count })
  }
  return out
}
function sendHome(pieces, teams, dest) {
  teams.forEach((o) => (pieces[o] || []).forEach((pc, i) => pc.n === dest && (pieces[o][i] = { n: 'home' })))
}
const victimText = (vs) => vs.map((v) => `${TEAM_INFO[v.team]?.name} 말 ${v.count}개`).join(' · ')
// 잡힐 말의 팀에 방패가 있으면: 말은 일단 같은 칸에 두고, 그 팀이 방패를 쓸지 고름 (asks: t1 → wait | use | skip, 시간 제한 없음)
function shieldAskPending(id, pos, victims, asking, stacked, via) {
  return {
    kind: 'shieldAsk',
    playerId: id,
    pos,
    victims,
    asks: Object.fromEntries(asking.map((v) => [nopKey(v.team), 'wait'])),
    stacked: !!stacked,
    via, // move | back (4칸 뒤로) | magnet (자석) | fate (운명의 카드)
    startedAt: serverNow(),
  }
}
// 칸 효과로 움직여서 잡을 때 이벤트 앞말·이모지 (how = move | back | magnet | fate)
const HOW_TEXT = { back: '뒤로 가서 ', magnet: '🧲 자석에 끌려가서 ', fate: '🎴 운명의 카드로 ' }
const HOW_EMOJI = { back: '⏪', magnet: '🧲', fate: '🎴' }
// 잡기 확정: 잡은 사람은 한 번 더, 잡힌 팀 전원이 잡힌 말 수만큼 마심 (확인할 때 — resolvePending 'caught')
function caughtUpdates(room, upd, id, pos, victims, how = 'move') {
  const me = room.players[id] || {}
  upd['yut/extra'] = (room.yut?.extra || 0) + 1
  upd.pending = { kind: 'caught', playerId: id, pos, victim: victims[0].team, count: victims[0].count, ...(victims.length > 1 ? { victims } : {}), startedAt: Date.now() }
  upd.event = { id: newId(), text: `🎯 ${me.name} ${HOW_TEXT[how] || ''}잡았다! ${victimText(victims)} → 집으로` }
  return upd
}
// 승리: 나머지 팀 전원 마심 → 승리 화면
function winUpdates(room, upd, id, t) {
  const losers = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && teamOf(room, pid) !== t)
  addDrinks(room, upd, losers)
  upd.winner = t
  upd['yut/stage'] = 'done'
  upd.pending = { kind: 'win', playerId: id, team: t, pos: 'o0', startedAt: Date.now() }
  upd.event = { id: newId(), text: `🏆 ${TEAM_INFO[t].name} 승리! 나머지 팀 다 마셔! 🍻` }
  return upd
}
// 칸 효과로 말이 움직일 때 (4칸 뒤로 · 자석 · 운명의 카드): from 칸의 우리 말(업힌 말도)이 mv { path, dest, prev, finished } 대로
// → 골인(다 들어오면 승리) · 잡기(상대 방패면 먼저 물어봄) · 업기 · 도착한 칸 미션
function forcedMoveUpdates(room, id, from, mv, how, label) {
  const t = teamOf(room, id)
  const pieces = roomPieces(room)
  const me = room.players[id] || {}
  const info = TEAM_INFO[t]
  const idx = pieces[t].map((pc, i) => (pc.n === from ? i : -1)).filter((i) => i >= 0)
  const next = JSON.parse(JSON.stringify(pieces))
  const dest = mv.finished ? 'goal' : mv.dest
  const stacked = !mv.finished && pieces[t].some((pc, i) => pc.n === dest && !idx.includes(i))
  idx.forEach((i) => (next[t][i] = mv.finished ? { n: 'goal' } : { n: dest, p: mv.prev || prevNode(dest) || 'home' }))
  const victims = mv.finished ? [] : victimsAt(next, teamCount(room), t, dest)
  const asking = victims.filter((v) => teamShield(room, v.team) > 0)
  let caught = null
  if (victims.length && !asking.length) {
    sendHome(next, victims.map((v) => v.team), dest)
    caught = { team: victims[0].team, count: victims[0].count, node: dest }
  }
  const upd = { pieces: next, lastMove: { id: newId(), team: t, from, path: arr(mv.path), count: idx.length, dest, caught } }
  upd[`log/${newId()}`] = {
    t: Date.now(),
    text: `${info.emoji} ${me.name} ${HOW_EMOJI[how] || ''} ${label}${idx.length > 1 ? ` (말 ${idx.length}개)` : ''} → ${mv.finished ? '골인 🏁' : nodeName(dest)}${stacked ? ' · 업기' : ''}${caught ? ` · ${victimText(victims)} 잡기!` : ''}${asking.length ? ` · ${victimText(victims)} 잡기 전 🛡️ 방패?` : ''}`,
  }
  const after = { ...room, pieces: next }
  if (mv.finished) {
    if (teamDone(next, t)) winUpdates(room, upd, id, t)
    else {
      upd.event = { id: newId(), text: `🏁 ${me.name} ${HOW_EMOJI[how] || ''} ${label} → 말 ${idx.length}개 골인!` }
      Object.assign(upd, nextTurnUpdates(after))
    }
  } else if (asking.length) {
    upd.pending = shieldAskPending(id, dest, victims, asking, stacked, how)
    upd.event = { id: newId(), text: `🛡️ ${me.name} ${HOW_TEXT[how] || ''}${victimText(victims)} 잡기 직전! ${teamLabel(asking.map((x) => x.team))} 방패를 쓸까요?` }
  } else if (caught) {
    caughtUpdates(room, upd, id, dest, victims, how)
  } else {
    upd.event = { id: newId(), text: `${HOW_EMOJI[how] || ''} ${me.name} ${label} → ${nodeName(dest)}` }
    arriveUpdates(room, after, upd, id, t, dest, stacked)
  }
  return upd
}

// ---------- 자석 · 운명의 카드 ----------
export const MAGNET_RANGE = 2
// 자석 칸(pos)의 우리 말에서 앞뒤 range 칸 안에 상대 말이 있는 칸들 (가까운 순, 같으면 앞쪽 먼저)
// { node, dir: 'fwd' | 'back', steps, path, prev, victims: [{ team, count }] }
export function magnetTargets(room, t, pos, range = MAGNET_RANGE) {
  const pieces = roomPieces(room)
  const piece = (pieces[t] || []).find((pc) => pc.n === pos)
  if (!piece) return []
  const n = teamCount(room)
  const out = []
  const add = (node, dir, steps, path, prev) => {
    if (!node || node === 'home' || node === 'goal' || node === pos || out.some((o) => o.node === node)) return
    const victims = victimsAt(pieces, n, t, node)
    if (victims.length) out.push({ node, dir, steps, path, prev: prev || 'home', victims })
  }
  const routes = BRANCH_NODES.has(pos) ? ['short', 'long'] : [undefined]
  for (let k = 1; k <= range; k++) {
    routes.forEach((route) => {
      const r = movePiece(piece, k, route)
      if (r && !r.finished) add(r.dest, 'fwd', k, r.path, r.prev)
    })
  }
  const bp = backPath(piece, range)
  bp.forEach((node, i) => add(node, 'back', i + 1, bp.slice(0, i + 1), prevNode(node) || 'home'))
  return out.sort((a, b) => a.steps - b.steps || (a.dir === 'fwd' ? -1 : 1))
}
// 운명의 카드 (자석에 아무것도 안 붙었을 때): 넷 중 하나 같은 확률
export const FATE_CARDS = {
  fwd3: { emoji: '⏩', text: '3칸 앞으로', steps: 3 },
  back2: { emoji: '⏪', text: '2칸 뒤로', steps: 2 },
  nop: { emoji: '🎫', text: '놉카드 +1' },
  all: { emoji: '🍻', text: '다 같이 마셔!' },
}
function pickFate() {
  const forced = DEMO ? new URLSearchParams(window.location.search).get('fate') : null // 데모: &fate=fwd3 (테스트용)
  if (forced && FATE_CARDS[forced]) return forced
  const keys = Object.keys(FATE_CARDS)
  return keys[Math.floor(Math.random() * keys.length)]
}
// 방패 쓸지 고르기: 잡힐 팀 사람 누구나 (혼자 모드는 한 화면에서). use = true 쓰기 / false 안 쓰고 잡히기
// 고를 때까지 기다림 (시간 제한 없음). 그 팀이 모두 연결이 끊겼으면 방장·던진 사람이 대신 고를 수 있음
export function canShieldFor(room, team) {
  const id = myId()
  if (SOLO) return true
  if (!room.players?.[id]?.name) return false
  if (teamOf(room, id) === Number(team)) return true
  return teamAllOffline(room, Number(team)) && (id === room.hostId || id === room.pending?.playerId)
}
export async function shieldDecide(code, room, team, use) {
  const p = room.pending
  if (!p || p.kind !== 'shieldAsk') return
  const asks = { ...(p.asks || {}) }
  const k = nopKey(Number(team))
  if (asks[k] !== 'wait' || !canShieldFor(room, team)) return
  asks[k] = use ? 'use' : 'skip'
  if (Object.values(asks).some((v) => v === 'wait')) {
    await roomUpdate(code, { 'pending/asks': asks }) // 아직 고르는 팀이 있음
    return
  }
  await roomUpdate(code, shieldFinalUpdates(room, p, asks))
}
// 다 골랐으면: 방패 쓴 팀은 안 잡힘(같은 칸에 같이 있음), 안 쓴 팀은 잡힘. 아무도 안 잡히면 잡은 사람도 한 번 더 없이 도착한 칸 미션
function shieldFinalUpdates(room, p, asks) {
  const id = p.playerId
  const t = teamOf(room, id)
  const next = JSON.parse(JSON.stringify(roomPieces(room)))
  const used = Object.keys(asks).filter((k) => asks[k] === 'use').map((k) => Number(k.slice(1)))
  const skipped = Object.keys(asks).filter((k) => asks[k] === 'skip').map((k) => Number(k.slice(1)))
  const victims = victimsAt(next, teamCount(room), t, p.pos)
  const caughtV = victims.filter((v) => !used.includes(v.team))
  const upd = {}
  used.forEach((o) => (upd[`teamShield/${nopKey(o)}`] = Math.max(0, teamShield(room, o) - 1)))
  const usedText = used.length ? `🛡️ ${teamLabel(used)} 방패! 안 잡혀요` : ''
  const skipText = skipped.length ? `${teamLabel(skipped)} 방패 안 씀` : ''
  if (skipText) upd[`log/${newId()}`] = { t: Date.now(), text: `🛡️ ${skipText}` } // 쓴 쪽은 이벤트에 나옴
  if (caughtV.length) {
    sendHome(next, caughtV.map((v) => v.team), p.pos)
    upd.pieces = next
    caughtUpdates(room, upd, id, p.pos, caughtV, p.via)
    if (usedText) upd.event.text = `${usedText} · ${upd.event.text}`
  } else {
    arriveUpdates(room, { ...room, pieces: next }, upd, id, t, p.pos, p.stacked)
    upd.event = { id: newId(), text: upd.event ? `${usedText} · ${upd.event.text}` : usedText }
  }
  return upd
}

// 말이 칸에 도착했을 때: 그 칸의 미션(대기 상태) + 놉카드·소주 적립·옵션 해제 같은 바로 적용되는 것
function arriveUpdates(room, after, upd, id, t, dest, stacked) {
  const info = TEAM_INFO[t]
  const me = room.players[id] || {}
  upd.pending = pendingFor(after, id, dest)
  if (stacked) upd.event = { id: newId(), text: `🤝 ${info.name} 업었다! 말 ${after.pieces[t].filter((pc) => pc.n === dest).length}개 함께 이동` }
  const ctype = roomCells(room)[dest]?.type || 'normal'
  if (ctype === 'nop') {
    // 놉카드는 팀 단위로 모음
    const n = teamNop(room, t) + 1
    upd[`teamNop/${nopKey(t)}`] = n
    upd.pending.teamNop = n
    upd.event = { id: newId(), text: `🎫 ${info.name} 놉카드 +1 (지금 ${n}장)` }
  }
  if (ctype === 'shield') {
    // 방패도 팀 단위로 모음
    const n = teamShield(room, t) + 1
    upd[`teamShield/${nopKey(t)}`] = n
    upd.pending.teamShield = n
    upd.event = { id: newId(), text: `🛡️ ${info.name} 방패 +1 (지금 ${n}개)` }
  }
  if (ctype === 'sojuAdd') {
    // 소주 보관소에 한 잔 적립 (가운데 보관소에 도착한 팀이 의리주로 마심)
    const n = Math.max(0, Number(room.sojuBank) || 0) + 1
    upd.sojuBank = n
    upd.pending.bank = n
    upd.event = { id: newId(), text: `🍶 ${me.name} 소주 +1 적립 → 보관소에 ${n}잔` }
  }
  withReleaseUpdates(room, upd.pending, upd)
  withTopicUpdates(room, upd.pending, upd)
  return upd
}

// 'N칸 뒤로' 칸: 도착한 말(업힌 말 포함)이 N칸 뒤로 → 거기서 잡기(방패)·업기, 그 칸의 미션까지
async function backMove(code, room, p) {
  const id = p.playerId
  const t = teamOf(room, id)
  const piece = roomPieces(room)[t].find((pc) => pc.n === p.pos)
  const path = piece ? backPath(piece, p.steps || 4) : []
  if (!path.length) {
    await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: '⏪ 뒤로 갈 칸이 없어요' } })
    return
  }
  const dest = path[path.length - 1]
  await roomUpdate(code, forcedMoveUpdates(room, id, p.pos, { path, dest, prev: prevNode(dest) || 'home', finished: false }, 'back', `${path.length}칸 뒤로`))
}

// 돌발 미션: 진행 중인 미션이 없을 때 10% 확률로 한 명에게 몰래 전달 (데모: ?mission=초 로 강제)
function maybeMission(room, updates) {
  if (room.missionOff) return // 대기실에서 돌발 미션을 끔
  // 직전 미션이 끝난 뒤 굴린 횟수 (미션이 없을 때만 셈)
  const since = room.mission ? room.rollsSinceMission || 0 : (room.rollsSinceMission || 0) + 1
  updates.rollsSinceMission = since
  if (room.mission) return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  if (ids.length < 2) return
  const forced = DEMO ? parseInt(new URLSearchParams(window.location.search).get('mission'), 10) : NaN
  if (forced === 0) return // 데모 테스트: &mission=0 이면 돌발 미션 끔
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
  const id = SOLO ? ids.find((pid) => m.votes?.[pid] == null) : myId()
  if (!id || !ids.includes(id)) return
  await roomUpdate(code, { [`mission/votes/${id}`]: idx })
}
// 결과 공개 (수행자 또는 방장)
export async function missionReveal(code, room) {
  const m = room.mission
  if (!m || m.stage !== 'quiz') return
  if (!SOLO && myId() !== m.playerId && myId() !== room.hostId) return
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
  if (!SOLO && myId() !== m.playerId && myId() !== room.hostId) return
  const r = missionResult(room, m)
  const who = room.players[m.playerId]?.name
  const drinkers = r.caught ? [m.playerId] : r.wrong
  const teams = teamsOf(room, drinkers)
  const text = r.caught
    ? `🎯 돌발 미션 "${m.text}" — 들켰다! ${who}의 ${teamLabel(teams)} 다 같이 마셔 🍶`
    : `🎯 돌발 미션 "${m.text}" — 못 맞힘! ${teams.length ? `${teamLabel(teams)} 다 같이 마셔 🍶` : '아무도 안 마셔요'}`
  await roomUpdate(code, teamDrinks(room, { mission: null, rollsSinceMission: 0, event: { id: newId(), text } }, drinkers))
}


// 마신 잔 수 +n (자동 집계용)
function addDrinks(room, upd, ids, n = 1) {
  ;(ids || []).forEach((pid) => {
    if (!room.players?.[pid]) return
    upd[`players/${pid}/drinks`] = (room.players[pid].drinks || 0) + n
  })
  return upd
}
// 연대책임으로 마시기: 걸린 사람의 팀 전원 잔 수 +n
function teamDrinks(room, upd, ids, n = 1) {
  return addDrinks(room, upd, withTeams(room, ids), n)
}
// '윤정 → 🔴 빨강팀 다 같이 마셔!' 처럼 걸린 사람과 마시는 팀
function drinkText(room, ids) {
  const names = (ids || []).map((x) => room.players[x]?.name).filter(Boolean)
  const teams = teamsOf(room, ids)
  if (!teams.length) return '아무도 안 마셔요'
  return `${names.join(', ')} → ${teamLabel(teams)} 다 같이 마셔! 🍶`
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
    const tid = SOLO ? r.losers.find((x) => !p.refused?.[x]) : myId()
    if (!tid || !r.losers.includes(tid) || p.refused?.[tid]) return
    const t = room.players[tid]
    const tt = teamOf(room, tid)
    if (!t || teamNop(room, tt) <= 0) return
    const upd = { [`teamNop/${nopKey(tt)}`]: teamNop(room, tt) - 1, event: { id: newId(), text: `🎫 ${TEAM_INFO[tt].name} 놉카드 사용! 밸런스 벌주 거부 🙅` } }
    withTeams(room, [tid]).forEach((x) => (upd[`pending/refused/${x}`] = true))
    await roomUpdate(code, upd)
    return
  }

  // AI 지목 / 다수결 지목: 지목된 사람이 놉카드로 거부할 수 있음 (행동 주체가 아니어도)
  if (action === 'target-nop' && (p.kind === 'aiPick' || (p.kind === 'pick' && p.stage === 'result') || (p.kind === 'vote' && p.stage === 'result'))) {
    const targets = p.kind === 'vote' ? voteWinners(p) : [p.target]
    const tid = SOLO ? targets[0] : myId()
    if (!targets.includes(tid)) return
    const t = room.players[tid]
    const tt = teamOf(room, tid)
    if (!t || teamNop(room, tt) <= 0) return
    await roomUpdate(code, {
      ...nextTurnUpdates(room),
      [`teamNop/${nopKey(tt)}`]: teamNop(room, tt) - 1,
      event: { id: newId(), text: `🎫 ${TEAM_INFO[tt].name} 놉카드 사용! ${p.kind === 'aiPick' ? 'AI 지목' : p.kind === 'pick' ? '지목' : '다수결 지목'} 거부 🙅` },
    })
    return
  }

  // 승리 화면 → 방장이 대기실로 (행동 주체가 아니어도)
  if (p.kind === 'win') {
    if (action === 'done' && (SOLO || room.hostId === myId())) await restartGame(code, room)
    return
  }

  if (TEAM_GAMES.has(p.kind)) {
    if (!SOLO && myId() !== p.playerId && myId() !== room.hostId) return
    return resolveTeamGame(code, room, p, action, target)
  }

  const id = SOLO ? p.playerId : myId()
  if (p.playerId !== id) return
  const me = room.players[id] || {}
  const cell = roomCells(room)[p.pos] || {}

  if (action === 'nop-use') {
    if (p.kind === 'option' || p.kind === 'release' || p.kind === 'allOptions') return // 옵션은 놉카드로 거부 불가
    if (p.kind === 'liar' && p.stage !== 'category') return // 라이어 게임은 시작 전에만 거부 가능
    if (p.kind === 'balance' && p.stage !== 'vote') return
    if (p.kind === 'vote' || p.kind === 'choose' || p.kind === 'shuffle' || p.kind === 'gamble' || p.kind === 'caught' || p.kind === 'shieldAsk' || p.kind === 'magnet' || p.kind === 'fate' || p.kind === 'win' || p.kind === 'again') return
    if (TEAM_GAMES.has(p.kind)) return // 팀 대결은 모두 함께 하는 게임이라 한 사람이 거부할 수 없음
    if ((p.kind === 'bomb' || p.kind === 'reaction') && p.stage !== 'ready') return
    const mt = teamOf(room, id)
    if (teamNop(room, mt) <= 0) return
    await roomUpdate(code, {
      ...nextTurnUpdates(room),
      [`teamNop/${nopKey(mt)}`]: teamNop(room, mt) - 1,
      event: { id: newId(), text: `🎫 ${TEAM_INFO[mt].name} 놉카드 사용! "${String(cell.text).replace(/\n/g, ' ')}" 거부 🙅` },
    })
    return
  }

  switch (p.kind) {
    case 'option': {
      await roomUpdate(code, optionStartUpdates(room, cell, p.pos, me, id, { ...nextTurnUpdates(room) }))
      return
    }
    case 'allOptions': {
      // 판에 있는 옵션 칸 전부를 상대 팀에 cell.minutes(3분)씩 (이미 걸려 있으면 시간 추가)
      const cells = roomCells(room)
      const opts = Object.entries(cells).filter(([, c]) => c.type === 'option')
      const upd = { ...nextTurnUpdates(room) }
      opts.forEach(([pos, c]) => optionStartUpdates(room, { ...c, minutes: cell.minutes || 3 }, pos, me, id, upd))
      const targets = optionTargets(room, id)
      upd.event = {
        id: newId(),
        text: targets.length && opts.length
          ? `🚨 ${me.name} → ${teamLabel(targets)}에 모든 옵션 ${cell.minutes || 3}분! (${opts.map(([, c]) => optionLabel(c)).join(' · ')})`
          : '🚨 모든 옵션 — 걸 상대 팀이나 옵션이 없어요',
      }
      await roomUpdate(code, upd)
      return
    }
    case 'steal': {
      // action === 'steal' + target(팀 번호): 그 팀 놉카드 1장을 우리 팀으로
      const mt = teamOf(room, id)
      const tt = Number(target)
      if (action === 'steal' && target != null && Number.isInteger(tt) && tt !== mt && TEAM_INFO[tt] && teamNop(room, tt) > 0) {
        await roomUpdate(code, {
          ...nextTurnUpdates(room),
          [`teamNop/${nopKey(tt)}`]: teamNop(room, tt) - 1,
          [`teamNop/${nopKey(mt)}`]: teamNop(room, mt) + 1,
          event: { id: newId(), text: `😈 ${me.name}: ${TEAM_INFO[tt].name} 놉카드 1장 → ${TEAM_INFO[mt].name} 🎫` },
        })
        return
      }
      // 가져올 카드가 없을 때 '확인'
      const anyone = liveTeams(room).some((x) => x !== mt && teamNop(room, x) > 0)
      if (!anyone) await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `놉카드 내놔! — 다른 팀에 카드가 없어요 😅` } })
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
      // 잡기: 잡힌 팀 전원이 잡힌 말 수만큼 마심 (보너스 던지기는 이미 +1). 여러 팀이 한 번에 잡힐 수도 있음 (방패로 막은 칸)
      const vs = arr(p.victims).length ? arr(p.victims) : [{ team: p.victim, count: p.count || 1 }]
      const upd = { ...nextTurnUpdates(room) }
      vs.forEach((v) => addDrinks(room, upd, teamMembers(room, v.team), v.count || 1))
      upd.event = {
        id: newId(),
        text: `🎯 ${vs.map((v) => `${TEAM_INFO[v.team]?.name} ${teamMembers(room, v.team).map((x) => room.players[x]?.name).join(', ')} ${v.count > 1 ? `${v.count}잔씩 ` : ''}마셔!`).join(' · ')} 🍶`,
      }
      await roomUpdate(code, upd)
      return
    }
    case 'choose': {
      // 게임 선택권: 'choose' + target(balance|liar|hunmin) → 그 게임으로 전환
      const titles = { teamSync: '팀 이구동성', tapWar: '연타 줄다리기', teamReact: '팀 반응속도', teamBomb: '폭탄 돌리기 팀전', colorTrap: '색깔 함정', circle: '완벽한 원', priceGuess: '얼마게요', timeSum: '팀 시간 합치기', mapPin: '지도 찍기', worldPin: '세계 지도 찍기', balance: '밸런스 게임', liar: '라이어 게임', hunmin: '훈민정음 게임', subway: '지하철 게임', wordSong: '단어 노래', bunny: '바니바니 게임', bomb: '폭탄 돌리기', reaction: '반응속도 게임' }
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
        await roomUpdate(code, teamDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: `🗳️ 다수결 지목 → ${drinkText(room, winners)}` },
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
        await roomUpdate(code, teamDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: loser ? `⚡ 반응속도 꼴찌 (${loser.label}) ${drinkText(room, [loser.pid])}` : '⚡ 반응속도 게임 종료' },
        }, loser ? [loser.pid] : []))
      }
      return
    }
    case 'gamble': {
      // ask: 도박 하기(spin) / 패스(skip). 카드가 있으면 +2 vs 전부 소멸, 없으면 안 마셔 vs 마셔
      if (action === 'spin' && p.stage === 'ask') {
        await roomUpdate(code, { 'pending/stage': 'spin', 'pending/roulette': Math.random() < 0.5 ? 'win' : 'lose', 'pending/revealedAt': Date.now(), 'pending/nopAtSpin': teamNop(room, teamOf(room, id)) })
        return
      }
      if (action === 'skip' && p.stage === 'ask') {
        await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `🎰 ${me.name} 도박 패스 😌` } })
        return
      }
      if (action === 'done' && p.stage === 'spin') {
        const mt = teamOf(room, id)
        const tn = TEAM_INFO[mt].name
        const nop = teamNop(room, mt)
        const upd = { ...nextTurnUpdates(room) }
        if (nop > 0) {
          if (p.roulette === 'win') {
            upd[`teamNop/${nopKey(mt)}`] = nop + 2
            upd.event = { id: newId(), text: `🎰 ${me.name} 도박 성공! ${tn} 놉카드 +2 🎫` }
          } else {
            upd[`teamNop/${nopKey(mt)}`] = 0
            upd.event = { id: newId(), text: `🎰 ${me.name} 도박 실패… ${tn} 놉카드 ${nop}장 소멸 💀` }
          }
        } else {
          upd.event = { id: newId(), text: p.roulette === 'win' ? `🎰 ${me.name} 도박 성공! 안 마셔도 돼요 😇` : `🎰 ${me.name} 도박 실패… ${teamLabel([mt])} 다 같이 마셔! 🍶` }
          if (p.roulette !== 'win') teamDrinks(room, upd, [id])
        }
        await roomUpdate(code, upd)
      }
      return
    }
    case 'hunmin': {
      await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `${me.name} 훈민정음 (${p.chosung}) 수행 ✅` } })
      return
    }
    case 'wordSong': {
      // 단어 노래: 단어 바꾸기 / 다 하면 수행 완료 (노래는 오프라인으로, 막힌 사람이 마심)
      if (action === 'reroll') {
        await roomUpdate(code, { 'pending/word': pickSongWord([...arr(room.songUsed), p.word]) })
        return
      }
      if (action !== 'done') return
      await roomUpdate(code, {
        ...nextTurnUpdates(room),
        songUsed: [...arr(room.songUsed), p.word].filter(Boolean).slice(-20),
        event: { id: newId(), text: `🎶 ${me.name} 단어 노래 「${p.word}」 수행 ✅` },
      })
      return
    }
    case 'magnet': {
      // 자석: 고른 상대 말 쪽으로 끌려가서 잡기 (상대 팀 방패면 먼저 물어봄)
      if (action !== 'pull') return
      const tg = arr(p.targets)[Number(target)]
      if (!tg || !tg.node) return
      const dirText = tg.dir === 'fwd' ? `${tg.steps}칸 앞으로` : `${tg.steps}칸 뒤로`
      await roomUpdate(code, forcedMoveUpdates(room, id, p.pos, { path: arr(tg.path), dest: tg.node, prev: tg.prev, finished: false }, 'magnet', `자석 ${dirText}`))
      return
    }
    case 'fate': {
      // 운명의 카드: 3칸 앞으로 · 2칸 뒤로 (움직여서 잡기·업기·그 칸 미션까지) · 놉카드 +1 · 다 같이 마셔
      if (action !== 'done') return
      const mt = teamOf(room, id)
      const card = FATE_CARDS[p.card] ? p.card : 'all'
      const piece = roomPieces(room)[mt].find((pc) => pc.n === p.pos)
      if (card === 'fwd3' && piece) {
        const r = movePiece(piece, FATE_CARDS.fwd3.steps)
        if (r) {
          await roomUpdate(code, forcedMoveUpdates(room, id, p.pos, { path: r.path, dest: r.dest, prev: r.prev, finished: r.finished }, 'fate', `운명의 카드 ${FATE_CARDS.fwd3.steps}칸 앞으로`))
          return
        }
      }
      if (card === 'back2' && piece) {
        const path = backPath(piece, FATE_CARDS.back2.steps)
        if (path.length) {
          const dest = path[path.length - 1]
          await roomUpdate(code, forcedMoveUpdates(room, id, p.pos, { path, dest, prev: prevNode(dest) || 'home', finished: false }, 'fate', `운명의 카드 ${path.length}칸 뒤로`))
          return
        }
      }
      if (card === 'nop') {
        const n = teamNop(room, mt) + 1
        await roomUpdate(code, { ...nextTurnUpdates(room), [`teamNop/${nopKey(mt)}`]: n, event: { id: newId(), text: `🎴 운명의 카드: ${TEAM_INFO[mt].name} 놉카드 +1 (지금 ${n}장)` } })
        return
      }
      if (card === 'all') {
        const all = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
        await roomUpdate(code, addDrinks(room, { ...nextTurnUpdates(room), event: { id: newId(), text: `🎴 운명의 카드: 다 같이 마셔! 🍻` } }, all))
        return
      }
      await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: '🎴 운명의 카드 — 움직일 말이 없어요' } })
      return
    }
    case 'bunny': {
      // 바니바니 게임: 오프라인으로 하고 수행 완료 (걸린 사람이 마심)
      await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: `🐰 ${me.name} 바니바니 게임 수행 ✅` } })
      return
    }
    case 'subway': {
      // 지하철 게임: 역 이름은 오프라인으로 (훈민정음처럼 수행 완료만)
      await roomUpdate(code, { ...nextTurnUpdates(room), lastLine: p.line || null, event: { id: newId(), text: `🚇 ${me.name} 지하철 게임 (${p.line}호선) 수행 ✅` } })
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
        await roomUpdate(code, teamDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: `🤥 라이어 게임 결과: 다른 키워드는 ${room.players[p.liar]?.name} · 맞힘 ${names(r.right)} · ${r.wrong.length ? `틀린 사람 ${drinkText(room, r.wrong)}` : '모두 맞혔어요 😇'}` },
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
        await roomUpdate(code, teamDrinks(room, {
          ...nextTurnUpdates(room),
          event: { id: newId(), text: `👉 지목 → ${drinkText(room, [p.target])}` },
        }, [p.target]))
      }
      return
    }
    case 'pickTeam': {
      // 너희 팀 다 같이 마셔 (상대 팀 전원)
      const mt = teamOf(room, id)
      if (action === 'done' && !liveTeams(room).some((x) => x !== mt)) {
        await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: '👉 마실 상대 팀이 없어요 😅' } })
        return
      }
      const tt = action === 'pickTeam' ? Number(target) : action === 'done' ? Number(p.target) : NaN
      if (!Number.isInteger(tt) || tt === mt || !liveTeams(room).includes(tt)) return
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `👉 ${me.name} → ${TEAM_INFO[tt].name} 다 같이 마셔! 🍻` },
      }, teamMembers(room, tt)))
      return
    }
    case 'toast': {
      // 상대 팀 한 명과 둘이 같이 짠 (둘만 마심)
      const rivals = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name && teamOf(room, pid) !== teamOf(room, id))
      if (action === 'done' && !rivals.length) {
        await roomUpdate(code, { ...nextTurnUpdates(room), event: { id: newId(), text: '🥂 같이 짠 할 상대가 없어요 😅' } })
        return
      }
      if (action !== 'choose' || !target) return
      const tp = room.players[target]
      if (!tp?.name || teamOf(room, target) === teamOf(room, id)) return
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `🥂 ${me.name} ♥ ${tp.name} 같이 짠!` },
      }, [id, target]))
      return
    }
    case 'nhaeng': {
      // 랜덤 n행시: 키워드 바꾸기 / 다 하면 다 같이 마셔
      if (action === 'reroll') {
        await roomUpdate(code, { 'pending/word': pickNhaengWord(p.word) })
        return
      }
      if (action !== 'done') return
      const all = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        lastWord: p.word || null,
        event: { id: newId(), text: `🎤 ${me.name} ${String(p.word || '').length}행시 「${p.word}」 → 다 같이 마셔! 🍻` },
      }, all))
      return
    }
    case 'back': {
      if (action === 'nop-skip') {
        // 팀 놉카드 1장으로 뒤로 가기 거부
        const mt = teamOf(room, id)
        if (teamNop(room, mt) <= 0) return
        await roomUpdate(code, {
          ...nextTurnUpdates(room),
          [`teamNop/${nopKey(mt)}`]: teamNop(room, mt) - 1,
          event: { id: newId(), text: `🎫 ${TEAM_INFO[mt].name} 놉카드 사용! ${p.steps || 4}칸 뒤로 거부 🙅` },
        })
        return
      }
      if (action === 'done') await backMove(code, room, p)
      return
    }
    case 'aiPick': {
      await roomUpdate(code, teamDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `🤖 AI 지목 → ${drinkText(room, [p.target])}` },
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
            : `⚖️ ${ta} ${r.a} : ${r.b} ${tb} → 소수 ${drinkText(room, r.losers.filter((x) => !p.refused?.[x]))}`
        const upd = { ...nextTurnUpdates(room), event: { id: newId(), text } }
        if (p.stage === 'roulette') {
          if (p.roulette === 'drink') addDrinks(room, upd, Object.keys(room.players || {}))
        } else teamDrinks(room, upd, r.losers.filter((x) => !p.refused?.[x]))
        await roomUpdate(code, upd)
      }
      return
    }
    case 'normal': {
      // drink: self·team 이면 연대책임으로 우리 팀 다 같이, all 이면 전원 잔 수 +1
      const all = Object.keys(room.players || {}).filter((x) => room.players[x]?.name)
      // only·except: 이름에 cell.who 가 들어간 사람만 / 빼고 (연대책임 없음)
      const named = cell.who ? all.filter((x) => String(room.players[x].name).includes(cell.who)) : []
      const who =
        cell.drink === 'all'
          ? all
          : cell.drink === 'only'
            ? named
            : cell.drink === 'except'
              ? all.filter((x) => !named.includes(x))
              : cell.drink === 'team' || cell.drink === 'self'
                ? withTeams(room, [id])
                : []
      const tail =
        cell.drink === 'all'
          ? ' · 전원 마셔 🍻'
          : cell.drink === 'only'
            ? named.length
              ? ` · ${named.map((x) => room.players[x].name).join(', ')} 마셔 🍶`
              : ` · ${cell.who}이 없네요 😅`
            : cell.drink === 'except'
              ? ` · ${named.length ? named.map((x) => room.players[x].name).join(', ') : cell.who} 빼고 다 마셔 🍻`
              : who.length
                ? ` · ${teamLabel([teamOf(room, id)])} 다 같이 🍶`
                : ''
      await roomUpdate(code, addDrinks(room, {
        ...nextTurnUpdates(room),
        event: { id: newId(), text: `${me.name} "${String(cell.text).replace(/\n/g, ' ')}" 수행 ✅${tail}` },
      }, who))
      return
    }
    case 'sojuAdd': {
      // 소주 +1 적립 (도착할 때 이미 보관소에 넣음)
      await roomUpdate(code, nextTurnUpdates(room))
      return
    }
    case 'sojuBank': {
      // 소주 보관소: 모인 술을 도착한 팀이 의리주로 (도착한 사람이 마지막). 다 마시면 보관소는 비움
      const n = Math.max(0, Number(p.count) || 0)
      const mt = teamOf(room, id)
      const upd = { ...nextTurnUpdates(room) }
      if (n > 0) {
        upd.sojuBank = 0
        addDrinks(room, upd, teamMembers(room, mt))
        const order = (p.order || []).map((x) => room.players[x]?.name).filter(Boolean).join(' → ')
        upd.event = { id: newId(), text: `🏺 소주 보관소 ${n}잔 → ${teamLabel([mt])} 의리주! (${order})` }
      } else upd.event = { id: newId(), text: `🏺 소주 보관소가 비어 있어요 — ${TEAM_INFO[mt].name} 통과 😇` }
      await roomUpdate(code, upd)
      return
    }
    default:
      await roomUpdate(code, nextTurnUpdates(room))
  }
}

// 놉카드 수동 사용: 팀 카드는 그 팀 사람 누구나 1장씩 쓸 수 있음 → 전원 알림
export async function useNopAnytime(code, room, team) {
  const id = myId()
  const t = SOLO && team != null ? Number(team) : teamOf(room, id)
  if ((!SOLO && !room.players?.[id]?.name) || !TEAM_INFO[t] || teamNop(room, t) <= 0) return
  const who = room.players?.[id]?.name
  await roomUpdate(code, {
    [`teamNop/${nopKey(t)}`]: teamNop(room, t) - 1,
    event: { id: newId(), text: `🎫 ${TEAM_INFO[t].name} 놉카드 사용!${who ? ` (${who})` : ''} 남은 카드 ${teamNop(room, t) - 1}장` },
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
  if (room.hostId !== myId() && !SOLO) return
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
    teamNop: null,
    teamShield: null,
    sojuBank: null,
    summary: { id: newId(), at: Date.now(), startedAt: room.startedAt || null, rows, ...(room.winner != null ? { winner: room.winner } : {}) },
  }
  await roomUpdate(code, updates)
}

// ---------- 라이어 게임: 모든 참가자가 쓰는 동작 ----------
// 내 키워드를 확인했다고 표시
export async function liarReveal(code, room) {
  const p = room.pending
  const id = SOLO ? null : myId()
  if (!p || p.kind !== 'liar' || p.stage !== 'reveal') return
  if (SOLO) {
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
  const id = SOLO ? Object.keys(p.words || {}).find((pid) => !p.votes?.[pid]) : myId()
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
  const id = SOLO ? ids.find((pid) => !p.votes?.[pid]) : myId()
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
  const id = SOLO ? ids.find((pid) => !p.votes?.[pid]) || ids[0] : myId()
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
  const id = SOLO ? ids.find((pid) => p.results?.[pid] == null) : myId()
  if (!id || !ids.includes(id) || p.results?.[id] != null) return
  const t = serverNow()
  const val = t < p.goAt ? -1 : t - p.goAt
  await roomUpdate(code, { [`pending/results/${id}`]: SOLO ? (val < 0 ? -1 : val + Math.floor(Math.random() * 300)) : val })
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

// ---------- 팀 대결 미니게임 ----------
// 모두 자기 폰으로 동시에 참여하고, 진 팀 전원이 마심. 동점이면 룰렛으로 마실 팀을 정함.
// 진행(시작·룰렛·확인)은 도착한 사람 또는 방장. 시간은 모두 서버 시각(serverNow) 기준이라 폰끼리 화면이 맞음
export const TEAM_GAMES = new Set(['teamSync', 'tapWar', 'teamReact', 'teamBomb', 'colorTrap', 'circle', 'priceGuess', 'timeSum', 'mapPin', 'worldPin'])
export const TEAM_LEAD_MS = 3500 // 시작 버튼 → 3·2·1 → 시작
export const SYNC_QN = 4 // 이구동성 질문 수
export const SYNC_ANSWER_MS = 5000 // 질문당 고르는 시간
export const SYNC_REVEAL_MS = 2400 // 질문마다 결과를 보여 주는 시간
export const TAP_MS = 30000 // 연타 시간
export const TAP_SETTLE_MS = 1500 // 연타가 끝나고 마지막 기록이 다 모일 때까지 기다리는 시간
export const REACT_TIMEOUT_MS = 4000 // 초록불 뒤 이 시간 안에 안 누르면 미참여
export const REACT_PENALTY_MS = 1500 // 부정출발·미참여는 1.5초로 계산
export const BOMB_MIN_MS = 20000 // 폭탄: 켜고 20~40초 사이 아무 때나 터짐 (화면에 시간 안 보임)
export const BOMB_MAX_MS = 40000
export const BOMB_SETTLE_MS = 1300 // 펑! 화면을 보여 준 뒤 마실 팀 고르기
// 색깔 함정: 5라운드 × 5초, 빨리 맞힐수록 높은 점수 (1000 → 100), 틀리면 -300, 시간 초과 0
export const CT_ROUNDS = 5
export const CT_ANSWER_MS = 5000
export const CT_GAP_MS = 1600 // 라운드 사이: 정답과 내 점수
export const CT_MAX = 1000
export const CT_MIN = 100
export const CT_WRONG = -300
// 완벽한 원: 15초 안에 손가락으로 원 한 번 (0~100점), 팀 평균이 낮은 팀이 마심
export const CIRCLE_MS = 15000
export const CIRCLE_SETTLE_MS = 1200 // 시간이 끝나고 마지막 기록이 다 모일 때까지
// 얼마게요: 편의점 가격 5문제 × 15초 (숫자 키패드), 정답 공개 3.5초
export const PG_ROUNDS = 5
export const PG_ANSWER_MS = 15000
export const PG_GAP_MS = 3500
// 팀 시간 합치기: 각자 한 번 꾹, 팀 합계가 30초에 가장 가까운 팀 승 (45초 안에)
export const TS_TARGET_MS = 30000
export const TS_LIMIT_MS = 45000
export const TS_SETTLE_MS = 1200
// 지도 찍기: 5문제 × 10초, 정답 공개 3.5초
export const MP_ROUNDS = 5
export const MP_ANSWER_MS = 10000
export const MP_GAP_MS = 3500

export const WP_ROUNDS = 5 // 세계 지도 찍기: 확대·이동할 시간이 있게 15초
export const WP_ANSWER_MS = 15000
export const WP_GAP_MS = 4000

const TEAM_TITLE = { teamSync: '팀 이구동성', tapWar: '연타 줄다리기', teamReact: '팀 반응속도', teamBomb: '폭탄 돌리기 팀전', colorTrap: '색깔 함정', circle: '완벽한 원', priceGuess: '얼마게요', timeSum: '팀 시간 합치기', mapPin: '지도 찍기', worldPin: '세계 지도 찍기' }
const TEAM_EMOJI = { teamSync: '👯', tapWar: '🦦', teamReact: '⚡', teamBomb: '💣', colorTrap: '🎨', circle: '⭕', priceGuess: '💰', timeSum: '🕰️', mapPin: '🗺️', worldPin: '🌍' }

// 이구동성 질문 4개 (최근에 나온 질문은 피함)
export function pickSyncQuestions(room) {
  const used = new Set(arr(room?.usedSync))
  let pool = SYNC_QUESTIONS.map((_, i) => i).filter((i) => !used.has(i))
  if (pool.length < SYNC_QN) pool = SYNC_QUESTIONS.map((_, i) => i)
  return shuffle(pool).slice(0, SYNC_QN)
}
// 팀원이 있는 팀들
export function liveTeams(room) {
  return Array.from({ length: teamCount(room) }, (_, t) => t).filter((t) => teamMembers(room, t).length > 0)
}
// 팀 게임 참여자: 팀원 중 접속 중이거나 이미 참여한 사람 (연결이 끊긴 사람 때문에 지지 않게)
function activeMembers(room, t, did) {
  return teamMembers(room, t).filter((pid) => room.players[pid]?.online !== false || did(pid))
}
// 가장 낮은(또는 높은) 값의 팀들 → 하나면 그 팀이 마시고, 여럿이면 동점 → 룰렛
function losersBy(rows, key, worst = 'min') {
  const vals = rows.map((r) => r[key])
  const target = worst === 'min' ? Math.min(...vals) : Math.max(...vals)
  const losers = rows.filter((r) => Math.abs(r[key] - target) < 1e-6).map((r) => r.team)
  return { losers, tie: losers.length > 1 }
}

// --- 이구동성: 질문마다 팀원 전원이 같은 답이면 성공. 성공 수가 가장 적은 팀이 마심 ---
const SYNC_STEP = SYNC_ANSWER_MS + SYNC_REVEAL_MS
export const syncEndAt = (p) => (p?.startAt || 0) + SYNC_QN * SYNC_STEP
// 지금 단계: count(3·2·1) → q(질문, 남은 시간) → reveal(그 질문 결과) → ... → final
export function syncPhase(p, nowMs) {
  if (!p || p.stage !== 'play' || !p.startAt) return { phase: p?.stage || 'ready' }
  if (nowMs < p.startAt) return { phase: 'count', left: p.startAt - nowMs }
  const k = Math.floor((nowMs - p.startAt) / SYNC_STEP)
  if (k >= SYNC_QN) return { phase: 'final' }
  const t = nowMs - p.startAt - k * SYNC_STEP
  if (t < SYNC_ANSWER_MS) return { phase: 'q', q: k, left: SYNC_ANSWER_MS - t }
  return { phase: 'reveal', q: k }
}
export function syncResult(room, p) {
  const ans = p.answers || {}
  const answered = (pid) => Object.values(ans).some((a) => a && a[pid])
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, answered)
    const perQ = Array.from({ length: SYNC_QN }, (_, i) => {
      const a = ans[`q${i}`] || {}
      const picks = members.map((pid) => a[pid])
      const ok = members.length > 0 && picks.every((x) => x === 'A' || x === 'B') && picks.every((x) => x === picks[0])
      return { ok, a: picks.filter((x) => x === 'A').length, b: picks.filter((x) => x === 'B').length, none: picks.filter((x) => !x).length }
    })
    return { team: t, members, perQ, score: perQ.filter((q) => q.ok).length }
  })
  return { rows, ...losersBy(rows, 'score', 'min') }
}
// 내 답 (질문 시간 안에서만, 바꿀 수 있음)
export async function syncAnswer(code, room, q, choice) {
  const p = room.pending
  if (!p || p.kind !== 'teamSync' || !['A', 'B'].includes(choice)) return
  const ph = syncPhase(p, serverNow())
  if (ph.phase !== 'q' || ph.q !== q) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  const upd = { [`pending/answers/q${q}/${id}`]: choice }
  // 혼자 보는 데모: 다른 사람(가짜 참가자) 답은 무작위로 채움
  if (SOLO)
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid !== id && room.players[pid]?.name && !p.answers?.[`q${q}`]?.[pid]) upd[`pending/answers/q${q}/${pid}`] = Math.random() < 0.6 ? choice : choice === 'A' ? 'B' : 'A'
    })
  await roomUpdate(code, upd)
}

// --- 연타 줄다리기: 30초 동안 연타, 1인당 평균이 가장 적은 팀이 마심 ---
export function tapResult(room, p) {
  const taps = p.taps || {}
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, (pid) => (taps[pid] || 0) > 0)
    const sum = members.reduce((a, pid) => a + (taps[pid] || 0), 0)
    return { team: t, members, sum, avg: members.length ? sum / members.length : 0 }
  })
  return { rows, ...losersBy(rows, 'avg', 'min') }
}
// 내 연타 수 기록 (0.7초마다 + 끝날 때 한 번 더)
export async function tapReport(code, room, count, final = false) {
  const p = room.pending
  if (!p || p.kind !== 'tapWar' || p.stage !== 'play') return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  const n = Math.max(0, Math.floor(count))
  if ((p.taps?.[id] || 0) === n && !final) return
  const upd = { [`pending/taps/${id}`]: n }
  // 혼자 연습: 가짜 참가자도 시간에 맞춰 같이 연타 (1초에 5~8번) → 줄이 실제처럼 움직임
  if (PRACTICE) {
    const sec = Math.max(0, Math.min(TAP_MS, serverNow() - p.startAt)) / 1000
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid !== id && room.players[pid]?.name) upd[`pending/taps/${pid}`] = Math.round(sec * fakeRate(`${pid}:${p.startAt}`)) // 판마다 빠르기가 달라짐
    })
  }
  // 혼자 보는 데모: 가짜 참가자 연타 수를 내 기록 근처로 채움
  else if (SOLO && final)
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid !== id && room.players[pid]?.name) upd[`pending/taps/${pid}`] = Math.round(n * (0.6 + Math.random() * 0.8))
    })
  await roomUpdate(code, upd)
}

// --- 팀 반응속도: 팀원 평균 반응 시간이 가장 느린 팀이 마심 (부정출발·미참여 1.5초) ---
export function teamReactResult(room, p) {
  const res = p.results || {}
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, (pid) => res[pid] != null)
    const times = members.map((pid) => {
      const v = res[pid]
      if (v == null) return { pid, ms: REACT_PENALTY_MS, label: '미참여' }
      if (v < 0) return { pid, ms: REACT_PENALTY_MS, label: '부정출발' }
      return { pid, ms: Math.min(v, REACT_PENALTY_MS), label: `${(v / 1000).toFixed(3)}초` }
    })
    const avg = times.length ? times.reduce((a, x) => a + x.ms, 0) / times.length : REACT_PENALTY_MS
    return { team: t, members, times, avg }
  })
  return { rows, ...losersBy(rows, 'avg', 'max') }
}
// 모두 눌렀거나(접속 중인 사람 기준) 초록불 뒤 시간이 지나면 결과
export function teamReactDone(room, p, nowMs) {
  if (!p || p.stage !== 'armed' || !p.goAt) return false
  if (nowMs >= p.goAt + REACT_TIMEOUT_MS) return true
  const res = p.results || {}
  return liveTeams(room).every((t) => teamMembers(room, t).every((pid) => res[pid] != null || room.players[pid]?.online === false))
}
export async function teamReactTap(code, room) {
  const p = room.pending
  if (!p || p.kind !== 'teamReact' || p.stage !== 'armed' || !p.goAt) return
  const ids = Object.keys(room.players || {}).filter((pid) => room.players[pid]?.name)
  // 혼자 연습: 내가 한 번 탭하면 내 기록 + 가짜 참가자 기록(0.2~0.65초, 가끔 부정출발)
  if (PRACTICE) {
    const me = myId()
    if (p.results?.[me] != null) return
    const t = serverNow()
    if (t >= p.goAt + REACT_TIMEOUT_MS) return
    const upd = { [`pending/results/${me}`]: t < p.goAt ? -1 : t - p.goAt }
    ids.forEach((pid) => {
      if (pid !== me && p.results?.[pid] == null) upd[`pending/results/${pid}`] = Math.random() < 0.08 ? -1 : 200 + Math.floor(Math.random() * 450)
    })
    await roomUpdate(code, upd)
    return
  }
  const id = SOLO ? ids.find((pid) => p.results?.[pid] == null) : myId()
  if (!id || !ids.includes(id) || p.results?.[id] != null) return
  const t = serverNow()
  if (t >= p.goAt + REACT_TIMEOUT_MS) return
  const val = t < p.goAt ? -1 : t - p.goAt
  await roomUpdate(code, { [`pending/results/${id}`]: SOLO && val >= 0 ? val + Math.floor(Math.random() * 300) : val })
}

// --- 폭탄 돌리기 팀전: 오프라인으로 돌리고 화면엔 째깍째깍 폭탄만. 터지면 진행자가 그때 차례였던 팀을 고름 → 그 팀 전원이 마심 ---
export const bombExploded = (p, nowMs) => !!p && p.kind === 'teamBomb' && p.stage === 'ticking' && !!p.explodeAt && nowMs >= p.explodeAt

// --- 색깔 함정: 5라운드 × 5초, 글자 뜻 말고 '글자 색'을 고름. 팀원 점수 합계가 낮은 팀이 마심 (인원이 다르면 1인 평균) ---
const CT_STEP = CT_ANSWER_MS + CT_GAP_MS
export const colorEndAt = (p) => (p?.startAt || 0) + CT_ROUNDS * CT_STEP
// 지금 단계: count(3·2·1) → q(문제, 남은 시간) → gap(정답·내 점수) → ... → final
export function colorPhase(p, nowMs) {
  if (!p || p.stage !== 'play' || !p.startAt) return { phase: p?.stage || 'ready' }
  if (nowMs < p.startAt) return { phase: 'count', left: p.startAt - nowMs }
  const k = Math.floor((nowMs - p.startAt) / CT_STEP)
  if (k >= CT_ROUNDS) return { phase: 'final' }
  const at = p.startAt + k * CT_STEP
  const t = nowMs - at
  if (t < CT_ANSWER_MS) return { phase: 'q', q: k, at, left: CT_ANSWER_MS - t }
  return { phase: 'gap', q: k, at }
}
// 한 라운드 점수: 정답이면 빨리 누를수록 높게 (0초 1000 → 5초 100, 10점 단위), 틀리면 -300, 안 누르면 0
export function colorPoints(ok, ms) {
  if (ok == null) return 0
  if (!ok) return CT_WRONG
  const f = Math.max(0, Math.min(1, 1 - (Number(ms) || 0) / CT_ANSWER_MS))
  return Math.round((CT_MIN + (CT_MAX - CT_MIN) * f) / 10) * 10
}
export function colorAnswerOf(p, q, pid) {
  const a = p?.answers?.[`r${q}`]?.[pid]
  if (!a || typeof a.c !== 'number') return null
  const r = arr(p.rounds)[q]
  return { ...a, ok: !!r && a.c === r.i, pts: colorPoints(!!r && a.c === r.i, a.ms) }
}
export function colorResult(room, p) {
  const ans = p.answers || {}
  const answered = (pid) => Object.values(ans).some((a) => a && a[pid])
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, answered)
    const per = members.map((pid) => {
      const rs = Array.from({ length: CT_ROUNDS }, (_, q) => colorAnswerOf(p, q, pid))
      return { pid, rounds: rs, total: rs.reduce((x, a) => x + (a ? a.pts : 0), 0), ok: rs.filter((a) => a?.ok).length }
    })
    const sum = per.reduce((x, m) => x + m.total, 0)
    return { team: t, members, per, sum, avg: members.length ? sum / members.length : 0 }
  })
  // 팀 인원이 다르면 합계는 인원 많은 팀이 유리 → 1인 평균으로 비교 (인원이 같으면 합계와 똑같은 순서)
  const byAvg = new Set(rows.map((r) => r.members.length)).size > 1
  const mvp = rows.flatMap((r) => r.per).sort((a, b) => b.total - a.total)[0] || null
  return { rows, byAvg, mvp, ...losersBy(rows, byAvg ? 'avg' : 'sum', 'min') }
}
// 내 답 (라운드마다 한 번만, 5초 안에서). 걸린 시간은 서버 시각 기준
export async function colorAnswer(code, room, q, c) {
  const p = room.pending
  if (!p || p.kind !== 'colorTrap' || typeof c !== 'number') return
  const nowMs = serverNow()
  const ph = colorPhase(p, nowMs)
  if (ph.phase !== 'q' || ph.q !== q) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  if (p.answers?.[`r${q}`]?.[id]) return
  const ms = Math.max(0, Math.round(nowMs - ph.at))
  const upd = { [`pending/answers/r${q}/${id}`]: { c, ms } }
  // 혼자 보는 데모: 다른 사람(가짜 참가자) 답을 그럴듯하게 채움 (70% 정답, 0.8~4초)
  if (SOLO) {
    const r = arr(p.rounds)[q]
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid === id || !room.players[pid]?.name || p.answers?.[`r${q}`]?.[pid] || !r) return
      const good = Math.random() < 0.7
      upd[`pending/answers/r${q}/${pid}`] = { c: good ? r.i : r.w, ms: 800 + Math.floor(Math.random() * 3200) }
    })
  }
  await roomUpdate(code, upd)
}

// --- 완벽한 원: 15초 안에 한 번에 원 그리기, 동그란 정도 0~100점. 팀 평균이 낮은 팀이 마심 ---
// 기록: pending/results/{pid} = { s: 점수, pts: [x0,y0,...](0~1000, 64점), c: [cx, cy, r], at: 낸 시각 }
// 지금 단계: count(3·2·1) → draw(그리기) → final(결과)
export function circlePhase(room, p, nowMs) {
  if (!p || p.stage !== 'play' || !p.startAt) return { phase: p?.stage || 'ready' }
  if (nowMs < p.startAt) return { phase: 'count', left: p.startAt - nowMs }
  if (circleDone(room, p, nowMs)) return { phase: 'final' }
  return { phase: 'draw', left: Math.max(0, p.endAt - nowMs) }
}
const circleIn = (p, pid, nowMs) => {
  const r = p?.results?.[pid]
  return !!r && (r.at || 0) <= nowMs
}
// 모두 그렸거나(접속 중인 사람 기준) 시간이 끝나면 결과
export function circleDone(room, p, nowMs) {
  if (!p || p.kind !== 'circle' || p.stage !== 'play' || !p.startAt) return false
  if (nowMs >= p.endAt + CIRCLE_SETTLE_MS) return true
  if (nowMs < p.startAt) return false
  return liveTeams(room).every((t) => teamMembers(room, t).every((pid) => circleIn(p, pid, nowMs) || room.players[pid]?.online === false))
}
export function circleResult(room, p) {
  const res = p.results || {}
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, (pid) => !!res[pid])
    const per = members.map((pid) => ({ pid, s: res[pid] ? Math.max(0, Math.min(100, Number(res[pid].s) || 0)) : 0, none: !res[pid], r: res[pid] || null }))
    const avg = per.length ? Math.round((per.reduce((a, x) => a + x.s, 0) / per.length) * 10) / 10 : 0
    return { team: t, members, per, avg }
  })
  const mvp = rows.flatMap((r) => r.per).filter((x) => !x.none).sort((a, b) => b.s - a.s)[0] || null
  return { rows, mvp, ...losersBy(rows, 'avg', 'min') }
}
// 내 원 내기 (한 번만, 그리는 시간 안에서). 점수는 그린 폰이 계산 (circle.js scoreCircle)
export async function circleSubmit(code, room, res) {
  const p = room.pending
  if (!p || p.kind !== 'circle' || p.stage !== 'play' || !res) return
  const nowMs = serverNow()
  if (nowMs < p.startAt || nowMs > p.endAt + 800) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  if (p.results?.[id]) return
  const int = (v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)))
  const pts = arr(res.pts).slice(0, 160).map(int)
  const c = arr(res.c).slice(0, 3).map(int)
  const s = Math.max(0, Math.min(100, Math.round((Number(res.s) || 0) * 10) / 10))
  await roomUpdate(code, { [`pending/results/${id}`]: { s, pts, c, at: nowMs } })
}
// 혼자 연습·혼자 보는 데모: 가짜 참가자 원 (그리는 시간 중 아무 때나 낸 걸로)
function fakeCircleResults(room, startAt) {
  const me = myId()
  const out = {}
  Object.keys(room.players || {}).forEach((pid) => {
    if (pid === me || !room.players[pid]?.name) return
    const f = fakeCircle()
    out[pid] = { s: f.s, pts: f.pts, c: f.c, at: startAt + 2500 + Math.floor(Math.random() * (CIRCLE_MS - 5000)) }
  })
  return out
}

// --- 문제 여러 개짜리 게임 공통 (얼마게요·지도 찍기): count(3·2·1) → q(문제, 남은 시간) → gap(정답 공개) → … → final ---
export function roundPhase(p, nowMs, n, ansMs, gapMs) {
  if (!p || p.stage !== 'play' || !p.startAt) return { phase: p?.stage || 'ready' }
  if (nowMs < p.startAt) return { phase: 'count', left: p.startAt - nowMs }
  const step = ansMs + gapMs
  const k = Math.floor((nowMs - p.startAt) / step)
  if (k >= n) return { phase: 'final' }
  const at = p.startAt + k * step
  const t = nowMs - at
  if (t < ansMs) return { phase: 'q', q: k, at, left: ansMs - t }
  return { phase: 'gap', q: k, at, left: step - t }
}
// 문제마다 낸 답 { ms } 가 지금 보이는지 (혼자 연습 가짜 참가자는 미리 채워 두고 ms 가 지나야 보임)
const shownAt = (a, at, nowMs) => !!a && (a.ms == null || at + a.ms <= nowMs)
// 팀 결과 공통: 사람별 문제 점수 합 → 팀 합계 (팀 인원이 다르면 1인 평균), MVP, 문제마다 가장 잘한 사람
function roundsResult(room, p, n, answerOf) {
  const ans = p.answers || {}
  const answered = (pid) => Object.values(ans).some((a) => a && a[pid])
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, answered)
    const per = members.map((pid) => {
      const rs = Array.from({ length: n }, (_, q) => answerOf(p, q, pid))
      return { pid, rounds: rs, total: rs.reduce((x, a) => x + (a ? a.pts : 0), 0) }
    })
    const sum = per.reduce((x, m) => x + m.total, 0)
    return { team: t, members, per, sum, avg: members.length ? sum / members.length : 0 }
  })
  const byAvg = new Set(rows.map((r) => r.members.length)).size > 1
  const all = rows.flatMap((r) => r.per)
  const mvp = [...all].sort((a, b) => b.total - a.total)[0] || null
  const best = Array.from({ length: n }, (_, q) => {
    const top = all.filter((m) => m.rounds[q]).sort((a, b) => b.rounds[q].pts - a.rounds[q].pts)[0]
    return top ? { pid: top.pid, ...top.rounds[q] } : null
  })
  return { rows, byAvg, mvp, best, ...losersBy(rows, byAvg ? 'avg' : 'sum', 'min') }
}

// --- 얼마게요: 편의점 가격 맞히기. 가까울수록 점수 (20% 차이 = 500점), 팀 점수 낮은 팀이 마심 ---
// 답: pending/answers/r{문제}/{pid} = { v: 가격, ms: 낸 시각(문제 시작부터) } 한 번만
export const pricePhase = (p, nowMs) => roundPhase(p, nowMs, PG_ROUNDS, PG_ANSWER_MS, PG_GAP_MS)
export const priceEndAt = (p) => (p?.startAt || 0) + PG_ROUNDS * (PG_ANSWER_MS + PG_GAP_MS)
export function priceAnswerOf(p, q, pid) {
  const a = p?.answers?.[`r${q}`]?.[pid]
  if (!a || !(Number(a.v) > 0)) return null
  const item = PRICE_ITEMS[arr(p.rounds)[q]]
  return { v: Number(a.v), ms: a.ms, pts: item?.price ? pricePoints(a.v, item.price) : 0 }
}
export const priceResult = (room, p) => roundsResult(room, p, PG_ROUNDS, priceAnswerOf)
export async function priceAnswer(code, room, q, v) {
  const p = room.pending
  const val = Math.round(Number(v))
  if (!p || p.kind !== 'priceGuess' || !(val > 0) || val > 9999999) return
  const nowMs = serverNow()
  const ph = pricePhase(p, nowMs)
  // 시간 끝나는 순간 입력해 둔 값도 받음 (0.8초 여유)
  const late = ph.phase === 'gap' && ph.q === q && nowMs - ph.at < PG_ANSWER_MS + 800
  if (!((ph.phase === 'q' && ph.q === q) || late)) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  if (p.answers?.[`r${q}`]?.[id]) return
  await roomUpdate(code, { [`pending/answers/r${q}/${id}`]: { v: val, ms: Math.min(PG_ANSWER_MS, Math.max(0, Math.round(nowMs - ph.at))) } })
}
// 가짜 참가자 답 (혼자 연습·혼자 보는 데모): 정답 ± 25% 쯤, 100원 단위
function fakePriceAnswers(room, rounds) {
  const me = myId()
  const out = {}
  rounds.forEach((idx, q) => {
    const price = PRICE_ITEMS[idx]?.price || 1000
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid === me || !room.players[pid]?.name) return
      const f = 1 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.45
      out[`r${q}`] = out[`r${q}`] || {}
      out[`r${q}`][pid] = { v: Math.max(100, Math.round((price * f) / 100) * 100), ms: 3000 + Math.floor(Math.random() * 10000) }
    })
  })
  return out
}

// --- 팀 시간 합치기: 각자 한 번 꾹 눌렀다 뗌 (시간 안 보임). 팀 합계가 30초에서 가장 먼 팀이 마심 ---
// 기록: pending/holds/{pid} = { ms: 누른 시간(폰에서 잼), at: 뗀 시각 }
export function timeSumPhase(room, p, nowMs) {
  if (!p || p.stage !== 'play' || !p.startAt) return { phase: p?.stage || 'ready' }
  if (nowMs < p.startAt) return { phase: 'count', left: p.startAt - nowMs }
  if (timeSumDone(room, p, nowMs)) return { phase: 'final' }
  return { phase: 'play', left: Math.max(0, p.endAt - nowMs) }
}
const holdIn = (p, pid, nowMs) => {
  const h = p?.holds?.[pid]
  return !!h && (h.at || 0) <= nowMs
}
export function timeSumDone(room, p, nowMs) {
  if (!p || p.kind !== 'timeSum' || p.stage !== 'play' || !p.startAt) return false
  if (nowMs >= p.endAt + TS_SETTLE_MS) return true
  if (nowMs < p.startAt) return false
  return liveTeams(room).every((t) => teamMembers(room, t).every((pid) => holdIn(p, pid, nowMs) || room.players[pid]?.online === false))
}
export function timeSumResult(room, p) {
  const hs = p.holds || {}
  const rows = liveTeams(room).map((t) => {
    const members = activeMembers(room, t, (pid) => !!hs[pid])
    const per = members.map((pid) => ({ pid, ms: hs[pid] ? Math.max(0, Math.min(TS_LIMIT_MS, Number(hs[pid].ms) || 0)) : 0, none: !hs[pid] }))
    const sum = per.reduce((a, x) => a + x.ms, 0)
    return { team: t, members, per, sum, diff: Math.abs(sum - TS_TARGET_MS) }
  })
  return { rows, ...losersBy(rows, 'diff', 'max') }
}
export async function holdSubmit(code, room, ms) {
  const p = room.pending
  if (!p || p.kind !== 'timeSum' || p.stage !== 'play') return
  const nowMs = serverNow()
  if (nowMs < p.startAt || nowMs > p.endAt + 1500) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  if (p.holds?.[id]) return
  const v = Math.max(0, Math.min(TS_LIMIT_MS, Math.round(Number(ms) || 0)))
  await roomUpdate(code, { [`pending/holds/${id}`]: { ms: v, at: nowMs } })
}
// 가짜 참가자: 30초 ÷ 팀 인원 ± 30%
function fakeHolds(room, startAt) {
  const me = myId()
  const out = {}
  Object.keys(room.players || {}).forEach((pid) => {
    if (pid === me || !room.players[pid]?.name) return
    const n = Math.max(1, teamMembers(room, teamOf(room, pid)).length)
    const ms = Math.round((TS_TARGET_MS / n) * (0.7 + Math.random() * 0.6))
    out[pid] = { ms, at: Math.min(startAt + TS_LIMIT_MS, startAt + 400 + Math.floor(Math.random() * 1500) + ms) }
  })
  return out
}

// --- 지도 찍기: 한국 지도에 장소 핀 꽂기. 가까울수록 점수 (40km = 500점), 팀 점수 낮은 팀이 마심 ---
// 답: pending/answers/r{문제}/{pid} = { x, y, ms } (지도 그림 좌표, 다시 찍으면 바뀜)
export const mapPhase = (p, nowMs) => roundPhase(p, nowMs, MP_ROUNDS, MP_ANSWER_MS, MP_GAP_MS)
export const mapEndAt = (p) => (p?.startAt || 0) + MP_ROUNDS * (MP_ANSWER_MS + MP_GAP_MS)
export function mapAnswerOf(p, q, pid) {
  const a = p?.answers?.[`r${q}`]?.[pid]
  if (!a || !Number.isFinite(Number(a.x)) || !Number.isFinite(Number(a.y))) return null
  const place = PLACES[arr(p.rounds)[q]]
  if (!place) return null
  const [lat, lon] = toLatLon(Number(a.x), Number(a.y))
  const km = distKm(lat, lon, place.lat, place.lon)
  return { x: Number(a.x), y: Number(a.y), ms: a.ms, km, pts: mapPoints(km) }
}
export const mapResult = (room, p) => roundsResult(room, p, MP_ROUNDS, mapAnswerOf)
export async function mapAnswer(code, room, q, x, y) {
  const p = room.pending
  if (!p || p.kind !== 'mapPin') return
  const nowMs = serverNow()
  const ph = mapPhase(p, nowMs)
  if (ph.phase !== 'q' || ph.q !== q) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  const cx = Math.max(0, Math.min(MAP_W, Math.round(Number(x))))
  const cy = Math.max(0, Math.min(MAP_H, Math.round(Number(y))))
  await roomUpdate(code, { [`pending/answers/r${q}/${id}`]: { x: cx, y: cy, ms: Math.max(0, Math.round(nowMs - ph.at)) } })
}
// 가짜 참가자 핀: 정답에서 5~150km 쯤 (가까운 쪽이 많게)
function fakeMapAnswers(room, rounds) {
  const me = myId()
  const out = {}
  rounds.forEach((idx, q) => {
    const pl = PLACES[idx]
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid === me || !room.players[pid]?.name || !pl) return
      const d = 5 + Math.random() ** 2 * 140
      const th = Math.random() * Math.PI * 2
      const lat = pl.lat + (d * Math.cos(th)) / 111
      const lon = pl.lon + (d * Math.sin(th)) / (111 * Math.cos((pl.lat * Math.PI) / 180))
      const [x, y] = toXY(lat, lon)
      out[`r${q}`] = out[`r${q}`] || {}
      out[`r${q}`][pid] = { x: Math.max(0, Math.min(MAP_W, Math.round(x))), y: Math.max(0, Math.min(MAP_H, Math.round(y))), ms: 2000 + Math.floor(Math.random() * 7000) }
    })
  })
  return out
}

// --- 세계 지도 찍기: 세계 지도에 도시·명소 핀 꽂기 (확대·이동). 가까울수록 점수 (500km = 500점), 팀 점수 낮은 팀이 마심 ---
// 답: pending/answers/r{문제}/{pid} = { x, y, ms } (세계 지도 그림 좌표 0.1 단위, 다시 찍으면 바뀜)
export const worldPhase = (p, nowMs) => roundPhase(p, nowMs, WP_ROUNDS, WP_ANSWER_MS, WP_GAP_MS)
export const worldEndAt = (p) => (p?.startAt || 0) + WP_ROUNDS * (WP_ANSWER_MS + WP_GAP_MS)
export function worldAnswerOf(p, q, pid) {
  const a = p?.answers?.[`r${q}`]?.[pid]
  if (!a || !Number.isFinite(Number(a.x)) || !Number.isFinite(Number(a.y))) return null
  const place = WORLD_PLACES[arr(p.rounds)[q]]
  if (!place) return null
  const [lat, lon] = worldToLatLon(Number(a.x), Number(a.y))
  const km = distKm(lat, lon, place.lat, place.lon)
  return { x: Number(a.x), y: Number(a.y), ms: a.ms, km, pts: worldPoints(km) }
}
export const worldResult = (room, p) => roundsResult(room, p, WP_ROUNDS, worldAnswerOf)
export async function worldAnswer(code, room, q, x, y) {
  const p = room.pending
  if (!p || p.kind !== 'worldPin') return
  const nowMs = serverNow()
  const ph = worldPhase(p, nowMs)
  if (ph.phase !== 'q' || ph.q !== q) return
  const id = myId()
  if (!SOLO && !room.players?.[id]?.name) return
  const r1 = (v) => Math.round(v * 10) / 10
  const cx = Math.max(0, Math.min(WORLD_W, r1(Number(x))))
  const cy = Math.max(0, Math.min(WORLD_H, r1(Number(y))))
  await roomUpdate(code, { [`pending/answers/r${q}/${id}`]: { x: cx, y: cy, ms: Math.max(0, Math.round(nowMs - ph.at)) } })
}
// 가짜 참가자 핀: 쉬운 곳은 정답에서 30~600km, 어려운 곳일수록 멀리 (가까운 쪽이 많게)
function fakeWorldAnswers(room, rounds) {
  const me = myId()
  const out = {}
  rounds.forEach((idx, q) => {
    const pl = WORLD_PLACES[idx]
    Object.keys(room.players || {}).forEach((pid) => {
      if (pid === me || !room.players[pid]?.name || !pl) return
      const d = 30 + Math.random() ** 2 * (pl.lv === 1 ? 570 : pl.lv === 2 ? 1200 : 2400)
      const th = Math.random() * Math.PI * 2
      const lat = Math.max(WORLD_LAT[0], Math.min(WORLD_LAT[1], pl.lat + (d * Math.cos(th)) / 111))
      let lon = pl.lon + (d * Math.sin(th)) / (111 * Math.max(0.2, Math.cos((pl.lat * Math.PI) / 180)))
      lon = ((((lon + 180) % 360) + 360) % 360) - 180
      const [x, y] = toWorldXY(lat, lon)
      out[`r${q}`] = out[`r${q}`] || {}
      out[`r${q}`][pid] = { x: Math.round(Math.max(0, Math.min(WORLD_W, x)) * 10) / 10, y: Math.round(Math.max(0, Math.min(WORLD_H, y)) * 10) / 10, ms: 3000 + Math.floor(Math.random() * 10000) }
    })
  })
  return out
}

// ---------- 혼자 연습 게임 (홈 → 연습 게임, ?practice=) ----------
// 연습 방은 이 기기 메모리에만 있음 (가짜 참가자 3명: 우리 팀 1명 + 상대 팀 2명). 게임 선택권처럼 팀 게임을 골라 바로 시작
export const PRACTICE_GAMES = [
  ['teamSync', '👯', '팀 이구동성', '질문 4개, 우리 팀이 고를 것 같은 답 고르기'],
  ['tapWar', '🦦', '연타 줄다리기', '30초 동안 최대한 빨리 연타'],
  ['teamReact', '⚡', '팀 반응속도', '초록불이 되면 바로 탭'],
  ['teamBomb', '💣', '폭탄 돌리기 팀전', '째깍째깍… 언제 터질지 몰라요'],
  ['colorTrap', '🎨', '색깔 함정', '글자 뜻 말고 글자 색깔 고르기'],
  ['circle', '⭕', '완벽한 원', '손가락으로 원 한 번, 얼마나 동그란지 점수'],
  ['priceGuess', '💰', '얼마게요', '편의점 물건 가격 맞히기'],
  ['timeSum', '🕰️', '팀 시간 합치기', '팀원 누른 시간 합이 30초에 가깝게'],
  ['mapPin', '🗺️', '지도 찍기', '한국 지도에 장소 핀 꽂기'],
  ['worldPin', '🌍', '세계 지도 찍기', '세계 지도에 도시·명소 핀 꽂기'],
]
function fakeRate(pid) {
  let h = 7
  for (const ch of String(pid)) h = (h * 31 + ch.charCodeAt(0)) % 1000
  return 5 + (h / 1000) * 3
}
export async function practiceStart(code, room, kind) {
  if (!PRACTICE || !TEAM_GAMES.has(kind) || !room || room.status !== 'playing') return
  const id = myId()
  const p = makePending(room, id, 'o9', kind, TEAM_TITLE[kind])
  p.practice = true
  await roomUpdate(code, { pending: p, practiceKind: kind })
}
// 연습 끝 (폭탄처럼 마실 팀을 고를 필요가 없을 때): 결과만 남기고 정리
// 연습: 안내 화면에서 다른 게임 고르기 (시작 전 취소)
export async function practiceCancel(code, room) {
  if (!PRACTICE || !room?.pending || room.pending.stage !== 'ready') return
  await roomUpdate(code, { pending: null })
}
export async function practiceEnd(code, text) {
  if (!PRACTICE) return
  await roomUpdate(code, { pending: null, event: { id: newId(), text: text || '연습 끝!' } })
}

// 게임별 결과 → { rows, losers, tie } (아직 안 끝났으면 null)
export function teamGameResult(room, p, nowMs = serverNow()) {
  if (!p) return null
  if (p.kind === 'teamSync') return p.stage === 'play' && nowMs >= syncEndAt(p) - 300 ? syncResult(room, p) : null
  if (p.kind === 'tapWar') return p.stage === 'play' && nowMs >= p.endAt + TAP_SETTLE_MS - 300 ? tapResult(room, p) : null
  if (p.kind === 'teamReact') return teamReactDone(room, p, nowMs) ? teamReactResult(room, p) : null
  if (p.kind === 'colorTrap') return p.stage === 'play' && nowMs >= colorEndAt(p) - 300 ? colorResult(room, p) : null
  if (p.kind === 'circle') return circleDone(room, p, nowMs + 300) ? circleResult(room, p) : null
  if (p.kind === 'priceGuess') return p.stage === 'play' && nowMs >= priceEndAt(p) - 300 ? priceResult(room, p) : null
  if (p.kind === 'mapPin') return p.stage === 'play' && nowMs >= mapEndAt(p) - 300 ? mapResult(room, p) : null
  if (p.kind === 'worldPin') return p.stage === 'play' && nowMs >= worldEndAt(p) - 300 ? worldResult(room, p) : null
  if (p.kind === 'timeSum') return timeSumDone(room, p, nowMs + 300) ? timeSumResult(room, p) : null
  if (p.kind === 'teamBomb') {
    if (!bombExploded(p, nowMs) || p.loser == null || !TEAM_INFO[p.loser]) return null
    return { rows: [], losers: [Number(p.loser)], tie: false }
  }
  return null
}
const teamNames = (ts) => ts.map((t) => TEAM_INFO[t]?.name).join(', ')
function teamScoreText(room, p, r) {
  const e = (t) => TEAM_INFO[t]?.emoji || ''
  if (p.kind === 'teamSync') return r.rows.map((x) => `${e(x.team)}${x.score}`).join(' : ')
  if (p.kind === 'tapWar') return r.rows.map((x) => `${e(x.team)}평균 ${Math.round(x.avg)}회`).join(' : ')
  if (p.kind === 'teamReact') return r.rows.map((x) => `${e(x.team)}${(x.avg / 1000).toFixed(3)}초`).join(' : ')
  if (p.kind === 'colorTrap') return r.rows.map((x) => `${e(x.team)}${r.byAvg ? `평균 ${Math.round(x.avg)}점` : `${x.sum}점`}`).join(' : ')
  if (p.kind === 'circle') return r.rows.map((x) => `${e(x.team)}평균 ${x.avg.toFixed(1)}점`).join(' : ')
  if (p.kind === 'priceGuess' || p.kind === 'mapPin' || p.kind === 'worldPin') return r.rows.map((x) => `${e(x.team)}${r.byAvg ? `평균 ${Math.round(x.avg)}점` : `${x.sum}점`}`).join(' : ')
  if (p.kind === 'timeSum') return r.rows.map((x) => `${e(x.team)}${(x.sum / 1000).toFixed(1)}초`).join(' : ')
  if (p.kind === 'teamBomb') return `주제: ${p.topic}`
  return ''
}

async function resolveTeamGame(code, room, p, action, target) {
  const nowMs = serverNow()
  const title = p.title || TEAM_TITLE[p.kind]
  const emo = TEAM_EMOJI[p.kind]
  if (action === 'start' && p.stage === 'ready') {
    const upd = {}
    if (p.kind === 'teamSync') Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': nowMs + TEAM_LEAD_MS, 'pending/answers': null })
    if (p.kind === 'tapWar') Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': nowMs + TEAM_LEAD_MS, 'pending/endAt': nowMs + TEAM_LEAD_MS + TAP_MS, 'pending/taps': null })
    if (p.kind === 'teamReact') Object.assign(upd, { 'pending/stage': 'armed', 'pending/goAt': nowMs + 2500 + Math.floor(Math.random() * 3500), 'pending/results': null })
    if (p.kind === 'teamBomb') Object.assign(upd, { 'pending/stage': 'ticking', 'pending/startAt': nowMs, 'pending/explodeAt': nowMs + BOMB_MIN_MS + Math.floor(Math.random() * (BOMB_MAX_MS - BOMB_MIN_MS)), 'pending/loser': null })
    if (p.kind === 'colorTrap') Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': nowMs + TEAM_LEAD_MS, 'pending/rounds': makeColorRounds(CT_ROUNDS), 'pending/answers': null })
    if (p.kind === 'circle') {
      const startAt = nowMs + TEAM_LEAD_MS
      Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': startAt, 'pending/endAt': startAt + CIRCLE_MS, 'pending/results': SOLO ? fakeCircleResults(room, startAt) : null })
    }
    if (p.kind === 'priceGuess') {
      const rounds = pickPriceRounds(PG_ROUNDS, arr(room.usedPrices))
      Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': nowMs + TEAM_LEAD_MS, 'pending/rounds': rounds, 'pending/answers': SOLO ? fakePriceAnswers(room, rounds) : null })
      upd.usedPrices = [...arr(room.usedPrices), ...rounds].slice(-20)
    }
    if (p.kind === 'timeSum') {
      const startAt = nowMs + TEAM_LEAD_MS
      Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': startAt, 'pending/endAt': startAt + TS_LIMIT_MS, 'pending/holds': SOLO ? fakeHolds(room, startAt) : null })
    }
    if (p.kind === 'mapPin') {
      const rounds = pickMapRounds(arr(room.usedPlaces))
      Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': nowMs + TEAM_LEAD_MS, 'pending/rounds': rounds, 'pending/answers': SOLO ? fakeMapAnswers(room, rounds) : null })
      upd.usedPlaces = [...arr(room.usedPlaces), ...rounds].slice(-25)
    }
    if (p.kind === 'worldPin') {
      // 데모: &wround=0,13,14,15,36 처럼 문제(장소 번호)를 고정 (테스트용)
      const forced = DEMO ? (new URLSearchParams(window.location.search).get('wround') || '').split(',').filter(Boolean).map(Number).filter((i) => WORLD_PLACES[i]) : []
      const rounds = forced.length === WP_ROUNDS ? forced : pickWorldRounds(arr(room.usedWorld))
      Object.assign(upd, { 'pending/stage': 'play', 'pending/startAt': nowMs + TEAM_LEAD_MS, 'pending/rounds': rounds, 'pending/answers': SOLO ? fakeWorldAnswers(room, rounds) : null })
      upd.usedWorld = [...arr(room.usedWorld), ...rounds].slice(-30)
    }
    upd.event = { id: newId(), text: `${emo} ${title} 시작!` }
    await roomUpdate(code, upd)
    return
  }
  // 폭탄이 터진 뒤: 진행자가 그때 말할 차례였던 팀을 고름 (다시 고르기 = null)
  if (action === 'bombLoser' && p.kind === 'teamBomb') {
    if (!bombExploded(p, nowMs)) return
    const t = target == null ? null : Number(target)
    if (t != null && !liveTeams(room).includes(t)) return
    await roomUpdate(code, { 'pending/loser': t })
    return
  }
  // 동점 → 룰렛 (동점인 팀들 중 한 팀이 마심, 확률은 똑같이)
  if (action === 'roulette' && p.stage !== 'roulette') {
    const r = teamGameResult(room, p, nowMs)
    if (!r || !r.tie) return
    const pick = r.losers[Math.floor(Math.random() * r.losers.length)]
    await roomUpdate(code, {
      'pending/stage': 'roulette',
      'pending/rouletteFrom': r.losers,
      'pending/rouletteTeam': pick,
      'pending/revealedAt': Date.now(),
      'pending/finalText': teamScoreText(room, p, r),
    })
    return
  }
  if (action !== 'done') return
  let loser
  let text
  if (p.stage === 'roulette') {
    loser = p.rouletteTeam
    text = `${emo} ${title} ${p.finalText || ''} 동점 → 룰렛 🎡 ${TEAM_INFO[loser]?.name} 마셔! 🍶`
  } else {
    const r = teamGameResult(room, p, nowMs)
    if (!r || r.tie || !r.losers.length) return
    loser = r.losers[0]
    text =
      p.kind === 'teamBomb'
        ? `${emo} ${title} (${teamScoreText(room, p, r)}) 💥 ${TEAM_INFO[loser]?.name} 차례에 펑! 마셔! 🍶`
        : `${emo} ${title} ${teamScoreText(room, p, r)} → ${teamNames([loser])} 마셔! 🍶`
  }
  if (loser == null || !TEAM_INFO[loser]) return
  await roomUpdate(code, addDrinks(room, { ...nextTurnUpdates(room), event: { id: newId(), text } }, teamMembers(room, loser)))
}

// 돌발 미션 알림 확인 (전원)
export async function missionAck(code, room) {
  const m = room.mission
  if (!m || m.stage !== 'active') return
  const id = SOLO ? Object.keys(room.players || {}).find((pid) => room.players[pid]?.name && !m.acks?.[pid]) : myId()
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
