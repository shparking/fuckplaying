// 노래 맞히기: 걸린 사람 폰에서 미리듣기를 1초·3초·5초씩 틀기 (소리는 이 폰 하나에서만 나옴)
// 휴대폰 브라우저는 사람이 누르는 순간에 한 번 소리를 내야 그 뒤에도 소리를 낼 수 있음 → 시작 버튼을 누를 때 mqUnlock()
// <audio> 하나를 계속 씀 (주소만 바꿈). 무음 모드에서도 나오는 미디어 소리
// 10/31 사용자 '노래가 가끔 오류로 계속 나옴' → 멈추는 길을 여러 개로:
//   ① 재생 위치가 끝 지점을 넘으면 멈춤 (timeupdate — play() 약속이 안 끝나거나 실패해도)
//   ② 실제로 소리가 난 순간(playing)부터 길이만큼 타이머
//   ③ 무슨 일이 있어도 '길이 + 8초' 뒤엔 멈춤
//   ④ 화면을 끄거나 다른 앱으로 가면 바로 멈춤 (그동안은 타이머가 안 돌 수 있음) → 돌아오면 '다시 듣기' 버튼
//   ⑤ 잠금 화면·알림의 재생 버튼으로는 다시 안 틀어짐
let el = null
let curUrl = ''
let token = 0
let silent = ''
let clip = null // 지금 트는 것 { my, until(재생 위치 초), ms, onCut, wall, hard }

// 0.1초짜리 무음 wav (잠금 풀기용)
function silentWav() {
  const n = 800
  const buf = new Uint8Array(44 + n)
  const dv = new DataView(buf.buffer)
  const w = (o, s) => [...s].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)))
  w(0, 'RIFF')
  dv.setUint32(4, 36 + n, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true)
  dv.setUint16(22, 1, true)
  dv.setUint32(24, 8000, true)
  dv.setUint32(28, 8000, true)
  dv.setUint16(32, 1, true)
  dv.setUint16(34, 8, true)
  w(36, 'data')
  dv.setUint32(40, n, true)
  buf.fill(128, 44)
  let s = ''
  buf.forEach((b) => (s += String.fromCharCode(b)))
  return 'data:audio/wav;base64,' + btoa(s)
}
// 지금 클립 끝내기 (타이머 정리 + 멈춤)
function endClip() {
  if (clip) {
    clearTimeout(clip.wall)
    clearTimeout(clip.hard)
  }
  clip = null
  try {
    el?.pause()
  } catch {}
}
export function mqAudio() {
  if (!el && typeof Audio !== 'undefined') {
    el = new Audio()
    el.preload = 'auto'
    el.loop = false
    el.setAttribute('playsinline', '')
    // ① 재생 위치로 멈춤
    el.addEventListener('timeupdate', () => {
      if (clip && el.currentTime >= clip.until - 0.04) endClip()
    })
    // ② 실제로 소리가 나기 시작한 순간부터 길이만큼
    el.addEventListener('playing', () => clip?.arm())
    // 클립이 없는데 소리가 나면 (잠금 화면 재생 버튼 등) 바로 멈춤
    el.addEventListener('play', () => {
      if (!clip && curUrl) setTimeout(() => !clip && el && !el.paused && el.pause(), 0)
    })
    // ④ 화면을 끄거나 다른 앱으로 가면 멈춤
    if (typeof document !== 'undefined') {
      const hide = () => {
        if (!clip) return
        const cut = clip.onCut
        endClip()
        cut?.()
      }
      document.addEventListener('visibilitychange', () => document.hidden && hide())
      addEventListener('pagehide', hide)
    }
    // ⑤ 잠금 화면·알림의 재생 버튼은 아무것도 안 함, 멈춤 버튼은 멈춤
    try {
      navigator.mediaSession?.setActionHandler?.('play', () => {})
      navigator.mediaSession?.setActionHandler?.('pause', () => endClip())
    } catch {}
  }
  return el
}
// 시작 버튼을 누르는 순간 (사람이 누른 그 처리 안에서) 부르기
export function mqUnlock() {
  const a = mqAudio()
  if (!a) return
  try {
    if (!silent) silent = silentWav()
    token++
    endClip()
    curUrl = ''
    a.src = silent
    const pr = a.play()
    pr?.catch?.(() => {})
  } catch {}
}
function load(url) {
  const a = mqAudio()
  if (!a || !url) return null
  if (curUrl !== url) {
    curUrl = url
    a.src = url
    try {
      a.load()
    } catch {}
  }
  return a
}
// 잠금 화면·알림에 곡 이름이 뜨지 않게 (스포 방지)
function hideTitle() {
  try {
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({ title: '🎵 노래 맞히기', artist: '주루윷놀이' })
  } catch {}
}
// url 을 from 초부터 ms 동안 틀기. 브라우저가 소리를 막거나 (화면을 꺼서) 중간에 끊기면 onBlocked() → '소리 켜기·다시 듣기' 버튼
export function mqPlay(url, from, ms, onBlocked) {
  const a = load(url)
  if (!a) return
  const my = ++token
  if (clip) {
    clearTimeout(clip.wall)
    clearTimeout(clip.hard)
  }
  const c = { my, until: from + ms / 1000, ms, onCut: onBlocked, wallSet: false, wall: null, hard: null }
  c.arm = () => {
    if (clip !== c || c.wallSet) return
    c.wallSet = true
    clearTimeout(c.wall)
    c.wall = setTimeout(() => clip === c && endClip(), ms)
  }
  clip = c
  // ③ 무슨 일이 있어도 (불러오는 시간 포함) 길이 + 8초 뒤엔 멈춤
  c.hard = setTimeout(() => clip === c && endClip(), ms + 8000)
  const go = () => {
    if (my !== token || clip !== c) return
    try {
      a.currentTime = from
    } catch {}
    hideTitle()
    let pr
    try {
      pr = a.play()
    } catch (e) {
      endClip()
      onBlocked?.(e)
      return
    }
    // 이미 틀고 있던 소리면 playing 이 다시 안 옴 → 약속이 끝나면 타이머. 약속이 실패해도 ①·③ 이 지켜 줌
    // 진짜로 막힌 것(NotAllowed 등)만 버튼, 우리가 끊은 것(AbortError)은 조용히
    if (pr && pr.then)
      pr.then(c.arm, (e) => {
        if (clip !== c || e?.name === 'AbortError') return
        endClip()
        onBlocked?.(e)
      })
    else c.arm()
  }
  if (a.readyState >= 1) go()
  else {
    const h = () => {
      a.removeEventListener('loadedmetadata', h)
      go()
    }
    a.addEventListener('loadedmetadata', h)
    // 3초 안에 준비가 안 되면 그냥 틀어 봄
    setTimeout(() => {
      if (my === token && a.readyState < 1) {
        a.removeEventListener('loadedmetadata', h)
        go()
      }
    }, 3000)
  }
}
// 쉬는 동안 다음 노래를 미리 받아 둠 (틀고 있으면 안 건드림)
export function mqPrime(url) {
  const a = mqAudio()
  if (!a || !url || clip || (!a.paused && !a.ended)) return
  load(url)
}
export function mqStop() {
  token++
  endClip()
}
