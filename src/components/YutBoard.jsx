import { NODES, NODE_BY_ID, BIG_NODES, CORNERS, TEAM_INFO, START, CORNER_TR, CORNER_TL, CORNER_BL, nodeLabel, cellNo } from '../game/yut'
import { fitCellText } from '../game/cellText'
import { boardStacks } from '../game/boardView'

export { fitCellText, CELL_FS } from '../game/cellText'

// 윷판: 좌표(0~100)를 판 안쪽 여백(INSET%)을 두고 배치.
// 칸을 거의 맞닿게 키워서 전체 보기에서도 칸마다 벌칙 글자가 보이게 함 (크기 단위 cqw = 판 너비의 1%)
const INSET = 5.45
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

// 칸 번호 (짧게): 출발 칸은 글자에 '출발·골인'이 있으니 비움, 나머지는 번호만 — 모서리·가운데는 칸 모양(네온 테두리)으로 구분
const shortLabel = (id) => (id === START ? '' : String(cellNo(id) ?? ''))

// 말 고르기 (판에서 직접):
//  movable  = 움직일 수 있는 말이 있는 칸 (Set, .team) → 통통 튐
//  selected = 고른 말의 칸 (또는 'home' = 새 말)
//  dests    = 고른 말이 갈 수 있는 칸 (빛남) · routes = { 칸: '대각선'·'직진' } 갈림길 표시 · goal = 고른 말이 골인 가능
//  newPiece = { team, count, can } 새 말을 꺼낼 수 있으면 출발 칸이 팀 색으로 빛남 (칸 글자는 App 이 '새 말 꺼내기'로 바꿔 줌)
export default function YutBoard({ cells, pieces, teamCount, onCellTap, onStackTap, movable, selected, dests, routes, goal, newPiece, activeNode, mover, hide, ghost, bank, children }) {
  let stacks = boardStacks(pieces, teamCount, { hide, ghost })
  // 말이 서 있는 칸은 그 팀 색 테두리로 표시 (말 표시는 칸 오른쪽 위 작은 점이라 글자를 안 가림)
  const occ = {}
  stacks.forEach((s) => (occ[s.node] = s))
  if (mover) stacks = [...stacks, { ...mover, moving: true }]
  return (
    <div className="yut-board">
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
        const diag = !/^o/.test(n.id) && n.id !== 'C'
        const fit = fitCellText(c.text, diag ? 'diag' : 'cell')
        const o = occ[n.id]
        const canHere = o && !o.ghost && movable?.has(n.id) && movable.team === o.team
        const isDest = dests?.has(n.id) || (goal && n.id === START)
        // 새 말 꺼내기: 출발 칸이 팀 색으로 빛남 (누르면 새 말 선택)
        const np = n.id === START && newPiece?.can
        return (
          <button
            key={n.id}
            className={`ycell ${big ? 'big' : ''} ${diag ? 'diag' : ''} ${n.id === START ? 'home' : ''} ${CORNERS.has(n.id) ? 'corner' : ''} ${n.id === 'C' ? 'center' : ''} ${fit.l3 ? 'l3' : ''} ${activeNode === n.id ? 'active' : ''} ${isDest ? 'dest' : ''} ${c.edited ? 'edited' : ''} ${o ? 'occ' : ''} ${o?.count > 1 ? 'occ-stack' : ''} ${canHere || np ? 'occ-can' : ''} ${(canHere && selected === n.id) || (np && selected === 'home') ? 'occ-sel' : ''} ${np ? 'occ newpc' : ''}`}
            style={{ ...pos(n), ...(np ? { '--oc': TEAM_INFO[newPiece.team]?.color } : o ? { '--oc': TEAM_INFO[o.team]?.color } : {}) }}
            onClick={() => onCellTap?.(n.id)}
            aria-label={`${nodeLabel(n.id)} ${fit.lines.join(' ')}`}
          >
            <span className="ycell-no">{shortLabel(n.id)}</span>
            <span className="ycell-emo">{c.emoji}</span>
            <span className="ycell-text" style={{ '--fs': fit.fs }}>
              {fit.lines.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </span>
            {/* 소주 보관소: 모인 잔 수 */}
            {c.type === 'sojuBank' && bank > 0 && <span className="ycell-bank">🍶{bank}</span>}
          </button>
        )
      })}
      {/* 갈림길·골인: 빛나는 칸 위에 어느 쪽으로 가는 칸인지 */}
      {[...Object.entries(routes || {}), ...(goal ? [[START, '🏁 골인']] : [])].map(([id, label]) =>
        NODE_BY_ID[id] ? (
          <span key={`r-${id}`} className={`ycell-route ${!/^o/.test(id) && id !== 'C' ? 'on-diag' : ''}`} style={pos(NODE_BY_ID[id])} aria-hidden>
            {label}
          </span>
        ) : null,
      )}
      {stacks.map((s) => {
        const n = NODE_BY_ID[s.node]
        if (!n) return null
        const info = TEAM_INFO[s.team]
        const canMove = !s.moving && !s.ghost && movable?.has(s.node) && movable.team === s.team
        const isSel = canMove && selected === s.node
        const diag = !/^o/.test(s.node) && s.node !== 'C'
        return (
          <button
            key={`${s.team}-${s.node}-${s.moving ? 'm' : s.ghost ? 'g' : ''}`}
            className={`ytoken ${diag ? 'on-diag' : ''} ${s.count > 1 ? 'stack' : ''} ${s.moving ? 'moving' : ''} ${s.ghost ? 'ghost' : ''} ${canMove ? (isSel ? 'sel' : 'can') : ''}`}
            style={{ ...pos(n), '--tc': info.color }}
            data-team={s.team}
            data-node={s.node}
            onClick={(e) => {
              e.stopPropagation()
              if (canMove) onStackTap?.(s.node)
              else onCellTap?.(s.node)
            }}
            aria-label={`${info.name} 말 ${s.count}개`}
          >
            {/* 업은 말: 팀 색 알약에 ×2·×3 크게 (한 개는 점) */}
            <span className="ytoken-dot">{s.count > 1 ? `×${s.count}` : ''}</span>
          </button>
        )
      })}
      {children}
    </div>
  )
}
