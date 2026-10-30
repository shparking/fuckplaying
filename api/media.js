// Vercel 서버 함수 — 노래 맞히기의 30초 미리듣기 찾기
//   GET /api/media?i=문제번호(src/game/titles.js 순서, 노래만 — 영화는 이모지 문제라 'bad')
//     → { ok: true, kind: 'audio', url, src: 'deezer'|'apple', link, name, artist }
//     → { ok: false, why: 'notfound'|'bad'|'error' }
//   GET /api/media?chart=1 (10/31) → { ok: true, songs: [{ id, rank, name, artist, y, url, link }] }
//     지금 Apple Music 한국 '많이 듣는 곡' Top 100 (RSS) + iTunes 로 미리듣기를 한꺼번에. 30분 캐시
//   ?debug=1 이면 찾아본 검색어·후보도 같이 (확인 화면 ?mediacheck=1 용)
//   ?ping=1 → { ok: true, ping: true } (서버 함수가 살아 있는지만, 밖으로는 안 부름)
// Deezer 먼저 (키 없음, 약관: 비상업·사적 이용), 없으면 Apple(iTunes) 미리듣기
// 번호·정해진 차트로만 찾음 (아무 검색어나 대신 찾아 주는 통로가 되지 않게)
import { TITLES } from '../src/game/titles.js'
import { normTitle } from '../src/game/mediaquiz.js'

const UA = 'juruyut/1.0 (+https://fuckplaying.vercel.app)'
// 같은 서버 인스턴스 안에서 잠깐 기억 (확인 화면처럼 한꺼번에 부를 때 덜 부르게)
const memo = new Map()
const MEMO_MS = { audio: 4 * 60 * 1000, miss: 60 * 1000 }

// 서버 함수 하나가 너무 오래 걸리지 않게: 문제 하나에 8초까지 (화면은 9초 기다림). fetchFn.deadline = 끝 시각
const BUDGET_MS = 8000
async function getJson(fetchFn, url, headers = {}, ms = 4000) {
  const left = (fetchFn.deadline ?? Infinity) - Date.now()
  if (left < 300) return { _error: 'timeout' }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => ctl?.abort(), Math.min(ms, left))
  try {
    const r = await fetchFn(url, { headers: { accept: 'application/json', 'user-agent': UA, ...headers }, signal: ctl?.signal })
    if (!r.ok) return { _status: r.status }
    return await r.json()
  } catch (e) {
    return { _error: String(e?.name || e) }
  } finally {
    clearTimeout(timer)
  }
}
const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i)
const strip = (s) => String(s || '').replace(/\(.*?\)|\[.*?\]/g, ' ')
// 제목이 맞는지: 3 = 똑같음, 2 = 한쪽이 다른 쪽을 품음 (좋은 날 (Good Day) ⊃ good day), 0 = 아님
function titleScore(found, names) {
  const fs = uniq([normTitle(found), normTitle(strip(found))])
  let best = 0
  for (const n of names)
    for (const f of fs) {
      if (f === n) return 3
      if (n.length >= 2 && (f.includes(n) || (f.length >= 3 && n.includes(f)))) best = 2
    }
  return best
}
function artistOk(found, names) {
  const f = normTitle(found)
  return !!f && names.some((n) => n && (f === n || f.includes(n) || (f.length >= 2 && n.includes(f))))
}
const titleNames = (item) => uniq([item.t, item.en, ...(item.a || [])].map(normTitle))
// 원곡이 아닌 것 (반주·리믹스·라이브 등)은 뒤로
const NOT_ORIGINAL = /\b(inst|instrumental|mr|remix|live|acoustic|karaoke|sped|slowed|cover|demo|edit|ver\.?|version)\b/i
function bestTrack(list, item) {
  const names = titleNames(item)
  const arts = uniq([...(item.s || []), item.by].map(normTitle))
  let best = null
  let bs = -Infinity
  for (const x of list) {
    if (!x || !x.preview) continue
    const ts = titleScore(x.name, names)
    if (!ts || !artistOk(x.artist, arts)) continue
    const sc = ts * 10 - (NOT_ORIGINAL.test(x.name || '') ? 15 : 0) + Math.min(5, (Number(x.rank) || 0) / 200000)
    if (sc > bs) {
      bs = sc
      best = x
    }
  }
  return best
}

async function fromDeezer(item, f, dbg) {
  const s = item.s?.length ? item.s : [item.by]
  const tt = item.en || item.t
  const qs = uniq([`artist:"${s[0]}" track:"${tt}"`, `${s[0]} ${tt}`, item.en ? `${s[0]} ${item.t}` : '', s[1] ? `${s[1]} ${item.t}` : ''])
  for (const q of qs) {
    const j = await getJson(f, `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=25`)
    const list = (Array.isArray(j?.data) ? j.data : []).map((x) => ({ name: x.title, artist: x.artist?.name, preview: x.preview, link: x.link, rank: x.rank }))
    const best = bestTrack(list, item)
    dbg?.push({ src: 'deezer', q, n: list.length, err: j?._status || j?._error || j?.error?.message || undefined, top: list.slice(0, 3).map((x) => `${x.artist} - ${x.name}`), hit: best ? `${best.artist} - ${best.name}` : undefined })
    if (best) return { ok: true, kind: 'audio', url: best.preview, src: 'deezer', link: best.link || '', name: best.name, artist: best.artist }
  }
  return null
}
async function fromApple(item, f, dbg) {
  const s = item.s?.length ? item.s : [item.by]
  // 한국 스토어 먼저 (한글 제목), 없으면 미국 스토어 (영어 제목)
  const tries = uniq([`KR|${item.by} ${item.t}`, `KR|${s[0]} ${item.en || item.t}`, s[1] ? `KR|${s[1]} ${item.t}` : '', `US|${s[0]} ${item.en || item.t}`])
  for (const tq of tries) {
    const [cc, q] = [tq.slice(0, 2), tq.slice(3)]
    const j = await getJson(f, `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=${cc}&media=music&entity=song&limit=25`)
    const list = (Array.isArray(j?.results) ? j.results : []).map((x) => ({ name: x.trackName, artist: x.artistName, preview: x.previewUrl, link: x.trackViewUrl, rank: 0 }))
    const best = bestTrack(list, item)
    dbg?.push({ src: `apple-${cc}`, q, n: list.length, err: j?._status || j?._error || undefined, top: list.slice(0, 3).map((x) => `${x.artist} - ${x.name}`), hit: best ? `${best.artist} - ${best.name}` : undefined })
    if (best) return { ok: true, kind: 'audio', url: best.preview, src: 'apple', link: best.link || '', name: best.name, artist: best.artist }
  }
  return null
}

