// 노래 맞히기 소리 — 10/31 사용자 '노래는 참가자 모든 폰에서 나오도록': 모든 폰이 같은 서버 시각에 미리듣기의 같은 곳을 틂
//  - 클립 = { url, from: 미리듣기 몇 초부터, at: 그 소리가 들려야 하는 서버 시각(ms), ms: 길이 } — 모든 폰이 같은 값 (mediaquiz.js mqClip)
//  - 늦게 준비된 폰은 늦은 만큼 뒤에서부터 틀어서 다른 폰과 맞춤 (끝나는 때는 다 같음), 거의 다 지났으면 안 틂
//  - 휴대폰 브라우저(특히 아이폰)는 사람이 누르는 순간에 한 번 소리를 내야 그 뒤에도 소리를 낼 수 있음
//    → 시작 버튼 · '이 폰 소리 켜기' · 게임 화면에서 처음 누를 때 mqUnlock(). 그래도 막히면 onBlocked → '소리가 안 나면 눌러 주세요'
//  - <audio> 하나를 계속 씀 (주소만 바꿈). 무음 모드에서도 나오는 미디어 소리
// 10/31 '노래가 가끔 오류로 계속 나옴' → 멈추는 길을 여러 개로:
//   ① 재생 위치가 끝 지점을 넘으면 멈춤 (timeupdate — play() 약속이 안 끝나거나 실패해도)
//   ② 소리가 실제로 나기 시작한 순간 끝 지점까지 남은 만큼 타이머 + 구간이 끝나는 시각(+0.5초)에 한 번 더 (틀 클립을 받는 순간 켬)
//   ③ 화면을 끄거나 다른 앱으로 가면 바로 멈춤 → 돌아왔을 때 아직 구간 안이면 그 위치부터 이어서
//   ④ 잠금 화면·알림의 재생 버튼으로는 다시 안 틀어짐
let el = null
let curUrl = ''
let silent = ''
let unlocked = false // 이 폰에서 소리가 난 적 있음 (잠금 풀림)
const unlockFns = new Set()
let clip = null // 지금 틀(또는 트는) 클립 { key, url, from, at, ms, now, onBlocked, end, going, timer, wall, endT, go }
let want = null // 마지막으로 틀어 달라고 한 클립 (화면을 다시 켜거나 소리를 켜면 이어서)
const MIN_LEFT_MS = 250 // 남은 게 이보다 짧으면 안 틂
const RESYNC_S = 0.2 // 들려야 할 위치와 이보다 많이 어긋나면 위치를 맞춤

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
function markUnlocked() {
  if (unlocked) return
  unlocked = true
  unlockFns.forEach((f) => {
    try {
      f()
    } catch {}
  })
}
// 이 폰 소리가 켜졌는지 (화면의 '이 폰 소리 켜기' 버튼용)
export const mqUnlocked = () => unlocked
export function mqOnUnlock(f) {
  unlockFns.add(f)
  return () => unlockFns.delete(f)
}
const keyOf = (c) => `${c.url}|${c.from}|${c.at}|${c.ms}`
// 지금 들려야 하는 위치 (초)
const posOf = (c) => c.from + Math.max(0, c.now() - c.at) / 1000
const lastPos = (c) => c.from + (c.ms - MIN_LEFT_MS) / 1000
// 지금 클립 끝내기 (타이머 정리 + 멈춤)
function endClip() {
  if (clip) {
    clearTimeout(clip.timer)
    clearTimeout(clip.wall)
    clearTimeout(clip.endT)
  }
  clip = null
  try {
    el?.pause()
  } catch {}
}
// 소리가 늦게 나기 시작했으면 (받는 데 오래 걸림) 다른 폰과 같은 위치로 + 끝 지점 타이머
function resync() {
  const c = clip
  if (!c?.going || !el) return
  const pos = posOf(c)
  if (pos > lastPos(c)) return endClip()
  if (Math.abs(el.currentTime - pos) > RESYNC_S) {
    try {
      el.currentTime = pos
    } catch {}
  }
  // ② 끝 지점까지 남은 만큼 (조금 늦게 시작한 폰도 1초는 다 들림, 많이 늦으면 위에서 위치를 맞춰서 다른 폰과 같이 끝남)
  //    소리가 실제로 나가기까지 조금 걸려서 타이머가 먼저 울리면 남은 만큼 한 번 더 (멈춰 있으면 바로 끝)
  clearTimeout(c.endT)
  const until = c.from + c.ms / 1000
  const tick = () => {
    if (clip !== c) return
    const left = (until - el.currentTime) / (el.playbackRate || 1)
    if (left > 0.05 && !el.paused) c.endT = setTimeout(tick, left * 1000)
    else endClip()
  }
  c.endT = setTimeout(tick, Math.max(0, ((until - el.currentTime) / (el.playbackRate || 1)) * 1000))
}
export function mqAudio() {
  if (!el && typeof Audio !== 'undefined') {
    el = new Audio()
    el.preload = 'auto'
    el.loop = false
    el.setAttribute('playsinline', '')
    // ① 재생 위치로 멈춤
    el.addEventListener('timeupdate', () => {
      if (clip?.going && el.currentTime >= clip.from + clip.ms / 1000 - 0.04) endClip()
    })
    el.addEventListener('loadedmetadata', resync)
    el.addEventListener('playing', () => {
      if (!clip?.going) return
      markUnlocked()
      resync()
    })
    // 클립이 없는데 소리가 나면 (잠금 화면 재생 버튼 등) 바로 멈춤
    el.addEventListener('play', () => {
      if (!clip?.going && curUrl) setTimeout(() => !clip?.going && el && !el.paused && el.pause(), 0)
    })
    // ③ 화면을 끄거나 다른 앱으로 가면 멈춤, 돌아오면 아직 구간 안일 때 그 위치부터
    if (typeof document !== 'undefined') {
      const hide = () => clip && endClip()
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) hide()
        else if (want && !clip) playClip(want)
      })
      addEventListener('pagehide', hide)
    }
    // ④ 잠금 화면·알림의 재생 버튼은 아무것도 안 함, 멈춤 버튼은 멈춤
    try {
      navigator.mediaSession?.setActionHandler?.('play', () => {})
      navigator.mediaSession?.setActionHandler?.('pause', () => {
        want = null
        endClip()
      })
    } catch {}
  }
  return el
}
// 사람이 누른 그 처리 안에서 부르기 → 이 폰에서 소리가 나게 (시작 버튼, '이 폰 소리 켜기', 게임 화면에서 처음 누를 때)
// 막혔던 클립이 아직 구간 안이면 바로 그 위치부터 틂
export function mqUnlock() {
  const a = mqAudio()
  if (!a || clip?.going) return
  try {
    const w = want
    if (w && w.now() >= w.at && posOf(w) <= lastPos(w)) {
      if (clip && clip.key === keyOf(w)) clip.go()
      else playClip(w)
      return
    }
    if (curUrl) {
      // 미리 받아 둔 노래로: play 하자마자 pause (소리는 안 나고, 받아 둔 것도 그대로)
      const pr = a.play()
      a.pause()
      pr?.then?.(markUnlocked, (e) => e?.name === 'AbortError' && markUnlocked())
      return
    }
    if (!silent) silent = silentWav()
    a.src = silent
    const pr = a.play()
    pr?.then?.(markUnlocked, () => {})
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
function playClip(c) {
  const a = mqAudio()
  if (!a || !c?.url) return
  want = c
  const key = keyOf(c)
  if (clip && clip.key === key) return // 이미 틀 예정이거나 트는 중
  if (clip) endClip() // 다른 클립 (단계·문제가 바뀜): 앞 소리는 멈춤
  const t = c.now()
  if (posOf(c) > lastPos(c)) {
    // 이미 지난 구간 (늦게 들어온 폰·화면을 늦게 다시 켬): 아무것도 안 함 (미리 받아 둔 다음 노래도 그대로)
    want = null
    return
  }
  load(c.url)
  const me = { ...c, key, end: c.at + c.ms, going: false, timer: null, wall: null }
  clip = me
  // ② 구간이 끝나는 시각(+0.5초)엔 무슨 일이 있어도 멈춤 (소리가 안 나기 시작해도)
  me.wall = setTimeout(() => clip === me && endClip(), me.end + 500 - t)
  me.go = () => {
    if (clip !== me || me.going) return
    clearTimeout(me.timer)
    const pos = posOf(me)
    if (pos > lastPos(me)) return endClip()
    me.going = true
    try {
      if (Math.abs(a.currentTime - pos) > 0.05) a.currentTime = pos
    } catch {}
    hideTitle()
    let pr
    try {
      pr = a.play()
    } catch (e) {
      endClip()
      me.onBlocked?.(e)
      return
    }
    // 진짜로 막힌 것(NotAllowed 등)만 버튼, 우리가 끊은 것(AbortError)은 조용히. 약속이 안 끝나도 ①·② 가 멈춰 줌
    if (pr?.then)
      pr.then(
        () => {
          if (clip !== me) return
          markUnlocked()
          resync()
        },
        (e) => {
          if (clip !== me || e?.name === 'AbortError') return
          endClip()
          me.onBlocked?.(e)
        }
      )
  }
  if (c.at > t) me.timer = setTimeout(me.go, c.at - t)
  else me.go()
}
// url 의 from 초 지점이 서버 시각 at 에 들리게 ms 동안 (모든 폰이 같이). now = 서버 시각 함수
// 같은 클립을 여러 번 불러도 한 번만 틂. 막히면 onBlocked()
export function mqPlayAt(url, from, at, ms, now, onBlocked) {
  playClip({ url, from, at, ms, now: now || Date.now, onBlocked })
}
// 지금 바로 from 초부터 ms 동안 (확인 화면 ▶)
export function mqPlay(url, from, ms, onBlocked) {
  playClip({ url, from, at: Date.now(), ms, now: Date.now, onBlocked })
}
// 쉬는 동안 다음 노래를 미리 받아 둠 (틀고 있거나 틀 예정인 다른 노래가 있으면 안 건드림)
export function mqPrime(url) {
  const a = mqAudio()
  if (!a || !url || (clip && (clip.going || clip.url !== url))) return
  if (!a.paused && !a.ended) return
  load(url)
}
export function mqStop() {
  want = null
  endClip()
}
