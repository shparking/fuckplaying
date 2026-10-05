// 윷판 / 윷 / 말 이동 규칙 (순수 함수 — 화면·DB 와 무관)
//
// 10×10 윷판 (한 변에 10칸, 좌표 0~100, y 는 아래로)
//   o0 = 출발·골인(오른쪽 아래) → 오른쪽 변을 따라 위로 o1..o8 → o9 = 오른쪽 위 모서리
//   → 위 변을 따라 왼쪽으로 o10..o17 → o18 = 왼쪽 위 모서리 → 왼쪽 변 아래로 o19..o26
//   → o27 = 왼쪽 아래 모서리 → 아래 변 오른쪽으로 o28..o35 → o0(골인)
//   대각선 A: 오른쪽 위 모서리(o9) → a1..a4 → 가운데(C) → a5..a8 → 왼쪽 아래 모서리(o27)
//   대각선 B: 왼쪽 위 모서리(o18) → b1..b4 → 가운데(C) → b5..b8 → 골인
//   규칙: 오른쪽 위·왼쪽 위 모서리, 가운데에 "멈춘" 말은 다음 이동 때 대각선(지름길)과 직진 중에서 고름.
//        지나가기만 하면 들어온 방향 그대로 직진.
//   골인: 출발 칸에 도착하거나 지나가면 골인. (빽도로 출발 칸에 들어가면 다음 이동 때 바로 골인)

// 팀 색: 밤 배경에서 네온처럼 빛나는 색
export const TEAM_INFO = [
  { name: '빨강팀', short: '빨강', color: '#ff4d5e', emoji: '🔴' },
  { name: '파랑팀', short: '파랑', color: '#3d8bff', emoji: '🔵' },
  { name: '초록팀', short: '초록', color: '#2fd27a', emoji: '🟢' },
  { name: '노랑팀', short: '노랑', color: '#ffc23a', emoji: '🟡' },
]
export const PIECES_PER_TEAM = 4 // 기본값 (방장이 대기실에서 2~4개로 바꿀 수 있음)
export const pieceCountOf = (room) => Math.min(4, Math.max(2, room?.pieceCount || PIECES_PER_TEAM))

export const SIDE = 10 // 한 변의 칸 수 (모서리 포함)
const SEG = SIDE - 1 // 한 변의 칸 사이 수 (9)
const OUTER_N = SEG * 4 // 바깥 칸 수 (36)
const HALF = 4 // 모서리와 가운데 사이 대각선 칸 수

export const START = 'o0'
export const CORNER_TR = `o${SEG}` // 오른쪽 위 모서리 (o9)
export const CORNER_TL = `o${SEG * 2}` // 왼쪽 위 모서리 (o18)
export const CORNER_BL = `o${SEG * 3}` // 왼쪽 아래 모서리 (o27)
const LAST_OUTER = `o${OUTER_N - 1}` // o35

const OUTER = []
for (let k = 0; k < OUTER_N; k++) {
  const s = 100 / SEG
  let x, y
  if (k <= SEG) [x, y] = [100, 100 - k * s]
  else if (k <= SEG * 2) [x, y] = [100 - (k - SEG) * s, 0]
  else if (k <= SEG * 3) [x, y] = [0, (k - SEG * 2) * s]
  else [x, y] = [(k - SEG * 3) * s, 100]
  OUTER.push({ id: `o${k}`, x, y })
}
const lerp = (a, b, t) => a + (b - a) * t
const DIAG = []
for (let i = 1; i <= HALF; i++) {
  const t = i / (HALF + 1)
  DIAG.push({ id: `a${i}`, x: lerp(100, 50, t), y: lerp(0, 50, t) }) // 오른쪽 위 → 가운데
  DIAG.push({ id: `b${i}`, x: lerp(0, 50, t), y: lerp(0, 50, t) }) // 왼쪽 위 → 가운데
  DIAG.push({ id: `a${HALF + i}`, x: lerp(50, 0, t), y: lerp(50, 100, t) }) // 가운데 → 왼쪽 아래
  DIAG.push({ id: `b${HALF + i}`, x: lerp(50, 100, t), y: lerp(50, 100, t) }) // 가운데 → 골인
}
DIAG.push({ id: 'C', x: 50, y: 50 })
export const NODES = [...OUTER, ...DIAG]
export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))
export const BIG_NODES = new Set([START, CORNER_TR, CORNER_TL, CORNER_BL, 'C'])
export const CORNERS = new Set([CORNER_TR, CORNER_TL, CORNER_BL])