// ---------- 지금 차트 (10/31 사용자: 아주 최근 노래도) ----------
const CHART_URL = 'https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/songs.json'
const CHART_MEMO_MS = 30 * 60 * 1000
let chartMemo = null
export async function findChart({ fetch: f = globalThis.fetch, now = Date.now(), fresh = false } = {}) {
  if (!fresh && chartMemo && chartMemo.until > now) return chartMemo.v
  const fb = Object.assign((u, o) => f(u, o), { deadline: Date.now() + BUDGET_MS })
  const j = await getJson(fb, CHART_URL, {}, 5000)
  const list = (Array.isArray(j?.feed?.results) ? j.feed.results : []).filter((x) => x && x.id && x.name && x.artistName).slice(0, 100)
  if (!list.length) return { ok: false, why: 'chart', err: j?._status || j?._error || undefined }
  // 미리듣기 주소: iTunes 에 번호로 한꺼번에 (50개씩)
  const parts = []
  for (let k = 0; k < list.length; k += 50) parts.push(list.slice(k, k + 50))
  const looks = await Promise.all(parts.map((ps) => getJson(fb, `https://itunes.apple.com/lookup?id=${ps.map((x) => encodeURIComponent(String(x.id))).join(',')}&country=KR`, {}, 5000)))
  const byId = new Map()
  for (const lk of looks) for (const r of Array.isArray(lk?.results) ? lk.results : []) if (r && r.trackId && r.previewUrl) byId.set(String(r.trackId), r)
  const songs = list
    .map((x, k) => {
      const r = byId.get(String(x.id))
      if (!r) return null
      const y = Number(String(x.releaseDate || r.releaseDate || '').slice(0, 4))
      return { id: String(x.id), rank: k + 1, name: String(x.name), artist: String(x.artistName), y: y > 1900 ? y : 0, url: r.previewUrl, link: r.trackViewUrl || x.url || '' }
    })
    .filter(Boolean)
  if (!songs.length) return { ok: false, why: 'chart', n: list.length, err: looks.map((lk) => lk?._status || lk?._error).filter(Boolean).join(',') || undefined }
  const out = { ok: true, songs, n: list.length, updated: String(j?.feed?.updated || '') }
  chartMemo = { v: out, until: now + CHART_MEMO_MS }
  return out
}

// 노래 하나의 미리듣기 찾기 (시험할 때 fetch 를 바꿔 넣을 수 있게 따로)
export async function findMedia(i, { fetch: f = globalThis.fetch, debug = false, now = Date.now() } = {}) {
  const item = Number.isInteger(i) && i >= 0 ? TITLES[i] : null
  if (!item || item.off || item.c !== 'song') return { ok: false, why: 'bad' }
  const key = `${i}`
  const hit = !debug && memo.get(key)
  if (hit && hit.until > now) return hit.v
  const dbg = debug ? [] : null
  const fb = Object.assign((u, o) => f(u, o), { deadline: Date.now() + BUDGET_MS }) // 이 문제만의 시간 제한 (동시에 여러 개 찾아도 따로)
  let out = (await fromDeezer(item, fb, dbg)) || (await fromApple(item, fb, dbg)) || { ok: false, why: 'notfound' }
  if (dbg) out = { ...out, debug: dbg }
  else if (out.ok || out.why === 'notfound') memo.set(key, { v: out, until: now + (out.ok ? MEMO_MS[out.kind] : MEMO_MS.miss) })
  return out
}

export default async function handler(req, res) {
  const u = new URL(req.url || '/', 'http://localhost')
  const i = Number(u.searchParams.get('i'))
  const debug = u.searchParams.has('debug')
  const send = (body, cache) => {
    res.statusCode = body.why === 'bad' ? 400 : 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', cache)
    res.end(JSON.stringify(body))
  }
  if (u.searchParams.has('ping')) return send({ ok: true, ping: true }, 'no-store')
  if (u.searchParams.has('chart')) {
    try {
      const out = await findChart({ fresh: debug })
      return send(out, out.ok && !debug ? 'public, s-maxage=1800, stale-while-revalidate=43200' : out.ok ? 'no-store' : 'public, s-maxage=60')
    } catch {
      return send({ ok: false, why: 'error' }, 'no-store')
    }
  }
  try {
    const out = await findMedia(i, { debug })
    // 미리듣기 주소는 시간이 지나면 막힐 수 있어서 잠깐만
    const cache = debug || out.why === 'bad' ? 'no-store' : out.ok ? 'public, s-maxage=240' : 'public, s-maxage=60'
    send(out, cache)
  } catch {
    send({ ok: false, why: 'error' }, 'no-store')
  }
}
