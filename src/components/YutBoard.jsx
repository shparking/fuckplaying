import { NODES, NODE_BY_ID, BIG_NODES, CORNERS, TEAM_INFO, START, CORNER_TR, CORNER_TL, CORNER_BL, nodeLabel } from '../game/yut'

// 윷판: 좌표(0~100)를 판 안쪽 여백(INSET%)을 두고 배치
const INSET = 6.5
const SPAN = 100 - INSET * 2
const at = (x, y) => ({ left: `${INSET + (x * SPAN) / 100}%`, top: `${INSET + (y * SPAN) / 100}%` })
const pos = (n) => at(n.x, n.y)
const svgPt = (id) => {
  const n = NODE_BY_ID[id]
  return [INSET + (n.x * SPAN) / 100, INSET + (n.y * SPAN) / 100]
}
const LINES = [
  [START, CORNER_TR],
  [CORNER_TR, CORNER_TL],
  [CORNER_TL, CORNER_BL],
  [CORNER_BL, START],
  [CORNER_TR, CORNER_BL, 'diag'],
  [CORNER_TL, START, 'diag'],
]
// 진행 방향 화살표 (오른쪽 아래 출발 → 위로 → 왼쪽 → 아래로 → 오른쪽): 각 변 가운데 안쪽
const ARROWS = [
  { x: 89, y: 50, rot: -90 },
  { x: 50, y: 11, rot: 180 },
  { x: 11, y: 50, rot: 90 },
  { x: 50, y: 89, rot: 0 },
]

// pieces: { [team]: [{ n }] }  → 노드별 말 묶음
function stacksOf(pieces, teamCount) {
  const out = {}
  for (let t = 0; t < teamCount; t++) {
    ;(pieces?.[t] || []).forEach((pc) => {
      if (pc.n === 'home' || pc.n === 'goal') return
      const k = `${t}|${pc.n}`
      out[k] = out[k] || { team: t, node: pc.n, count: 0 }
      out[k].count++
    })
  }
  return Object.values(out)
}

export default function YutBoard({ cells, pieces, teamCount, onCellTap, onStackTap, movable, dests, activeNode, mover, hide, ghost, zoom, children }) {
  let stacks = stacksOf(pieces, teamCount)
  // 이동 애니메이션 중: 도착 칸의 말 묶음에서 움직이는 말 수만큼 빼고, 움직이는 말은 따로 그림
  if (hide) {
    stacks = stacks
      .map((s) => (s.team === hide.team && s.node === hide.node ? { ...s, count: s.count - hide.count } : s))
      .filter((s) => s.count > 0)
  }
  if (ghost) stacks = [...stacks.filter((s) => s.node !== ghost.node), { ...ghost, ghost: true }]
  if (mover) stacks = [...stacks, { ...mover, moving: true }]
  return (
    <div className={`yut-board ${zoom ? 'zoom' : ''}`}>
      <svg className="yut-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {LINES.map(([a, b, kind]) => {
          const [x1, y1] = svgPt(a)
          const [x2, y2] = svgPt(b)
          return <line key={a + b} className={kind || ''} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
      </svg>
      {ARROWS.map((a, i) => (
        <span key={i} className="ydir" style={{ ...at(a.x, a.y), '--rot': `${a.rot}deg` }} aria-hidden>
          ➜
        </span>
      ))}
      {NODES.map((n) => {
        const c = cells[n.id] || {}
        const big = BIG_NODES.has(n.id)
        const diag = !/^o/.test(n.id)
        const lines = String(c.text || '').split('\n')
        const long = lines.some((l) => l.length > 6)
        return (
          <button
            key={n.id}
            className={`ycell ${big ? 'big' : ''} ${diag ? 'diag' : ''} ${n.id === START ? 'home' : ''} ${CORNERS.has(n.id) ? 'corner' : ''} ${n.id === 'C' ? 'center' : ''} ${activeNode === n.id ? 'active' : ''} ${dests?.has(n.id) ? 'dest' : ''} ${c.edited ? 'edited' : ''}`}
            style={pos(n)}
            onClick={() => onCellTap?.(n.id)}
            aria-label={`${nodeLabel(n.id)} ${lines.join(' ')}`}
          >
            <span className="ycell-no">{nodeLabel(n.id)}</span>
            <span className="ycell-emo">{c.emoji}</span>
            <span className={`ycell-text ${long ? 'long' : ''}`}>
              {lines.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </span>
          </button>
        )
      })}
      {stacks.map((s) => {
        const n = NODE_BY_ID[s.node]
        if (!n) return null
        const info = TEAM_INFO[s.team]
        const canMove = !s.moving && !s.ghost && movable?.has(s.node) && movable.team === s.team
        return (
          <button
            key={`${s.team}-${s.node}-${s.moving ? 'm' : s.ghost ? 'g' : ''}`}
            className={`ytoken ${BIG_NODES.has(s.node) ? 'on-big' : ''} ${s.moving ? 'moving' : ''} ${s.ghost ? 'ghost' : ''} ${canMove ? 'can' : ''}`}
            style={{ ...pos(n), '--tc': info.color }}
            onClick={(e) => {
              e.stopPropagation()
              if (canMove) onStackTap?.(s.node)
              else onCellTap?.(s.node)
            }}
            aria-label={`${info.name} 말 ${s.count}개`}
          >
            <span className="ytoken-dot" />
            {s.count > 1 && <span className="ytoken-n">{s.count}</span>}
          </button>
        )
      })}
      {children}
    </div>
  )
}
