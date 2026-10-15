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
// type 은 미니게임/기능. drink: 'self' | 'team' | 'all' 이면 수행 완료 시 잔 수 자동 +1
// (10/15 사용자 리스트 + 10/16 방패·지하철·단어 노래·세계 지도. 남은 빈칸 44·51은 일단 소주 +1 적립 — 새 아이디어가 나오면 채움)
const NOP = { emoji: '🎫', text: '놉카드 +1', type: 'nop' }
const HUNMIN = { emoji: '📝', text: '훈민정음\n게임', type: 'hunmin' }
const ALL = { emoji: '🍻', text: '다 같이\n마셔!', drink: 'all' }
const AI = { emoji: '🤖', text: 'AI 지목\n마셔!', type: 'aiPick' }
const STEAL = { emoji: '😈', text: '놉카드\n내놔!', type: 'steal' }
const CHOOSE = { emoji: '🎁', text: '게임\n선택권', type: 'choose' }
const NOENG = { emoji: '🔤', text: '영어금지', type: 'option', minutes: 5 }
const BUNNY = { emoji: '🐰', text: '바니바니\n게임' }
const AGAIN = { emoji: '🎲', text: '한 번 더\n던지기!', type: 'again' }
const TEAM = { emoji: '🤝', text: '우리 팀\n다 같이 마셔!', drink: 'team' }
// 너희 팀 다 같이 마셔: 2팀이면 상대 팀 자동, 3팀 이상이면 도착한 사람이 팀을 고름
const THEIRS = { emoji: '👉', text: '너희 팀\n다 같이 마셔!', type: 'pickTeam' }
const SHUFFLE = { emoji: '🍺', text: '의리주 마셔!\n(글라스에)', type: 'shuffle' }
const GAMBLE = { emoji: '🎰', text: '놉카드\n도박', type: 'gamble' }
const TWOTOUCH = { emoji: '✌️', text: '투터치', type: 'option', minutes: 5 }
// 랜덤 n행시: 키워드를 랜덤으로 주고 그 글자 수만큼 n행시 → 다 같이 마셔
const NHAENG = { emoji: '🎤', text: '랜덤n행시\n다같이 마셔!', full: '랜덤 n행시 후 다같이 마셔!', type: 'nhaeng' } // 칸에는 짧게, 팝업에는 full
// 상대 팀에서 한 명을 골라 둘이 같이 짠 (둘만 마심)
const RIVAL = { emoji: '🥂', text: '상대 1명 골라\n같이 짠♥', type: 'toast' }
const NOWORD = { emoji: '🙊', text: '아니·근데\n진짜 금지', type: 'option', minutes: 3 }
const RELEASE = { emoji: '🔓', text: '옵션 해제', type: 'release' }
// N칸 뒤로: 도착한 말(업힌 말 포함)이 N칸 뒤로 가고, 거기서 잡기·업기와 그 칸 내용
const BACK4 = { emoji: '⏪', text: '4칸 뒤로', type: 'back', steps: 4 }
// 팀 대결 미니게임: 모두 자기 폰으로 동시에 참여하고, 진 팀 전원이 마심
const SYNC = { emoji: '👯', text: '이구동성\n게임', type: 'teamSync' }
const TAPWAR = { emoji: '🦦', text: '줄다리기\n게임', type: 'tapWar' }
const TREACT = { emoji: '⚡', text: '반응 속도\n게임', type: 'teamReact' }
const TBOMB = { emoji: '💣', text: '폭탄\n돌리기', type: 'teamBomb' }
const TRAP = { emoji: '🎨', text: '색깔 함정\n게임', type: 'colorTrap' }
const CIRCLE = { emoji: '⭕', text: '완벽한 원\n그리기', type: 'circle' }
const PRICE = { emoji: '💰', text: '편의점\n얼마게요', type: 'priceGuess' }
const TIMESUM = { emoji: '🕰️', text: '팀 시간\n합치기', type: 'timeSum' }
const MAPPIN = { emoji: '🗺️', text: '지도\n찍기', type: 'mapPin' }
const WORLDPIN = { emoji: '🌍', text: '세계 지도\n찍기', type: 'worldPin' }
// 이름 칸: 이름에 '상혁'이 들어간 사람만 / 빼고 (연대책임 없음)
const ONLY_SH = { emoji: '🫵', text: '박상혁만\n마셔!', drink: 'only', who: '상혁' }
const EXCEPT_SH = { emoji: '🙅', text: '박상혁 빼고\n다 마셔!', drink: 'except', who: '상혁' }
// 모든 옵션 On: 판에 있는 옵션(영어금지·투터치·아니·근데·진짜 금지)을 전부 상대 팀에 3분씩
const ALLOPT = { emoji: '🚨', text: '모든 옵션\nOn', type: 'allOptions', minutes: 3 }
// 방패: 도착한 팀 방패 +1 → 우리 말이 잡힐 때 쓸지 고름 (쓰면 안 잡히고 방패 1개 없어짐)
const SHIELD = { emoji: '🛡️', text: '방패 +1', type: 'shield' }
// 지하철 게임: 3·2·1 → 서울 지하철 1~9호선 중 하나 → 그 호선 역 이름을 돌아가며 (오프라인, 훈민정음처럼)
const SUBWAY = { emoji: '🚇', text: '지하철\n게임', type: 'subway' }
// 단어 노래: 3·2·1 → 단어 → 그 단어가 들어간 노래를 돌아가며 한 소절씩 (오프라인, 막히면 마셔)
const SONG = { emoji: '🎶', text: '단어 노래\n부르기', type: 'wordSong' }
// 소주 보관소: '소주 +1' 칸에 걸릴 때마다 보관소에 한 잔씩 모아 두고, 가운데(40번) 보관소에 도착한 팀이 모인 술을 의리주로 마심
const SOJU_ADD = { emoji: '🍶', text: '소주 +1\n적립', type: 'sojuAdd' }
const SOJU_BANK = { emoji: '🏺', text: '소주\n보관소', type: 'sojuBank', locked: true }
// (지금 판에 없는 칸 — 나중에 다시 쓸 수 있게 남겨 둠)
export const SPARE_CELLS = {
  C1: { emoji: '🍶', text: '한 잔 마셔', drink: 'self' },
  LOVE: { emoji: '🥂', text: '옆 사람과\n러브샷', drink: 'self' },
  SON: { emoji: '🖐️', text: '손병호\n게임' },
  YOUNG: { emoji: '🎂', text: '막내\n마셔!' },
  PICK: { emoji: '👉', text: '너! 마셔!\n(지목)', type: 'pick' },
  TRUTH: { emoji: '🎯', text: '진실 게임\n(질문 1개)' },
  CHEERS: { emoji: '🥃', text: '건배사 후\n전원 원샷', drink: 'all' },
  BALANCE: { emoji: '⚖️', text: '밸런스\n게임', type: 'balance' },
  REACT: { emoji: '⚡', text: '반응속도\n게임', type: 'reaction' },
  BOMB: { emoji: '💣', text: '폭탄\n돌리기', type: 'bomb' },
  LIAR: { emoji: '🤥', text: '라이어\n게임', type: 'liar' },
  VOTE: { emoji: '🗳️', text: '다수결 지목\n너 마셔!', type: 'vote' },
}

