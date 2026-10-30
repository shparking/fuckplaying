// 드라마·영화·노래 맞히기 (팀 대결, 주관식) — 화면·서버 함수가 같이 쓰는 것 (브라우저 전용 코드 없음)
// 10/30 사용자: 노래는 처음부터 1초 → 모두 '잘 모르겠어요'를 누르면 3초 → 5초(+초성 힌트), 가장 빨리 맞힌 사람이 정답.
// 영화·드라마도 같은 방식으로 장면 사진이 흐릿 → 조금 선명 → 선명(+초성). 맞힌 사람 팀 +1, 맞힌 문제가 적은 팀이 마심
import { TITLES } from './titles.js'
export { TITLES }

export const MQ_GAME = '드라마·영화·노래 맞히기'
export const MQ_CATS = {
  song: { emoji: '🎵', name: '노래' },
  movie: { emoji: '🎬', name: '영화' },
  drama: { emoji: '📺', name: '드라마' },
}

// ---------- 진행 ----------
export const MQ_ROUNDS = 5 // 한 게임 문제 수 (미리듣기·사진을 못 찾으면 줄어듦)
export const MQ_MIN_ROUNDS = 3 // 이보다 적게 찾으면 시작 안 함
export const MQ_STAGES = 3 // 1초 · 3초 · 5초(+초성) / 흐릿 · 조금 선명 · 선명(+초성)
export const MQ_CLIP_MS = [1000, 3000, 5000] // 단계별로 들려주는 길이
export const MQ_CLIP_FROM = 0 // 미리듣기 처음부터 (10/30 사용자)
export const MQ_STAGE_TIMEOUT_MS = 25000 // 안 누르는 사람이 있어도 한 단계에 25초 지나면 다음 단계로 (마지막 단계면 정답 공개)
export const MQ_GAP_MS = 6500 // 정답 공개
export const MQ_REVEAL_CLIP_MS = 5500 // 정답 공개 때 들려주는 길이
export const MQ_BLUR = [26, 13, 5] // 단계별 사진 흐림 (px)
export const MQ_STAGE_NAMES = { a: ['1초', '3초', '5초 + 초성'], v: ['흐릿', '조금 선명', '선명 + 초성'] }

// pending (stage 'play'): startAt = 첫 문제 시작(3·2·1 뒤), n = 문제 수, rounds = [{ i, k: 'a'|'v', u, s, l }]
//   rs/r{q} = { s1, s2: 단계가 바뀐 시각, end: 문제가 끝난 시각 } (걸린 사람 폰이 씀)
//   answers/r{q}/{pid} = { at: 맞힌 시각, st: 그때 단계 } (맞힌 것만) — 가장 빠른 at 이 정답
//   pass/r{q}/s{단계}/{pid} = true ('잘 모르겠어요'), wrong/r{q}/{pid} = 마지막 오답 (공개 때 보여 줌)
// 다음 문제는 앞 문제 end + 정답 공개 시간에 저절로 시작 (모든 폰이 같은 계산)
const toArr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : [])
export const mqRounds = (p) => toArr(p?.rounds)
export const mqN = (p) => Math.max(1, Number(p?.n) || mqRounds(p).length || MQ_ROUNDS)
export function mqPhase(p, nowMs) {
  if (!p || p.stage !== 'play' || !p.startAt) return { phase: p?.stage || 'ready' }
  if (nowMs < p.startAt) return { phase: 'count', left: p.startAt - nowMs }
  const n = mqN(p)
  let at = p.startAt
  for (let q = 0; q < n; q++) {
    const r = p.rs?.[`r${q}`] || {}
    if (!r.end) {
      const st = r.s2 ? 2 : r.s1 ? 1 : 0
      return { phase: 'q', q, at, st, stAt: [at, r.s1, r.s2][st] }
    }
    if (nowMs < r.end + MQ_GAP_MS) return { phase: 'gap', q, at, end: r.end, left: r.end + MQ_GAP_MS - nowMs }
    at = r.end + MQ_GAP_MS
  }
  return { phase: 'final' }
}
// 그 문제를 가장 먼저 맞힌 사람 { pid, at, st } (없으면 null)
export function mqWinner(p, q) {
  const a = p?.answers?.[`r${q}`] || {}
  let best = null
  for (const [pid, x] of Object.entries(a)) {
    const at = Number(x?.at)
    if (!Number.isFinite(at)) continue
    if (!best || at < best.at || (at === best.at && pid < best.pid)) best = { pid, at, st: Number(x.st) || 0 }
  }
  return best
}