// 화면에 보일 칸 번호: 바깥 1~35, 대각선 A 36~39·(가운데 40)·41~44, 대각선 B 45~48·49~52
const DISPLAY_NO = {}
for (let k = 1; k < OUTER_N; k++) DISPLAY_NO[`o${k}`] = k
for (let i = 1; i <= HALF; i++) {
  DISPLAY_NO[`a${i}`] = OUTER_N - 1 + i // 36~39
  DISPLAY_NO[`a${HALF + i}`] = OUTER_N + HALF + i // 41~44
  DISPLAY_NO[`b${i}`] = OUTER_N + HALF * 2 + i // 45~48
  DISPLAY_NO[`b${HALF + i}`] = OUTER_N + HALF * 3 + i // 49~52
}
DISPLAY_NO.C = OUTER_N + HALF // 40
export const cellNo = (id) => DISPLAY_NO[id] || null

export function nodeLabel(id) {
  if (id === START) return '출발·골인'
  if (CORNERS.has(id)) return `모서리 ${DISPLAY_NO[id]}`
  if (id === 'C') return `가운데 ${DISPLAY_NO[id]}`
  return `${DISPLAY_NO[id] ?? ''}`
}
export function nodeName(id) {
  if (id === START) return '출발·골인 칸'
  if (CORNERS.has(id)) return `${DISPLAY_NO[id]}번 모서리`
  if (id === 'C') return `가운데(${DISPLAY_NO[id]}번)`
  return `${DISPLAY_NO[id]}번 칸`
}

// ---------- 칸 내용 (기본값) ----------
// type 은 주루마블과 같은 미니게임/기능. drink: 'self' | 'team' | 'all' 이면 수행 완료 시 잔 수 자동 +1
// (임시 배치 — 사용자가 보내 줄 벌칙 리스트로 바꿀 예정)
const C1 = { emoji: '🍶', text: '한 잔 마셔', drink: 'self' }
const NOP = { emoji: '🎫', text: '놉카드 +1', type: 'nop' }
const HUNMIN = { emoji: '📝', text: '훈민정음\n게임', type: 'hunmin' }
const LOVE = { emoji: '🥂', text: '옆 사람과\n러브샷', drink: 'self' }
const AI = { emoji: '🤖', text: 'AI 지목\n마셔!', type: 'aiPick' }
const SON = { emoji: '🖐️', text: '손병호\n게임' }
const YOUNG = { emoji: '🎂', text: '막내\n마셔!' }
const STEAL = { emoji: '😈', text: '놉카드\n내놔!', type: 'steal' }
const CHOOSE = { emoji: '🎁', text: '게임\n선택권', type: 'choose' }
const NOENG = { emoji: '🔤', text: '영어금지', type: 'option', minutes: 5 }
const PICK = { emoji: '👉', text: '너! 마셔!\n(지목)', type: 'pick' }
const AGAIN = { emoji: '🎲', text: '한 번 더\n던지기!', type: 'again' }
const TEAM = { emoji: '🍻', text: '우리 팀\n다 같이 마셔', drink: 'team' }
const SHUFFLE = { emoji: '🥂', text: '의리주 마셔!\n(글라스에)', type: 'shuffle' }
const TRUTH = { emoji: '🎯', text: '진실 게임\n(질문 1개)' }
const GAMBLE = { emoji: '🎰', text: '놉카드\n도박', type: 'gamble' }
const BALANCE = { emoji: '⚖️', text: '밸런스\n게임', type: 'balance' }
const TWOTOUCH = { emoji: '✌️', text: '투터치', type: 'option', minutes: 5 }
const REACT = { emoji: '⚡', text: '반응속도\n게임', type: 'reaction' }
const RIVAL = { emoji: '🤝', text: '상대 팀 한 명\n골라 같이 마셔', drink: 'self' }
const BOMB = { emoji: '💣', text: '폭탄\n돌리기', type: 'bomb' }
const LIAR = { emoji: '🤥', text: '라이어\n게임', type: 'liar' }
const NOWORD = { emoji: '🙊', text: '아니·근데·진짜\n금지', type: 'option', minutes: 3 }
const RELEASE = { emoji: '🔓', text: '옵션 해제', type: 'release' }
const CHEERS = { emoji: '🥃', text: '건배사 하고\n다 같이 원샷', drink: 'all' }
const VOTE = { emoji: '🗳️', text: '다수결 지목\n너 마셔!', type: 'vote' }

