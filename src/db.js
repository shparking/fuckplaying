// 데이터 저장소 추상화: 기본은 Firebase, `?demo` 로 열면 브라우저 메모리(한 기기 미리보기용)
import { ref, set, get, update, onValue, onDisconnect, remove, serverTimestamp } from 'firebase/database'

// 주루마블과 같은 Firebase 프로젝트를 쓰되 데이터 위치만 분리
export const ROOMS = 'yutRooms'

const QS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
// 혼자 연습 게임(?practice=게임 이름 또는 1): 서버 없이 이 기기 메모리에서, 다른 참가자는 가짜 (실제 방과 상관없음)
export const PRACTICE = QS.get('practice') || ''
export const DEMO = QS.has('demo') || !!PRACTICE
// 여러 탭 데모(&share=1): 같은 브라우저의 탭끼리 메모리 DB 를 BroadcastChannel 로 맞춤 → 폰 여러 대처럼 테스트 (탭마다 ?pid= 로 다른 사람)
export const SHARED = DEMO && QS.has('share')
// 혼자 보는 데모: 한 화면이 모든 참가자 역할을 대신함 (지금 차례인 사람·아직 안 한 사람으로 행동)
export const SOLO = DEMO && !SHARED

// ---------- 메모리 백엔드 ----------
const mem = { data: {}, subs: new Set() }
const parts = (p) => p.split('/').filter(Boolean)
// 데모 테스트용(&fbarr=1): Firebase 처럼 숫자 키 객체는 배열로, 빈 값은 없애서 돌려줌
const FB_SHAPE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fbarr')
function fbShape(v) {
  if (v == null || typeof v !== 'object') return v
  const entries = Object.entries(v)
    .map(([k, x]) => [k, fbShape(x)])
    .filter(([, x]) => x != null)
  if (!entries.length) return null
  const keys = entries.map(([k]) => k)
  if (keys.every((k) => /^\d+$/.test(k))) {
    const max = Math.max(...keys.map(Number))
    if (max < keys.length * 2) {
      const a = Array.from({ length: max + 1 }, () => undefined)
      entries.forEach(([k, x]) => (a[+k] = x))
      return a
    }
  }
  return Object.fromEntries(entries)
}
function memGet(path) {
  let cur = mem.data
  for (const k of parts(path)) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[k]
  }
  // React가 변경을 감지하도록 항상 새 객체로 복사
  if (cur === undefined) return null
  const copy = JSON.parse(JSON.stringify(cur))
  return FB_SHAPE ? fbShape(copy) ?? null : copy
}
function memApply(path, val) {
  const ps = parts(path)
  if (!ps.length) {
    mem.data = val ?? {}
    return
  }
  let cur = mem.data
  for (const k of ps.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  const last = ps[ps.length - 1]
  if (val === null || val === undefined) delete cur[last]
  else cur[last] = JSON.parse(JSON.stringify(val))
}
function notify() {
  mem.subs.forEach((cb) => cb())
}
// 여러 탭 데모: 처음 연 탭이 '서버' 역할 — 모든 쓰기를 순서대로 확정(commit)해서 모든 탭에 같은 순서로 반영
const TAB = Math.random().toString(36).slice(2)
let chan = null
let leader = false
let ready = Promise.resolve()
if (SHARED && typeof BroadcastChannel !== 'undefined') {
  chan = new BroadcastChannel('juruyut-demo-db')
  let done = false
  let resolveReady
  ready = new Promise((r) => (resolveReady = r))
  const finish = () => {
    if (done) return
    done = true
    resolveReady()
  }
  chan.onmessage = ({ data: m }) => {
    if (!m) return
    if (m.type === 'hello' && leader) chan.postMessage({ type: 'welcome', to: m.from, data: mem.data })
    else if (m.type === 'welcome' && m.to === TAB && !done) {
      mem.data = m.data || {}
      finish()
      notify()
    } else if (m.type === 'write' && leader) commitWrites(m.list)
    else if (m.type === 'commit') {
      m.list.forEach(([p, v]) => memApply(p, v))
      notify()
    }
  }
  chan.postMessage({ type: 'hello', from: TAB })
  setTimeout(() => {
    if (!done) leader = true
    finish()
  }, 300)
}
function commitWrites(list) {
  list.forEach(([p, v]) => memApply(p, v))
  notify()
  chan.postMessage({ type: 'commit', list })
}
// list: [[경로, 값], ...] 를 한 번에 반영 (여러 탭 데모면 '서버' 탭을 거쳐 모두에게)
function memWrite(list) {
  list = list.map(([p, v]) => [p, v === undefined ? null : v])
  if (!chan || leader) {
    if (chan) return commitWrites(list)
    list.forEach(([p, v]) => memApply(p, v))
    return notify()
  }
  // 내 화면엔 바로 반영 (Firebase 처럼), 확정 순서는 '서버' 탭이 정함
  list.forEach(([p, v]) => memApply(p, v))
  notify()
  chan.postMessage({ type: 'write', list })
}
function memSet(path, val) {
  memWrite([[path, val]])
}
// 데모에서도 Firebase 와 똑같이 쓰기 값을 검사 (undefined·NaN·함수·잘못된 키, update 경로 겹침이면 에러)
// → 실서버에서만 터지는 버그를 데모 자동 테스트에서 미리 잡기 위함
const BAD_KEY = /[\[\].#$\/\u0000-\u001F\u007F]/
function fbFail(msg) {
  console.error('[fbcheck] ' + msg)
  throw new Error('Firebase 쓰기 오류: ' + msg)
}
function fbCheck(v, where) {
  if (v === undefined) fbFail(`undefined 값 (${where})`)
  if (typeof v === 'function') fbFail(`함수 값 (${where})`)
  if (typeof v === 'number' && !Number.isFinite(v)) fbFail(`${v} 값 (${where})`)
  if (v && typeof v === 'object') {
    for (const k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue
      if (k === '' || BAD_KEY.test(k)) fbFail(`잘못된 키 "${k}" (${where})`)
      fbCheck(v[k], `${where}/${k}`)
    }
  }
}
function fbCheckUpdate(path, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) fbFail(`update 값이 객체가 아님 (${path})`)
  const keys = Object.keys(updates)
  const norm = keys.map((k) => parts(k))
  keys.forEach((k, i) => {
    if (!norm[i].length) fbFail(`빈 경로 (${path})`)
    norm[i].forEach((seg) => BAD_KEY.test(seg) && fbFail(`잘못된 경로 "${k}" (${path})`))
    fbCheck(updates[k], `${path}/${k}`)
  })
  for (let i = 0; i < norm.length; i++)
    for (let j = 0; j < norm.length; j++)
      if (i !== j && norm[i].length <= norm[j].length && norm[i].every((s, x) => s === norm[j][x])) fbFail(`경로 겹침 "${keys[i]}" ⊂ "${keys[j]}" (${path})`)
}

// ---------- 공개 API ----------
let fbDb = null
export function initDb(db) {
  fbDb = db
}

export const now = () => (DEMO ? Date.now() : serverTimestamp())

export async function dbGet(path) {
  if (DEMO) {
    await ready
    return memGet(path)
  }
  const snap = await get(ref(fbDb, path))
  return snap.exists() ? snap.val() : null
}
export async function dbSet(path, val) {
  if (DEMO) {
    fbCheck(val, path)
    return memSet(path, val)
  }
  return set(ref(fbDb, path), val)
}
export async function dbUpdate(path, updates) {
  if (DEMO) {
    fbCheckUpdate(path, updates)
    memWrite(Object.entries(updates).map(([k, v]) => [`${path}/${k}`, v]))
    return
  }
  return update(ref(fbDb, path), updates)
}
export async function dbRemove(path) {
  if (DEMO) return memSet(path, null)
  return remove(ref(fbDb, path))
}
export function dbOn(path, cb) {
  if (DEMO) {
    const fn = () => cb(memGet(path))
    let off = false
    ready.then(() => {
      if (off) return
      mem.subs.add(fn)
      fn()
    })
    return () => {
      off = true
      mem.subs.delete(fn)
    }
  }
  return onValue(ref(fbDb, path), (snap) => cb(snap.exists() ? snap.val() : null))
}
export function dbOnConnected(cb) {
  if (DEMO) {
    cb(true)
    return () => {}
  }
  return onValue(ref(fbDb, '.info/connected'), (snap) => cb(!!snap.val()))
}
// 서버 시간 보정: 폰마다 시계가 조금씩 달라서, 동시에 시작해야 하는 게임(반응속도 등)은 서버 시각 기준으로 맞춤
let serverOffset = 0
export function dbWatchServerOffset() {
  if (DEMO || !fbDb) return () => {}
  return onValue(ref(fbDb, '.info/serverTimeOffset'), (snap) => {
    serverOffset = Number(snap.val()) || 0
  })
}
export const serverNow = () => Date.now() + serverOffset

export function dbPresence(path) {
  if (DEMO) return memSet(path, true)
  const r = ref(fbDb, path)
  set(r, true)
  onDisconnect(r).set(false)
}

// 데모용: 가짜 참가자 추가
export function demoSeed(code, names, colors) {
  if (!SOLO) return
  names.forEach((n, i) => memSet(`${ROOMS}/${code}/players/demo${i}`, { name: n, color: colors[(i + 1) % colors.length], nop: i === 1 ? 2 : 0, team: (i + 1) % 2, joinedAt: Date.now() }))
}

// 방 정리 (방 만들 때 / 앱 열 때 호출) — 인덱스 없이 방 전체를 읽어 판단
//  - 참가자가 없거나, 모두 접속이 끊긴 채 30분 넘게 활동이 없는 방 삭제 (다 같이 폰 내려놓고 쉬는 동안 안 지워지게 10분 → 30분)
//  - 대기실(lobby)에서 1시간 넘게 시작 안 한 방 삭제 — 게임이 끝나고 대기실로 돌아온 때(lobbyAt)부터 셈
//    (예전엔 방 만든 때부터 세서, 1시간 넘게 한 판 하고 대기실로 가면 방이 바로 지워졌음)
//  - 상태와 무관하게 24시간 지난 방 삭제
//  - keep: 지금 들어가 있는 방은 안 지움 (다시 연결된 직후엔 내 접속 표시가 아직 안 들어가 있을 수 있어서)
export const LOBBY_TTL_MS = 60 * 60 * 1000
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000
export const EMPTY_TTL_MS = 30 * 60 * 1000
export const lobbySince = (r) => (typeof r?.lobbyAt === 'number' ? r.lobbyAt : typeof r?.createdAt === 'number' ? r.createdAt : 0)
export function shouldPurge(r, nowMs) {
  if (!r || typeof r !== 'object') return true
  const created = typeof r.createdAt === 'number' ? r.createdAt : 0
  const players = Object.values(r.players || {}).filter((p) => p && p.name)
  const lastActive = typeof r.lastActive === 'number' ? r.lastActive : created
  if (players.length === 0) return true
  if (players.every((p) => p.online === false) && lastActive <= nowMs - EMPTY_TTL_MS) return true
  if (r.status !== 'playing' && lobbySince(r) <= nowMs - LOBBY_TTL_MS) return true
  if (created <= nowMs - ROOM_TTL_MS) return true
  return false
}
export async function dbPurgeOldRooms(keep) {
  if (DEMO) return 0
  const snap = await get(ref(fbDb, ROOMS))
  if (!snap.exists()) return 0
  const nowMs = Date.now()
  const updates = {}
  snap.forEach((child) => {
    if (child.key !== keep && shouldPurge(child.val(), nowMs)) updates[child.key] = null
  })
  if (!Object.keys(updates).length) return 0
  await update(ref(fbDb, ROOMS), updates)
  return Object.keys(updates).length
}
// 홈 화면 방 목록 구독 (방 전체 → 요약)
export function dbOnRooms(cb) {
  if (DEMO) {
    const fn = () => cb(memGet(ROOMS) || {})
    let off = false
    ready.then(() => {
      if (off) return
      mem.subs.add(fn)
      fn()
    })
    return () => {
      off = true
      mem.subs.delete(fn)
    }
  }
  return onValue(ref(fbDb, ROOMS), (snap) => cb(snap.exists() ? snap.val() : {}))
}
