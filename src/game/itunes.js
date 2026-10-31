// 지금 차트 곡 미리듣기를 이 폰에서 Apple(iTunes)에 곡 번호로 직접 물어보기
// 10/31 사용자 '차트를 못 불러와서 이번엔 목록 곡만 — 이런 오류 없애줘': 서버 함수(Vercel)에서 부르면 Apple 이 막거나
// 한국 스토어에 미리듣기가 없을 때가 있어서, 서버가 미리듣기를 못 받은 곡은 폰마다 따로 물어봄
// JSONP (Apple 검색 API 가 공식으로 주는 callback 방식) — 숫자 번호만 보내고, https 미리듣기 주소만 씀
// 한국 스토어와 미국 스토어를 같이 물어보고 한국 것을 먼저 씀
let seq = 0
function jsonp(url, ms) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return resolve(null)
    const cb = `__mqItunes${Date.now().toString(36)}${seq++}`
    const s = document.createElement('script')
    let timer = null
    let over = false
    const done = (v) => {
      if (over) return
      over = true
      clearTimeout(timer)
      window[cb] = () => {} // 늦게 와도 오류 안 나게 빈 함수로 남겨 둠
      s.remove()
      resolve(v)
    }
    window[cb] = (data) => done(data && typeof data === 'object' ? data : null)
    s.onerror = () => done(null)
    timer = setTimeout(() => done(null), ms)
    s.async = true
    s.src = `${url}&callback=${cb}`
    document.head.appendChild(s)
  })
}
// 곡 번호들 → Map(번호 → { url, link }) (못 찾은 건 없음)
export async function itunesPreviews(ids, ms = 4500) {
  const ok = [...new Set((ids || []).map(String).filter((x) => /^\d{1,15}$/.test(x)))].slice(0, 50)
  const out = new Map()
  if (!ok.length) return out
  const res = await Promise.all(['KR', 'US'].map((cc) => jsonp(`https://itunes.apple.com/lookup?id=${ok.join(',')}&country=${cc}`, ms)))
  for (const j of res)
    for (const r of Array.isArray(j?.results) ? j.results : []) {
      const id = String(r?.trackId || '')
      const url = String(r?.previewUrl || '')
      if (id && ok.includes(id) && /^https:\/\//.test(url) && !out.has(id)) out.set(id, { url, link: /^https:\/\//.test(r.trackViewUrl || '') ? r.trackViewUrl : '' })
    }
  return out
}
