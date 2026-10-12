import { useEffect, useRef, useState } from 'react'
import YutBoard from './YutBoard'

// 게임 화면 윷판: 3D(수달 말) — WebGL 이 안 되거나 끄면 2D 판 (props 는 둘 다 같음)
// 3D 판 코드(Three.js)는 따로 불러옴: 대기실에서 미리 불러 두면 게임 시작하자마자 3D 로 보임
let mod = null
let loading = null
function webglOk() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // 확인용 컨텍스트는 바로 돌려줌
    return !!gl
  } catch {
    return false
  }
}
let okCache = null
export function board3dOk() {
  if (okCache != null) return okCache
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  okCache = !q.has('no3d') && q.get('board') !== '2d' && webglOk()
  return okCache
}
export function preloadBoard3D() {
  if (mod || loading) return loading
  if (!board3dOk()) return null
  loading = import('../three/gameBoard')
    .then((m) => (mod = m))
    .catch(() => {
      loading = null
      return null
    })
  return loading
}

export default function GameBoard({ use3d, onFail3d, ...props }) {
  const want = !!use3d && board3dOk()
  const [ready, setReady] = useState(!!mod)
  useEffect(() => {
    if (!want || mod) return
    let alive = true
    const p = preloadBoard3D()
    if (p)
      p.then((m) => {
        if (!alive) return
        if (m) setReady(true)
        else onFail3d?.()
      })
    return () => {
      alive = false
    }
  }, [want])
  if (!want || !ready || !mod) return <YutBoard {...props} />
  return <Board3D {...props} onFail={onFail3d} />
}

function Board3D(props) {
  const box = useRef(null)
  const api = useRef(null)
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    let b = null
    try {
      b = mod.createGameBoard(box.current, {
        onCellTap: (n, via) => latest.current.onCellTap?.(n, via),
        onStackTap: (n) => latest.current.onStackTap?.(n),
        onLost: () => latest.current.onFail?.(),
      })
    } catch (e) {
      console.warn('3D 윷판을 못 만들어서 2D 판으로 보여요', e)
      setTimeout(() => latest.current.onFail?.(), 0)
      return
    }
    api.current = b
    b.update(latest.current)
    if (new URLSearchParams(window.location.search).has('debug')) window.__board3d = b
    return () => {
      b.dispose()
      api.current = null
    }
  }, [])
  useEffect(() => {
    api.current?.update(props)
  })
  return <div className="y3d" ref={box} role="img" aria-label="3D 윷판 — 칸이나 말을 눌러요" />
}