export const DEFAULT_YUT_CELLS = {
  o0: { emoji: '🏁', text: '출발·골인', type: 'home', locked: true },
  // 오른쪽 변 (출발 → 위로)
  o1: C1, o2: NOP, o3: HUNMIN, o4: LOVE, o5: AI, o6: SON, o7: YOUNG, o8: STEAL,
  o9: CHOOSE, // 오른쪽 위 모서리
  // 위 변 (→ 왼쪽)
  o10: NOENG, o11: PICK, o12: AGAIN, o13: TEAM, o14: NOP, o15: SHUFFLE, o16: TRUTH, o17: GAMBLE,
  o18: BALANCE, // 왼쪽 위 모서리
  // 왼쪽 변 (→ 아래로)
  o19: C1, o20: TWOTOUCH, o21: AI, o22: REACT, o23: RIVAL, o24: YOUNG, o25: BOMB, o26: NOP,
  o27: LIAR, // 왼쪽 아래 모서리
  // 아래 변 (→ 골인)
  o28: AGAIN, o29: TEAM, o30: NOWORD, o31: PICK, o32: RELEASE, o33: SON, o34: C1, o35: CHEERS,
  // 대각선 A (오른쪽 위 → 가운데 → 왼쪽 아래)
  a1: BOMB, a2: NOP, a3: TRUTH, a4: C1,
  C: VOTE, // 가운데
  a5: RELEASE, a6: REACT, a7: SHUFFLE, a8: STEAL,
  // 대각선 B (왼쪽 위 → 가운데 → 골인)
  b1: REACT, b2: YOUNG, b3: AGAIN, b4: AI,
  b5: C1, b6: GAMBLE, b7: TEAM, b8: CHEERS,
}