export const DEFAULT_YUT_CELLS = {
  o0: { emoji: '🏁', text: '출발·골인', type: 'home', locked: true },
  // 오른쪽 변 (출발 → 위로) 1~8
  o1: HUNMIN, o2: SOJU_ADD, o3: ALL, o4: TBOMB, o5: TREACT, o6: CHOOSE, o7: PRICE, o8: CIRCLE,
  o9: NOP, // 9 오른쪽 위 모서리
  // 위 변 (→ 왼쪽) 10~17
  o10: MAPPIN, o11: BUNNY, o12: SOJU_ADD, o13: TEAM, o14: THEIRS, o15: GAMBLE, o16: TIMESUM, o17: CHOOSE,
  o18: NOP, // 18 왼쪽 위 모서리
  // 왼쪽 변 (→ 아래로) 19~26
  o19: SOJU_ADD, o20: TAPWAR, o21: NHAENG, o22: RIVAL, o23: TRAP, o24: NOWORD, o25: AI, o26: SHUFFLE,
  o27: NOP, // 27 왼쪽 아래 모서리
  // 아래 변 (→ 골인) 28~35
  o28: CHOOSE, o29: STEAL, o30: RELEASE, o31: SYNC, o32: SOJU_ADD, o33: AGAIN, o34: RIVAL, o35: BACK4,
  // 대각선 A (오른쪽 위 → 가운데 → 왼쪽 아래) 36~39 · 41~44
  a1: STEAL, a2: NOENG, a3: RELEASE, a4: CHOOSE,
  C: SOJU_BANK, // 40 가운데: 소주 보관소 (고정)
  a5: ONLY_SH, a6: SHIELD, a7: SONG, a8: SOJU_ADD, // 42 방패 · 43 단어 노래 · 44 아직 빈칸 (소주 +1)
  // 대각선 B (왼쪽 위 → 가운데 → 골인) 45~52
  b1: SUBWAY, b2: SHIELD, b3: EXCEPT_SH, b4: TWOTOUCH, // 45 지하철 게임 · 46 방패
  b5: CHOOSE, b6: WORLDPIN, b7: SOJU_ADD, b8: ALLOPT, // 50 세계 지도 찍기 · 51 아직 빈칸 (소주 +1)
}

// ---------- 윷 던지기 ----------
// 값: -1 빽도, 1 도, 2 개, 3 걸, 4 윷, 5 모 (낙 없음)
export const YUT_NAME = { '-1': '빽도', 0: '낙', 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' }
export const yutName = (v) => YUT_NAME[v] ?? '?'
export const isBonus = (v) => v === 4 || v === 5
export const YUT_VALUES = [1, 2, 3, 4, 5, -1] // 도 개 걸 윷 모 빽도

// 도·개·걸·윷·모·빽도가 모두 같은 확률(1/6). 윷가락 모양은 결과에 맞춰 그림 (0번 윷가락 = 빽도 윷, 배에 '-' 표시)
export function throwSticks(rand = Math.random) {
  const value = YUT_VALUES[Math.min(YUT_VALUES.length - 1, Math.floor(rand() * YUT_VALUES.length))]
  return { value, sticks: sticksFor(value, rand) }
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
// 'N칸 뒤로' 칸: piece 에서 N칸 뒤로 가는 길 (첫 걸음은 들어온 칸 p, 그다음은 기본 뒤 칸). 출발 칸 너머로는 안 감
export function backPath(piece, n) {
  const path = []
  let cur = piece?.n
  for (let i = 0; i < n; i++) {
    const back = i === 0 && piece.p && piece.p !== 'home' ? piece.p : PREV[cur]
    if (!back || cur === START) break
    path.push(back)
    cur = back
  }
  return path
}

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
