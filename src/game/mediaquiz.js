// 노래 맞히기 · 이모지 영화 맞히기 (팀 대결, 주관식) — 화면·서버 함수가 같이 쓰는 것 (브라우저 전용 코드 없음)
// 10/30 사용자: 노래는 처음부터 1초 → 모두 '잘 모르겠어요'를 누르면 3초 → 5초(+초성 힌트), 가장 빨리 맞힌 사람이 정답.
// 10/31 사용자: 노래·영화는 다른 게임으로 (드라마는 지움). 노래 5곡 중 4곡은 지금 Apple Music 한국 차트(Top 100)에서,
// 영화는 이모지 6~8개 → + 연도·주연 → + 초성 (사진 안 씀). 맞힌 사람 팀 +1, 맞힌 문제가 적은 팀이 마심
import { TITLES } from './titles.js'
export { TITLES }

export const SONG_GAME = '노래 맞히기'
export const MOVIE_GAME = '이모지 영화 맞히기'
// 게임 종류 (pending.kind) — 진행·답·결과는 둘이 같은 방식
export const MQ_KINDS = ['songQuiz', 'movieQuiz']
export const isMqKind = (kind) => MQ_KINDS.includes(kind)
export const MQ_INFO = { songQuiz: { emoji: '🎵', title: SONG_GAME }, movieQuiz: { emoji: '🎬', title: MOVIE_GAME } }
export const MQ_CATS = {
  song: { emoji: '🎵', name: '노래' },
  movie: { emoji: '🎬', name: '영화' },
}

// ---------- 진행 ----------
export const MQ_ROUNDS = 5 // 한 게임 문제 수 (노래는 미리듣기를 못 찾으면 줄어듦)
export const MQ_CHART_PICK = 4 // 노래 5곡 중 지금 차트에서 (10/31 사용자: 최근 곡을 더 많이), 나머지는 목록에서
export const MQ_MIN_ROUNDS = 3 // 이보다 적게 찾으면 시작 안 함
export const MQ_STAGES = 3 // 노래 1초 · 3초 · 5초(+초성) / 영화 이모지 · +연도·주연 · +초성
export const MQ_CLIP_MS = [1000, 3000, 5000] // 단계별로 들려주는 길이
export const MQ_CLIP_FROM = 0 // 미리듣기 처음부터 (10/30 사용자)
export const MQ_STAGE_TIMEOUT_MS = 25000 // 안 누르는 사람이 있어도 한 단계에 25초 지나면 다음 단계로 (마지막 단계면 정답 공개)
export const MQ_GAP_MS = 6500 // 정답 공개
export const MQ_REVEAL_CLIP_MS = 5500 // 정답 공개 때 들려주는 길이
// 문제 종류 k: 'a' 노래(소리) · 'e' 영화(이모지)
export const MQ_STAGE_NAMES = { a: ['1초', '3초', '5초 + 초성'], e: ['이모지', '+ 연도·주연', '+ 초성'] }
export const MQ_STAGE_SHORT = { a: ['1초', '3초', '5초'], e: ['이모지', '연도·주연', '초성'] }
export const MQ_WIN_TEXT = { a: ['1초 듣고 맞힘', '3초 듣고 맞힘', '5초 듣고 맞힘'], e: ['이모지만 보고 맞힘', '연도·주연 보고 맞힘', '초성 보고 맞힘'] }
export const mqKindOf = (item) => (item?.c === 'song' ? 'a' : 'e')
// 문제의 제목 정보: 목록 번호(i) 또는 차트 곡이면 문제에 같이 저장한 x { c: 'song', t, by, a, y, id, rank }
export const mqItem = (r) => (r?.x && typeof r.x === 'object' ? r.x : TITLES[r?.i]) || null
// 이모지를 하나씩 (👨‍👧·1️⃣·🇰🇷 처럼 여러 글자로 된 것도 하나로). 못 나누는 옛 브라우저면 null → 통째로 보여 줌
export function emojiList(s) {
  try {
    if (typeof Intl === 'undefined' || !Intl.Segmenter) return null
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(s || ''))].map((x) => x.segment).filter((x) => x.trim())
  } catch {
    return null
  }
}
// 영화 2단계 힌트: 2016년 · 공유 · 정유미 · 마동석
export const movieHint = (item) => [item?.y ? `${item.y}년` : '', item?.h || ''].filter(Boolean).join(' · ')

// pending (stage 'play'): startAt = 첫 문제 시작(3·2·1 뒤), n = 문제 수, rounds = [{ i, k: 'a', u: 미리듣기, s: 출처, l: 링크, x?: 차트 곡 } | { i, k: 'e' }]
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

