import { useEffect, useRef, useState } from 'react'
import { yutName } from '../game/yut'

// 3D 던지기 (Three.js) 는 게임 화면에 들어오면 미리 불러 둠. WebGL 이 안 되는 기기는 예전 윷가락 애니메이션
let throwMod = null
let throwLoading = null
function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
export function preloadThrow3D() {
  if (throwMod || throwLoading) return throwLoading
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).has('no3d') || !webglOk()) return null
  throwLoading = import('../three/yutThrow')
    .then((m) => {
      throwMod = m
      // 진단(?debug): 멈춘 윷가락 면 확인용
      if (new URLSearchParams(window.location.search).has('debug')) {
        window.__throwFaces = () => m.finalFaces()
        window.__throwAt = (u) => m.renderAt(u)
      }
      return m
    })
    .catch(() => null)
  return throwLoading
}

// 윷가락 4개. sticks[i] === true 면 배(평평한 면, X 무늬), false 면 등(둥근 면)
// 0번 윷가락의 배에는 빽도 표시
export function Sticks({ sticks, spinning, small }) {
  const s = sticks || [false, true, false, true]
  return (
    <div className={`sticks ${spinning ? 'spin' : ''} ${small ? 'small' : ''}`} aria-hidden>
      {s.map((flat, i) => (
        <span key={i} className={`stick ${flat ? 'flat' : 'round'} ${i === 0 ? 'back' : ''}`} style={{ '--i': i }}>
          {flat && (
            <>
              <i />
              <i />
              <i />
            </>
          )}
          {flat && i === 0 && <b className="back-mark" title="빽도 표시" />}
        </span>
      ))}
    </div>
  )
}

export const RESULT_TEXT = {
  '-1': '빽도! 뒤로 1칸',
  0: '낙! 마셔 🍶',
  1: '도! 1칸',
  2: '개! 2칸',
  3: '걸! 3칸',
  4: '윷! 4칸 · 한 번 더',
  5: '모! 5칸 · 한 번 더',
}

// 던지는 순간 모든 폰에 뜨는 윷 애니메이션: 윷가락을 실제로 던져 멍석 위에 굴리는 3D (같은 결과·같은 움직임)
export function ThrowOverlay({ anim, who, teamColor }) {
  const box = useRef(null)
  const [ready, setReady] = useState(!!throwMod)
  useEffect(() => {
    if (throwMod) return
    const p = preloadThrow3D()
    if (p) p.then(() => setReady(!!throwMod))
  }, [])
  const id = anim?.id
  useEffect(() => {
    if (!id || !throwMod || !box.current) return
    try {
      return throwMod.playThrow(box.current, { id, sticks: anim.sticks })
    } catch {
      setReady(false)
    }
  }, [id, ready])
  if (!anim) return null
  const spinning = anim.phase === 'spin'
  if (ready && throwMod)
    return (
      <div className={`throw-overlay three ${spinning ? '' : 'shown'}`} style={{ '--tc': teamColor }}>
        <div className="throw3d" ref={box} />
        <div className="throw3d-who">{who} 🥢</div>
        <div className="throw3d-result">{spinning ? '' : RESULT_TEXT[anim.value] || yutName(anim.value)}</div>
      </div>
    )
  return (
    <div className={`throw-overlay ${spinning ? '' : 'shown'} ${anim.value === 0 ? 'nak' : ''}`}>
      <div className="throw-card" style={{ '--tc': teamColor }}>
        <div className="throw-who">{who} 🥢</div>
        {anim.value === 0 && !spinning ? <div className="throw-nak">🙈</div> : <Sticks sticks={spinning ? null : anim.sticks} spinning={spinning} />}
        <div className="throw-result">{spinning ? '…' : RESULT_TEXT[anim.value] || yutName(anim.value)}</div>
      </div>
    </div>
  )
}
