// 드라마·영화·노래 맞히기: 걸린 사람 폰에서 미리듣기를 1초·3초·5초씩 틀기 (소리는 이 폰 하나에서만 나옴)
// 휴대폰 브라우저는 사람이 누르는 순간에 한 번 소리를 내야 그 뒤에도 소리를 낼 수 있음 → 시작 버튼을 누를 때 mqUnlock()
// <audio> 하나를 계속 씀 (주소만 바꿈). 무음 모드에서도 나오는 미디어 소리
let el = null
let curUrl = ''
let stopTimer = null
let token = 0
let silent = ''

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
export function mqAudio() {
  if (!el && typeof Audio !== 'undefined') {
    el = new Audio()
    el.preload = 'auto'
    el.setAttribute('playsinline', '')
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
    clearTimeout(stopTimer)
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
// url 을 from 초부터 ms 동안 틀기. 브라우저가 소리를 막으면 onBlocked()
export function mqPlay(url, from, ms, onBlocked) {
  const a = load(url)
  if (!a) return
  const my = ++token
  clearTimeout(stopTimer)
  const go = () => {
    if (my !== token) return
    try {
      a.currentTime = from
    } catch {}
    hideTitle()
    const arm = () => {
      if (my !== token) return
      clearTimeout(stopTimer)
      stopTimer = setTimeout(() => my === token && a.pause(), ms)
    }
    let pr
    try {
      pr = a.play()
    } catch (e) {
      onBlocked?.(e)
      return
    }
    if (pr && pr.then) pr.then(arm, (e) => my === token && onBlocked?.(e))
    else arm()
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
  if (!a || !url || (!a.paused && !a.ended)) return
  load(url)
}
export function mqStop() {
  token++
  clearTimeout(stopTimer)
  try {
    el?.pause()
  } catch {}
}
