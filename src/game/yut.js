// 윷판 / 윷 / 말 이동 규칙 (순수 함수 — 화면·DB 와 무관)
//
// 윷판 노드 (정사각형, 좌표 0~100, y 는 아래로)
//   o0 = 참먹이(출발·골인, 오른쪽 아래)  → 오른쪽 변을 따라 위로 o1..o4 → o5 = 모(오른쪽 위)
//   → 위 변을 따라 왼쪽으로 o6..o9 → o10 = 뒷모(왼쪽 위) → 왼쪽 변 아래로 o11..o14 → o15 = 찌모(왼쪽 아래)
//   → 아래 변 오른쪽으로 o16..o19 → o0(골인)
//   지름길 A: 모(o5) → a1 → a2 → 방(C) → a3 → a4 → 찌모(o15)
//   지름길 B: 뒷모(o10) → b1 → b2 → 방(C) → b3 → b4 → 참먹이(골인)
//   규칙: 모·뒷모·방에 "멈춘" 말은 다음 이동 때 지름길로. 방에 멈추면 참먹이 쪽(b3)으로.
//        방을 지나가기만 하면 들어온 방향 그대로 직진.
//   골인: 참먹이에 도착하거나 지나가면 골인. (빽도로 참먹이에 들어가면 다음 이동 때 바로 골인)

export const TEAM_INFO = [
  { name: '빨강팀', short: '빨강', color: '#ea002c', emoji: '🔴' },
  { name: '파랑팀', short: '파랑', color: '#2f6df6', emoji: '🔵' },
  { name: '초록팀', short: '초록', color: '#1fa97a', emoji: '🟢' },
  { name: '노랑팀', short: '노랑', color: '#f5a300', emoji: '🟡' },
]
export const PIECES_PER_TEAM = 4

const OUTER = []
for (let k = 0; k < 20; k++) {
  let x, y
  if (k <= 5) [x, y] = [100, 100 - k * 20]
  else if (k <= 10) [x, y] = [100 - (k - 5) * 20, 0]
  else if (k <= 15) [x, y] = [0, (k - 10) * 20]
  else [x, y] = [(k - 15) * 20, 100]
  OUTER.push({ id: `o${k}`, x, y })
}
const third = (a, b, t) => a + (b - a) * t
// 지름길: 모(100,0)→찌모(0,100) / 뒷모(0,0)→참먹이(100,100)
const DIAG = [
  { id: 'a1', x: third(100, 0, 1 / 6), y: third(0, 100, 1 / 6) },
  { id: 'a2', x: third(100, 0, 2 / 6), y: third(0, 100, 2 / 6) },
  { id: 'C', x: 50, y: 50 },
  { id: 'a3', x: third(100, 0, 4 / 6), y: third(0, 100, 4 / 6) },
  { id: 'a4', x: third(100, 0, 5 / 6), y: third(0, 100, 5 / 6) },
  { id: 'b1', x: 100 / 6, y: 100 / 6 },
  { id: 'b2', x: 200 / 6, y: 200 / 6 },
  { id: 'b3', x: 400 / 6, y: 400 / 6 },
  { id: 'b4', x: 500 / 6, y: 500 / 6 },
]
export const NODES = [...OUTER, ...DIAG]
export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))
export const BIG_NODES = new Set(['o0', 'o5', 'o10', 'o15', 'C'])

// 화면에 보일 칸 번호/이름
export function nodeLabel(id) {
  if (id === 'o0') return '참먹이'
  if (id === 'o5') return '모'
  if (id === 'o10') return '뒷모'
  if (id === 'o15') return '찌모'
  if (id === 'C') return '방'
  if (id[0] === 'o') return `${id.slice(1)}`
  const extra = { a1: 20, a2: 21, a3: 22, a4: 23, b1: 24, b2: 25, b3: 26, b4: 27 }
  return `${extra[id]}`
}
export const nodeName = (id) => (BIG_NODES.has(id) ? nodeLabel(id) : `${nodeLabel(id)}번 칸`)