// ---------- 정답 비교 ----------
// 소문자, 띄어쓰기·문장부호·기호 빼기, 전각 → 반각, 라틴 악센트 빼기 (ROSÉ → rose)
export function normTitle(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[À-ɏ]/g, (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
// 한글 음절 → 자모 (오타를 자모 단위로 셈: 부산헹 → 부산행 한 글자 차이)
export function jamo(s) {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00
    if (c >= 0 && c < 11172) out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28]
    else out += ch
  }
  return out
}
function lev(a, b) {
  const A = [...a]
  const B = [...b]
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j)
  for (let i = 1; i <= A.length; i++) {
    const cur = [i]
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[B.length]
}
// 허용 오타 (자모 수 기준): 짧은 제목은 정확히, 길수록 조금 더
const typoOk = (n) => (n >= 28 ? 3 : n >= 16 ? 2 : n >= 8 ? 1 : 0)
function close(ans, target) {
  if (!ans || !target) return false
  if (ans === target) return true
  // 숫자는 정확히 (응답하라 1988 ≠ 1997)
  if (ans.replace(/\D/g, '') !== target.replace(/\D/g, '')) return false
  const ja = jamo(ans)
  const jt = jamo(target)
  const k = typoOk([...jt].length)
  if (!k || Math.abs([...ja].length - [...jt].length) > k) return false
  return lev(ja, jt) <= k
}
// 정답으로 받는 것들 (정규화해서)
export function titleAnswers(item) {
  if (!item) return []
  return [item.t, item.en, ...(item.a || [])]
    .filter(Boolean)
    .map(normTitle)
    .filter((x, i, arr) => x && arr.indexOf(x) === i)
}
export function isTitleAnswer(input, item) {
  const a = normTitle(input)
  if (!a || !item) return false
  return titleAnswers(item).some((t) => close(a, t))
}

// 초성 힌트: 한글은 초성, 영어는 단어 첫 글자 + 나머지는 ·, 숫자는 그대로 (부산행 → ㅂㅅㅎ, Hype Boy → H··· B··)
// 숫자뿐인 제목(1987·200%)은 첫 숫자만 (힌트가 곧 정답이 되지 않게)
export function chosungHint(t) {
  const s = String(t || '')
  if (!/[\p{L}]/u.test(s)) return s.replace(/\d/g, (d, i) => (i === s.search(/\d/) ? d : '·'))
  let out = ''
  let prevLatin = false
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00
    if (c >= 0 && c < 11172) {
      out += CHO[Math.floor(c / 588)]
      prevLatin = false
    } else if (/[A-Za-zÀ-ɏ]/.test(ch)) {
      out += prevLatin ? '·' : ch.toUpperCase()
      prevLatin = true
    } else {
      out += ch
      prevLatin = false
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

// ---------- 문제 고르기 ----------
function shuffled(list, rand) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
// 미리듣기·사진을 찾아볼 후보: 노래 7곡 + 영화 3편 + 드라마 3편 (한 판 안에서 나온 건 빼고, 다 썼으면 처음부터)
// 몇 개는 못 찾을 수 있어서 넉넉하게 → arrangeMediaRounds 가 찾은 것 중에서 5문제를 만듦
export function pickMediaCandidates(used = [], rand = Math.random, list = TITLES) {
  const u = new Set((used || []).map(Number))
  const pool = (c) => {
    const all = list.map((x, i) => i).filter((i) => list[i] && !list[i].off && list[i].c === c)
    const fresh = all.filter((i) => !u.has(i))
    return shuffled(fresh.length >= 3 ? fresh : all, rand)
  }
  return { songs: pool('song').slice(0, 7), screens: [...pool('movie').slice(0, 3), ...pool('drama').slice(0, 3)] }
}
// 찾은 것들 → 문제 순서 (노래 3 + 영화·드라마 2, 또는 반대, 번갈아). 한쪽이 모자라면 다른 쪽으로 채움
// songs·screens: [[번호, 미디어], ...] (앞에서부터 씀)
export function arrangeMediaRounds(songs, screens, n = MQ_ROUNDS, rand = Math.random) {
  const V0 = shuffled(screens, rand)
  let ns = rand() < 0.5 ? Math.ceil(n / 2) : Math.floor(n / 2)
  let nv = n - ns
  if (V0.length < nv) {
    nv = V0.length
    ns = Math.min(songs.length, n - nv)
  }
  if (songs.length < ns) {
    ns = songs.length
    nv = Math.min(V0.length, n - ns)
  }
  const S = songs.slice(0, ns)
  const V = V0.slice(0, nv)
  const out = []
  let turnS = ns >= nv
  while (S.length || V.length) {
    if ((turnS && S.length) || !V.length) out.push(S.shift())
    else out.push(V.shift())
    turnS = !turnS
  }
  return out
}
