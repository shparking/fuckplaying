// 할로윈 테마 — 10/31 사용자 '오늘 할로윈이라 UI 테마를 할로윈처럼 바꿔줘' (오늘만 자동 · 말까지 호박·유령)
//  - 한국 시간 10월 31일 0시 ~ 11월 1일 아침 6시에만 자동으로 켜짐 → 그 뒤엔 원래 테마로 (켜 둔 화면도 1분 안에 돌아감)
//  - 주소 뒤에 ?halloween=1 (켜기) / ?halloween=0 (끄기) / ?halloween=auto (날짜대로) — 이 탭에서는 계속 유지
//  - <html data-halloween="1"> → styles.css 의 할로윈 색·장식, 윷판 말은 🎃👻🦇💀 (팀 색 받침·빛은 그대로)
//  - 첫 화면 색은 index.html 의 짧은 스크립트가 같은 규칙으로 미리 켬
import { useSyncExternalStore } from 'react'

const KEY = 'yt-halloween'
// 팀 번호 순 (빨강·파랑·초록·노랑)
export const HW_PIECES = ['🎃', '👻', '🦇', '💀']

// 이 시각(ms)이 한국 시간 할로윈 기간인지
export function halloweenAt(now) {
  const k = new Date(now + 9 * 3600e3) // 한국 시간 (서머타임 없음)
  const m = k.getUTCMonth() + 1
  const d = k.getUTCDate()
  return (m === 10 && d === 31) || (m === 11 && d === 1 && k.getUTCHours() < 6)
}
// 주소·이 탭에 저장된 미리 보기 설정 (없으면 null)
function override() {
  let s = null
  try {
    const q = new URLSearchParams(location.search).get('halloween')
    if (q === '1' || q === '0') s = q
    if (q === 'auto') sessionStorage.removeItem(KEY)
    else if (s) sessionStorage.setItem(KEY, s)
    else s = sessionStorage.getItem(KEY)
  } catch {}
  return s === '1' || s === '0' ? s === '1' : null
}
export function isHalloween(now = Date.now()) {
  return override() ?? halloweenAt(now)
}

const subs = new Set()
let on = false
function apply(v) {
  on = v
  try {
    if (v) document.documentElement.dataset.halloween = '1'
    else delete document.documentElement.dataset.halloween
  } catch {}
}
function check() {
  const v = isHalloween()
  if (v === on) return
  apply(v)
  subs.forEach((f) => f())
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  apply(isHalloween())
  setInterval(check, 60e3)
  document.addEventListener('visibilitychange', () => !document.hidden && check())
}

export function useHalloween() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => on,
    () => false
  )
}

// 화면 장식: 뒤(달·유령, 글자 뒤라 안 가림) + 앞(가끔 날아가는 박쥐, 누르는 건 그대로 통과)
export function HalloweenDeco() {
  return (
    <>
      <div className="hw-back" aria-hidden>
        <span className="hw-moon" />
        <span className="hw-ghost g1">👻</span>
        <span className="hw-ghost g2">👻</span>
      </div>
      <div className="hw-front" aria-hidden>
        <span className="hw-bat b1">
          <i>🦇</i>
        </span>
        <span className="hw-bat b2">
          <i>🦇</i>
        </span>
        <span className="hw-bat b3">
          <i>🦇</i>
        </span>
      </div>
    </>
  )
}