// ---------- 칸 내용 (기본값) ----------
// type 은 주루마블과 같은 미니게임/기능. drink: 'self' | 'team' | 'all' 이면 수행 완료 시 잔 수 자동 +1
export const DEFAULT_YUT_CELLS = {
  o0: { emoji: '🏁', text: '참먹이\n(출발·골인)', type: 'home', locked: true },
  o1: { emoji: '🍶', text: '한 잔 마셔', drink: 'self' },
  o2: { emoji: '🎫', text: '놉카드 +1', type: 'nop' },
  o3: { emoji: '📝', text: '훈민정음\n게임', type: 'hunmin' },
  o4: { emoji: '🥂', text: '옆 사람과\n러브샷', drink: 'self' },
  o5: { emoji: '🎁', text: '게임\n선택권', type: 'choose' },
  o6: { emoji: '🤖', text: 'AI 지목\n마셔!', type: 'aiPick' },
  o7: { emoji: '🖐️', text: '손병호\n게임' },
  o8: { emoji: '🔤', text: '영어금지', type: 'option', minutes: 5 },
  o9: { emoji: '🎂', text: '막내\n마셔!' },
  o10: { emoji: '⚖️', text: '밸런스\n게임', type: 'balance' },
  o11: { emoji: '😈', text: '놉카드\n내놔!', type: 'steal' },
  o12: { emoji: '👉', text: '너! 마셔!\n(지목)', type: 'pick' },
  o13: { emoji: '🎲', text: '한 번 더\n던지기!', type: 'again' },
  o14: { emoji: '🍻', text: '우리 팀\n다 같이 마셔', drink: 'team' },
  o15: { emoji: '🤥', text: '라이어\n게임', type: 'liar' },
  o16: { emoji: '🥂', text: '의리주 마셔!\n(글라스에)', type: 'shuffle' },
  o17: { emoji: '🎰', text: '놉카드\n도박', type: 'gamble' },
  o18: { emoji: '✌️', text: '투터치', type: 'option', minutes: 5 },
  o19: { emoji: '🤝', text: '상대 팀 한 명\n골라 같이 마셔', drink: 'self' },
  a1: { emoji: '💣', text: '폭탄\n돌리기', type: 'bomb' },
  a2: { emoji: '🎫', text: '놉카드 +1', type: 'nop' },
  C: { emoji: '🗳️', text: '다수결 지목\n너 마셔!', type: 'vote' },
  a3: { emoji: '🔓', text: '옵션 해제', type: 'release' },
  a4: { emoji: '🎯', text: '진실 게임\n(질문 1개)' },
  b1: { emoji: '⚡', text: '반응속도\n게임', type: 'reaction' },
  b2: { emoji: '🙊', text: '아니·근데·진짜\n금지', type: 'option', minutes: 3 },
  b3: { emoji: '🎲', text: '한 번 더\n던지기!', type: 'again' },
  b4: { emoji: '🥃', text: '건배사 하고\n다 같이 원샷', drink: 'all' },
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
// 기본 한 칸 뒤 (빽도용)
const CANON_PREV = { o0: 'o19', a1: 'o5', a2: 'a1', C: 'a2', a3: 'C', a4: 'a3', b1: 'o10', b2: 'b1', b3: 'C', b4: 'b3' }
export function prevNode(node) {
  if (CANON_PREV[node]) return CANON_PREV[node]
  const k = Number(node.slice(1))
  return `o${k - 1}`
}
// 한 칸 앞. from = 직전 노드, start = 이번 이동의 첫 걸음인지
function stepForward(node, from, start) {
  if (node === 'home') return 'o1'
  if (node === 'o0') return 'goal' // 빽도로 참먹이에 들어가 있던 말
  if (start && node === 'o5') return 'a1'
  if (start && node === 'o10') return 'b1'
  if (node === 'C') return start || from === 'b2' ? 'b3' : 'a3'
  const next = { a1: 'a2', a2: 'C', a3: 'a4', a4: 'o15', b1: 'b2', b2: 'C', b3: 'b4', b4: 'goal', o19: 'goal' }
  if (next[node]) return next[node]
  return `o${Number(node.slice(1)) + 1}`
}

// piece = { n: 'home' | 'goal' | 노드id, p?: 직전 노드 }
// 결과: { path: [노드...], dest: 노드 | 'goal', prev, finished }
export function movePiece(piece, steps) {
  const node = piece.n
  if (node === 'goal') return null
  if (steps === -1) {
    if (node === 'home') return null
    const back = piece.p && piece.p !== 'home' ? piece.p : prevNode(node)
    return { path: [back], dest: back, prev: prevNode(back), finished: false }
  }
  if (steps <= 0) return null
  const path = []
  let cur = node
  let from = piece.p || null
  for (let i = 0; i < steps; i++) {
    const nx = stepForward(cur, from, i === 0)
    if (nx === 'goal') {
      // 골인: 화면에는 참먹이까지 보여줌
      path.push('o0')
      return { path, dest: 'goal', prev: cur, finished: true }
    }
    path.push(nx)
    from = cur
    cur = nx
  }
  return { path, dest: cur, prev: from, finished: false }
}

// 팀 t 가 값 v 로 움직일 수 있는 선택지 (판 위 말 묶음별 + 새 말)
export function moveOptions(pieces, t, v) {
  const mine = (pieces?.[t] || []).map((pc, i) => ({ ...pc, i }))
  const opts = []
  const seen = new Set()
  mine.forEach((pc) => {
    if (pc.n === 'home' || pc.n === 'goal' || seen.has(pc.n)) return
    seen.add(pc.n)
    const r = movePiece(pc, v)
    if (r) opts.push({ from: pc.n, count: mine.filter((x) => x.n === pc.n).length, ...r })
  })
  const home = mine.filter((x) => x.n === 'home')
  if (v > 0 && home.length) {
    const r = movePiece({ n: 'home' }, v)
    if (r) opts.push({ from: 'home', count: 1, homeLeft: home.length, ...r })
  }
  return opts
}

export function teamDone(pieces, t) {
  const mine = pieces?.[t] || []
  return mine.length > 0 && mine.every((pc) => pc.n === 'goal')
}
export function freshPieces(teamCount) {
  const out = {}
  for (let t = 0; t < teamCount; t++) out[t] = Array.from({ length: PIECES_PER_TEAM }, () => ({ n: 'home' }))
  return out
}
// Firebase 가 배열/객체 둘 다로 돌려줄 수 있어서 통일
export function normPieces(raw, teamCount) {
  const out = {}
  for (let t = 0; t < teamCount; t++) {
    const arr = raw?.[t] ? (Array.isArray(raw[t]) ? raw[t] : Object.values(raw[t])) : []
    out[t] = Array.from({ length: PIECES_PER_TEAM }, (_, i) => ({ n: arr[i]?.n || 'home', ...(arr[i]?.p ? { p: arr[i].p } : {}) }))
  }
  return out
}
