// 드라마·영화·노래 맞히기 (팀 대결, 주관식) — 화면·서버 함수가 같이 쓰는 것 (브라우저 전용 코드 없음)
// 문제마다 노래면 걸린 사람 폰에서 1초 → 3초 → 5초씩 미리듣기, 영화·드라마면 장면 사진이 흐릿 → 선명.
// 제목을 직접 써서 맞힘 (띄어쓰기·문장부호·대소문자·작은 오타 괜찮음). 빨리 맞힐수록 점수, 팀 점수 낮은 팀이 마심
import { TITLES } from './titles.js'
export { TITLES }

export const MQ_GAME = '드라마·영화·노래 맞히기'
export const MQ_CATS = {
  song: { emoji: '🎵', name: '노래' },
  movie: { emoji: '🎬', name: '영화' },
  drama: { emoji: '📺', name: '드라마' },
}

// ---------- 시간·점수 ----------
export const MQ_ROUNDS = 5 // 한 게임 문제 수 (미리듣기·사진을 못 찾으면 줄어듦)
export const MQ_MIN_ROUNDS = 3 // 이보다 적게 찾으면 시작 안 함
export const MQ_STAGE_AT = [0, 6000, 12000] // 문제 시작부터 단계가 바뀌는 때 (ms)
export const MQ_ANSWER_MS = 20000 // 문제마다 답하는 시간
export const MQ_GAP_MS = 6500 // 정답 공개
export const MQ_PTS = [1000, 700, 400] // 단계별 점수 (3단계는 초성 힌트)
export const MQ_GRACE_MS = 1500 // 글자 치는 시간 여유: 2단계가 되고 1.5초 안에 내면 아직 1단계 점수 (초성 힌트가 나온 3단계는 여유 없음)
export const MQ_CLIP_MS = [1000, 3000, 5000] // 단계별로 들려주는 길이
export const MQ_CLIP_FROM = 3 // 미리듣기 3초 지점부터 (앞부분이 작게 시작하는 곡이 있어서)
export const MQ_REVEAL_CLIP_MS = 5500 // 정답 공개 때 들려주는 길이
export const MQ_BLUR = [26, 13, 5] // 단계별 사진 흐림 (px)
export const mqStageAt = (t) => (t >= MQ_STAGE_AT[2] ? 2 : t >= MQ_STAGE_AT[1] ? 1 : 0)
// 낸 시각(문제 시작부터 ms) → 단계·점수
export function mqPointsAt(ms) {
  const t = Math.max(0, Number(ms) || 0)
  let st = mqStageAt(t)
  if (st === 1 && t - MQ_STAGE_AT[1] < MQ_GRACE_MS) st = 0
  return { st, pts: MQ_PTS[st] }
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
