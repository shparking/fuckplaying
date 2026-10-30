// Vercel 서버 함수 — 드라마·영화·노래 맞히기 문제의 소리·사진 찾기
//   GET /api/media?i=문제번호(src/game/titles.js 순서)
//     → { ok: true, kind: 'audio', url, src: 'deezer'|'apple', link, name, artist }   노래: 30초 미리듣기
//     → { ok: true, kind: 'image', url, urls, src: 'tmdb', link, name, year }        영화·드라마: 글자 없는 장면 사진
//     → { ok: false, why: 'notfound'|'nokey'|'badkey'|'bad'|'error' }
//   ?debug=1 이면 찾아본 검색어·후보도 같이 (확인 화면 ?mediacheck=1 용)
//   ?ping=1 → { ok: true, ping: true, tmdb: 'set'|'none' } (서버 함수가 살아 있는지 + TMDB 키를 넣었는지만, 밖으로는 안 부름)
// 노래는 Deezer 먼저 (키 없음, 약관: 비상업·사적 이용), 없으면 Apple(iTunes) 미리듣기
// 사진은 TMDB (비상업 무료, 출처 표시) — Vercel 환경 변수 TMDB_TOKEN(API 읽기 액세스 토큰) 또는 TMDB_KEY(API 키). 없으면 nokey
// 번호로만 찾음 (아무 검색어나 대신 찾아 주는 통로가 되지 않게)
import { TITLES } from '../src/game/titles.js'
import { normTitle } from '../src/game/mediaquiz.js'

const UA = 'juruyut/1.0 (+https://fuckplaying.vercel.app)'
// 같은 서버 인스턴스 안에서 잠깐 기억 (확인 화면처럼 한꺼번에 부를 때 덜 부르게)
const memo = new Map()
const MEMO_MS = { audio: 4 * 60 * 1000, image: 6 * 60 * 60 * 1000, miss: 60 * 1000 }

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

function tmdbAuth(env) {
  const tok = String(env.TMDB_TOKEN || '').trim()
  const key = String(env.TMDB_KEY || '').trim()
  if (tok.length > 40) return { headers: { authorization: `Bearer ${tok}` }, qs: '' } // 읽기 액세스 토큰 (긴 것)
  const k = key || tok // 짧은 것은 API 키
  return k ? { headers: {}, qs: `&api_key=${encodeURIComponent(k)}` } : null
}
const yearOf = (x) => Number(String(x?.release_date || x?.first_air_date || '').slice(0, 4)) || 0
function bestShow(list, item) {
  const names = titleNames(item)
  let best = null
  let bs = 0
  list.slice(0, 12).forEach((x, k) => {
    const ts = Math.max(0, ...[x.title, x.original_title, x.name, x.original_name].filter(Boolean).map((n) => titleScore(n, names)))
    if (!ts) return
    const yr = yearOf(x)
    const ys = item.y && yr ? (yr === item.y ? 2 : Math.abs(yr - item.y) === 1 ? 1 : -2) : 0
    const sc = ts * 3 + ys * 2 + (k === 0 ? 1 : 0)
    if (sc > bs) {
      bs = sc
      best = x
    }
  })
  return best
}
const textless = (b) => b && b.file_path && (b.iso_639_1 == null || b.iso_639_1 === 'xx')
async function fromTmdb(item, f, env, dbg) {
  const auth = tmdbAuth(env)
  if (!auth) return { ok: false, why: 'nokey' }
  const type = item.c === 'drama' ? 'tv' : 'movie'
  const yk = type === 'tv' ? 'first_air_date_year' : 'year'
  const tries = [[item.t, item.y], [item.t, 0], item.en ? [item.en, item.y] : null, item.en ? [item.en, 0] : null].filter(Boolean)
  const base = 'https://api.themoviedb.org/3'
  for (const [q, y] of tries) {
    const j = await getJson(f, `${base}/search/${type}?query=${encodeURIComponent(q)}&language=ko-KR&include_adult=false${y ? `&${yk}=${y}` : ''}${auth.qs}`, auth.headers)
    if (j?._status === 401) return { ok: false, why: 'badkey' }
    const list = Array.isArray(j?.results) ? j.results : []
    const hit = bestShow(list, item)
    dbg?.push({ src: 'tmdb', q, y: y || undefined, n: list.length, err: j?._status || j?._error || undefined, top: list.slice(0, 3).map((x) => `${x.title || x.name} (${yearOf(x) || '?'})`), hit: hit ? `${hit.title || hit.name} (${yearOf(hit) || '?'})` : undefined })
    if (!hit) continue
    // 글자 없는(언어 없는) 장면 사진, 표 많은 순 4장 (없으면 기본 배경 1장)
    let im = await getJson(f, `${base}/${type}/${hit.id}/images?include_image_language=null${auth.qs}`, auth.headers)
    let bd = (Array.isArray(im?.backdrops) ? im.backdrops : []).filter(textless)
    if (!bd.length) {
      im = await getJson(f, `${base}/${type}/${hit.id}/images?${auth.qs.slice(1)}`, auth.headers)
      bd = (Array.isArray(im?.backdrops) ? im.backdrops : []).filter(textless)
    }
    bd.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.vote_average || 0) - (a.vote_average || 0))
    const paths = bd.length ? uniq(bd.slice(0, 4).map((b) => b.file_path)) : hit.backdrop_path ? [hit.backdrop_path] : []
    dbg?.push({ src: 'tmdb-images', id: hit.id, n: bd.length })
    if (!paths.length) continue
    const urls = paths.map((p) => `https://image.tmdb.org/t/p/w780${p}`)
    return { ok: true, kind: 'image', url: urls[0], urls, src: 'tmdb', link: `https://www.themoviedb.org/${type}/${hit.id}`, name: hit.title || hit.name || '', year: yearOf(hit) || undefined }
  }
  return null
}

// 문제 하나의 소리·사진 찾기 (시험할 때 fetch·env 를 바꿔 넣을 수 있게 따로)
export async function findMedia(i, { fetch: f = globalThis.fetch, env = process.env, debug = false, now = Date.now() } = {}) {
  const item = Number.isInteger(i) && i >= 0 ? TITLES[i] : null
  if (!item || item.off) return { ok: false, why: 'bad' }
  const key = `${i}`
  const hit = !debug && memo.get(key)
  if (hit && hit.until > now) return hit.v
  const dbg = debug ? [] : null
  const fb = Object.assign((u, o) => f(u, o), { deadline: Date.now() + BUDGET_MS }) // 이 문제만의 시간 제한 (동시에 여러 개 찾아도 따로)
  let out
  if (item.c === 'song') out = (await fromDeezer(item, fb, dbg)) || (await fromApple(item, fb, dbg)) || { ok: false, why: 'notfound' }
  else out = (await fromTmdb(item, fb, env, dbg)) || { ok: false, why: 'notfound' }
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
  if (u.searchParams.has('ping')) return send({ ok: true, ping: true, tmdb: tmdbAuth(process.env) ? 'set' : 'none' }, 'no-store')
  try {
    const out = await findMedia(i, { debug })
    // 미리듣기 주소는 시간이 지나면 막힐 수 있어서 잠깐만, 사진은 하루 캐시
    const cache = debug || out.why === 'nokey' || out.why === 'badkey' || out.why === 'bad' ? 'no-store' : out.ok ? (out.kind === 'audio' ? 'public, s-maxage=240' : 'public, s-maxage=86400, stale-while-revalidate=604800') : 'public, s-maxage=60'
    send(out, cache)
  } catch {
    send({ ok: false, why: 'error' }, 'no-store')
  }
}