// ---------- 윷 던지기 ----------
// 값: -1 빽도, 1 도, 2 개, 3 걸, 4 윷, 5 모, 0 낙
export const YUT_NAME = { '-1': '빽도', 0: '낙', 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' }
export const yutName = (v) => YUT_NAME[v] ?? '?'
export const isBonus = (v) => v === 4 || v === 5
export const NAK_CHANCE = 0.04

// 윷가락 4개 (평평한 면 = 배) 를 각각 50% 로 던짐. 0번 윷가락에 빽도 표시
export function throwSticks(rand = Math.random) {
  if (rand() < NAK_CHANCE) return { value: 0, sticks: null }
  const sticks = [0, 1, 2, 3].map(() => rand() < 0.5)
  const flat = sticks.filter(Boolean).length
  let value
  if (flat === 0) value = 5
  else if (flat === 1) value = sticks[0] ? -1 : 1
  else value = flat
  return { value, sticks }
}
// 결과값에 맞는 윷가락 모양 (애니메이션용, true = 배)
export function sticksFor(value, rand = Math.random) {
  if (value === 5) return [false, false, false, false]
  if (value === 4) return [true, true, true, true]
  if (value === -1) return [true, false, false, false]
  if (value === 1) {
    const i = 1 + Math.floor(rand() * 3)
    return [0, 1, 2, 3].map((k) => k === i)
  }
  const s = [0, 1, 2, 3].map((k) => k < value)
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  return s
}

// ---------- 말 이동 ----------
// 한 칸 앞 (기본 길)
const NEXT = {}
for (let k = 0; k < OUTER_N - 1; k++) NEXT[`o${k}`] = `o${k + 1}`
NEXT[LAST_OUTER] = 'goal'
for (let i = 1; i < HALF; i++) {
  NEXT[`a${i}`] = `a${i + 1}`
  NEXT[`b${i}`] = `b${i + 1}`
  NEXT[`a${HALF + i}`] = `a${HALF + i + 1}`
  NEXT[`b${HALF + i}`] = `b${HALF + i + 1}`
}
NEXT[`a${HALF}`] = 'C'
NEXT[`b${HALF}`] = 'C'
NEXT[`a${HALF * 2}`] = CORNER_BL
NEXT[`b${HALF * 2}`] = 'goal'
// 한 칸 뒤 (빽도용 기본값, 직전 노드를 알면 그걸 우선)
const PREV = { [START]: LAST_OUTER, a1: CORNER_TR, b1: CORNER_TL, C: `a${HALF}`, [`a${HALF + 1}`]: 'C', [`b${HALF + 1}`]: 'C' }
for (let k = 1; k < OUTER_N; k++) PREV[`o${k}`] = `o${k - 1}`
for (let i = 2; i <= HALF; i++) {
  PREV[`a${i}`] = `a${i - 1}`
  PREV[`b${i}`] = `b${i - 1}`
  PREV[`a${HALF + i}`] = `a${HALF + i - 1}`
  PREV[`b${HALF + i}`] = `b${HALF + i - 1}`
}
export const prevNode = (node) => PREV[node]

// 갈림길: 여기에 멈춘 말은 다음 이동 첫 걸음에서 대각선(short)/직진(long) 중 고름
export const BRANCH_NODES = new Set([CORNER_TR, CORNER_TL, 'C'])
// 가운데를 지날 때(또는 직진할 때): 들어온 방향 그대로
const throughCenter = (from) => (from === `b${HALF}` ? `b${HALF + 1}` : `a${HALF + 1}`)
function branchStep(node, from, route) {
  if (node === CORNER_TR) return route === 'long' ? NEXT[CORNER_TR] : 'a1'
  if (node === CORNER_TL) return route === 'long' ? NEXT[CORNER_TL] : 'b1'
  // 가운데: 지름길 = 골인 쪽(b5), 직진 = 들어온 방향
  return route === 'long' ? throughCenter(from) : `b${HALF + 1}`
}
// 한 칸 앞. from = 직전 노드, start = 이번 이동의 첫 걸음인지, route = 갈림길에서 고른 길
function stepForward(node, from, start, route) {
  if (node === 'home') return 'o1'
  if (node === START) return 'goal' // 빽도로 출발 칸에 들어가 있던 말
  if (start && BRANCH_NODES.has(node)) return branchStep(node, from, route)
  if (node === 'C') return throughCenter(from)
  return NEXT[node]
}

// piece = { n: 'home' | 'goal' | 노드id, p?: 직전 노드 }
// 결과: { path: [노드...], dest: 노드 | 'goal', prev, finished }
export function movePiece(piece, steps, route) {
  const node = piece.n
  if (node === 'goal') return null
  if (steps === -1) {
    if (node === 'home') return null
    const back = piece.p && piece.p !== 'home' ? piece.p : prevNode(node)
    if (!back) return null
    return { path: [back], dest: back, prev: prevNode(back), finished: false }
  }
  if (steps <= 0) return null
  const path = []
  let cur = node
  let from = piece.p || null
  for (let i = 0; i < steps; i++) {
    const nx = stepForward(cur, from, i === 0, route)
    if (nx === 'goal') {
      // 골인: 화면에는 출발 칸까지 보여줌
      path.push(START)
      return { path, dest: 'goal', prev: cur, finished: true }
    }
    path.push(nx)
    from = cur
    cur = nx
  }
  return { path, dest: cur, prev: from, finished: false }
}

// 팀 t 가 값 v 로 움직일 수 있는 선택지 (판 위 말 묶음별 + 새 말)
// 갈림길에 멈춰 있는 말은 대각선(route: 'short')·직진(route: 'long') 두 선택지가 생김
export function moveOptions(pieces, t, v) {
  const mine = (pieces?.[t] || []).map((pc, i) => ({ ...pc, i }))
  const opts = []
  const seen = new Set()
  mine.forEach((pc) => {
    if (pc.n === 'home' || pc.n === 'goal' || seen.has(pc.n)) return
    seen.add(pc.n)
    const count = mine.filter((x) => x.n === pc.n).length
    if (v > 0 && BRANCH_NODES.has(pc.n)) {
      const s = movePiece(pc, v, 'short')
      const l = movePiece(pc, v, 'long')
      const same = s && l && s.dest === l.dest && s.finished === l.finished
      if (same) opts.push({ from: pc.n, count, ...s })
      else {
        if (s) opts.push({ from: pc.n, route: 'short', count, ...s })
        if (l) opts.push({ from: pc.n, route: 'long', count, ...l })
      }
      return
    }
    const r = movePiece(pc, v)
    if (r) opts.push({ from: pc.n, count, ...r })
  })
  const home = mine.filter((x) => x.n === 'home')
  if (v > 0 && home.length) {
    const r = movePiece({ n: 'home' }, v)
    if (r) opts.push({ from: 'home', count: 1, homeLeft: home.length, ...r })
  }
  return opts
}
// 선택지 구분용 키 (같은 말 묶음의 대각선/직진을 구분)
export const moveKey = (o) => `${o.from}|${o.route || ''}`
// 선택지 설명: 갈림길이면 "대각선"/"직진"
export function routeLabel(o) {
  if (!o.route) return ''
  if (o.from === 'C') return o.route === 'short' ? '골인 쪽 대각선' : '직진'
  return o.route === 'short' ? '대각선(지름길)' : '직진'
}

export function teamDone(pieces, t) {
  const mine = pieces?.[t] || []
  return mine.length > 0 && mine.every((pc) => pc.n === 'goal')
}
export function freshPieces(teamCount, per = PIECES_PER_TEAM) {
  const out = {}
  for (let t = 0; t < teamCount; t++) out[t] = Array.from({ length: per }, () => ({ n: 'home' }))
  return out
}
// Firebase 가 배열/객체 둘 다로 돌려줄 수 있어서 통일
export function normPieces(raw, teamCount, per = PIECES_PER_TEAM) {
  const out = {}
  for (let t = 0; t < teamCount; t++) {
    const arr = raw?.[t] ? (Array.isArray(raw[t]) ? raw[t] : Object.values(raw[t])) : []
    out[t] = Array.from({ length: per }, (_, i) => ({ n: arr[i]?.n || 'home', ...(arr[i]?.p ? { p: arr[i].p } : {}) }))
  }
  return out
}