// 글자 수 힌트: 글자·숫자는 □, 띄어쓰기·문장부호는 그대로 (응답하라 1988 → □□□□ □□□□)
export const blanksHint = (t) => String(t || '').replace(/[\p{L}\p{N}]/gu, '□').replace(/\s+/g, ' ').trim()
// 초성 힌트: 한글은 초성, 영어는 단어 첫 글자 + 나머지는 ·, 숫자는 그대로 (부산행 → ㅂㅅㅎ, Hype Boy → H··· B··)
// 숫자뿐인 제목(1987·200%)은 첫 숫자만 (힌트가 곧 정답이 되지 않게)
export function chosungHint(t) {
  const s = String(t || '')
  if (!/[\p{L}]/u.test(s)) return s.replace(/\d/g, (d, i) => (i === s.search(/\d/) ? d : '·'))
  // 영어 낱말은 첫 글자만 (한 글자 낱말은 맨 처음 것만 보여 줌: D.P. → D.·.)
  let first = true
  const latin = s.replace(/[A-Za-z\u00C0-\u024F]+/g, (w) => {
    const keep = w.length >= 2 || first
    first = false
    return (keep ? w[0].toUpperCase() : '·') + '·'.repeat(w.length - 1)
  })
  let out = ''
  for (const ch of latin) {
    const c = ch.charCodeAt(0) - 0xac00
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch
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
// 노래 후보 (목록에서): 미리듣기를 못 찾는 곡이 있을 수 있어서 넉넉하게 7곡 (한 판 안에서 나온 건 빼고, 다 썼으면 처음부터)
const pool = (c, used, list) => {
  const u = new Set((used || []).map(Number))
  const all = list.map((x, i) => i).filter((i) => list[i] && !list[i].off && list[i].c === c)
  const fresh = all.filter((i) => !u.has(i))
  return fresh.length >= MQ_ROUNDS ? fresh : all
}
export function pickSongCandidates(used = [], rand = Math.random, n = 7, list = TITLES) {
  return shuffled(pool('song', used, list), rand).slice(0, n)
}
// 영화 5문제 (번호)
export function pickMovieRounds(used = [], rand = Math.random, n = MQ_ROUNDS, list = TITLES) {
  return shuffled(pool('movie', used, list).filter((i) => list[i].e), rand).slice(0, n)
}

// ---------- 지금 차트 (Apple Music 한국 Top 100, /api/media?chart=1) ----------
// 제목 정리: 괄호 속 feat.·버전 표시는 빼고 (삐그덕 (feat. 아이유) → 삐그덕), 괄호 속 다른 이름은 정답으로도 (한시 오분 (1:05) → 1:05)
const TAG = /\b(feat|ft|with|prod|narr|from|ver|version|remix|mix|live|acoustic|inst|instrumental|sped|slowed|edit|korean|english|japanese|chinese|original|soundtrack|ost|remaster(ed)?)\b|버전|리믹스/i
export function chartTitle(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim()
  const alt = []
  let t = raw.replace(/\s*[([]([^)\]]*)[)\]]/g, (m, inner) => {
    const x = inner.trim()
    if (x && !TAG.test(x)) alt.push(x)
    return ' '
  })
  t = t.replace(/\s+-\s+(from|feat|ft|remaster|live|remix|prod)\b.*$/i, '').replace(/\s+/g, ' ').trim()
  if (!normTitle(t)) t = raw
  const nt = normTitle(t)
  return { t, a: [raw, ...alt].filter((x, i, arr) => normTitle(x) && normTitle(x) !== nt && arr.indexOf(x) === i) }
}
// 가수가 같은지 (A2O & A2O LITE ⊃ A2O LITE, 아이유 = IU 처럼 목록에 적어 둔 이름 중 하나)
function sameArtist(chartArtist, item) {
  const f = normTitle(chartArtist)
  if (!f) return false
  return [item.by, ...(item.s || [])].map(normTitle).some((n) => n && n.length >= 2 && (f.includes(n) || n.includes(f)))
}
// 차트 곡 { id, rank, name, artist, y, url, link } → 문제 정보 x { c: 'song', t, by, a, y?, id, rank, j? }
// 목록에 같은 곡이 있으면(j) 그 곡의 영어 제목·별칭도 정답 (NEON → 네온)
export function chartItem(song, list = TITLES) {
  const { t, a } = chartTitle(song?.name)
  const nt = normTitle(t)
  const j = list.findIndex((x) => x && x.c === 'song' && titleAnswers(x).includes(nt) && sameArtist(song?.artist, x))
  const twin = j >= 0 ? list[j] : null
  const alias = [...a, ...(twin ? [twin.t, twin.en, ...(twin.a || [])] : [])].filter((x, i, arr) => x && normTitle(x) !== nt && arr.findIndex((y) => normTitle(y) === normTitle(x)) === i)
  const x = { c: 'song', t, by: String(song?.artist || '').trim(), a: alias, id: String(song?.id || ''), rank: Number(song?.rank) || 0 }
  if (Number(song?.y) > 0) x.y = Number(song.y)
  if (j >= 0) x.j = j
  return x
}
// 차트에서 n곡: 위쪽일수록 자주 (가중치 1/(순위+15)), 한 판 안에서 나온 곡('c<id>' 또는 목록 번호)은 빼고
export function pickChartSongs(chart, used = [], n = MQ_CHART_PICK, rand = Math.random, list = TITLES) {
  const u = new Set((used || []).map(String))
  const cand = (Array.isArray(chart) ? chart : [])
    .filter((s) => s && s.id && s.url && s.name && !u.has(`c${s.id}`))
    .map((s) => ({ s, x: chartItem(s, list), w: 1 / ((Number(s.rank) || 100) + 15) }))
    .filter(({ x }) => normTitle(x.t) && !(x.j != null && u.has(String(x.j))))
  const out = []
  const seen = new Set()
  while (out.length < n && cand.length) {
    let r = rand() * cand.reduce((acc, c) => acc + c.w, 0)
    let k = 0
    for (; k < cand.length - 1; k++) {
      r -= cand[k].w
      if (r <= 0) break
    }
    const [c] = cand.splice(k, 1)
    const key = `${normTitle(c.x.t)}|${normTitle(c.x.by)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out.map(({ s, x }) => ({ x, url: s.url, link: s.link || '' }))
}
