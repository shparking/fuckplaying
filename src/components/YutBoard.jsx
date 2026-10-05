import { NODES, NODE_BY_ID, BIG_NODES, TEAM_INFO, nodeLabel } from '../game/yut'

// 윷판: 좌표(0~100)를 판 안쪽 여백(INSET%)을 두고 배치
const INSET = 8
const SPAN = 100 - INSET * 2
const pos = (n) => ({ left: `${INSET + (n.x * SPAN) / 100}%`, top: `${INSET + (n.y * SPAN) / 100}%` })
const svgPt = (id) => {
  const n = NODE_BY_ID[id]
  return [INSET + (n.x * SPAN) / 100, INSET + (n.y * SPAN) / 100]
}
const LINES = [
  ['o0', 'o5'],
  ['o5', 'o10'],
  ['o10', 'o15'],
  ['o15', 'o0'],
  ['o5', 'o15'],
  ['o10', 'o0'],
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

export default function YutBoard({ cells, pieces, teamCount, onCellTap, onStackTap, movable, dests, activeNode, mover, hide, ghost, children }) {
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
    <div className="yut-board">
      <svg className="yut-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {LINES.map(([a, b]) => {
          const [x1, y1] = svgPt(a)
          const [x2, y2] = svgPt(b)
          const diag = (a === 'o5' && b === 'o15') || (a === 'o10' && b === 'o0')
          return <line key={a + b} className={diag ? 'diag' : ''} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
      </svg>
      {NODES.map((n) => {
        const c = cells[n.id] || {}
        const big = BIG_NODES.has(n.id)
        const diag = !/^o/.test(n.id)
        const label = nodeLabel(n.id)
        const lines = String(c.text || '').split('\n')
        const long = lines.some((l) => l.length > 6)
        return (
          <button
            key={n.id}
            className={`ycell ${big ? 'big' : ''} ${diag ? 'diag' : ''} ${n.id === 'o0' ? 'home' : ''} ${activeNode === n.id ? 'active' : ''} ${dests?.has(n.id) ? 'dest' : ''} ${c.edited ? 'edited' : ''}`}
            style={pos(n)}
            onClick={() => onCellTap?.(n.id)}
          >
            <span className="ycell-no">{label}</span>
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
            className={`ytoken ${s.moving ? 'moving' : ''} ${s.ghost ? 'ghost' : ''} ${canMove ? 'can' : ''}`}
            style={{ ...pos(n), '--tc': info.color }}
            onClick={(e) => {
              e.stopPropagation()
              if (canMove) onStackTap?.(s.node)
              else onCellTap?.(s.node)
            }}
            aria-label={`${info.name} 말 ${s.count}개`}
          >
            <span className="ytoken-dot" />
            {s.count > 1 && <span className="ytoken-n">×{s.count}</span>}
          </button>
        )
      })}
      {children}
    </div>
  )
}
