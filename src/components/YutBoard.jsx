import { NODES, NODE_BY_ID, BIG_NODES, CORNERS, TEAM_INFO, START, CORNER_TR, CORNER_TL, CORNER_BL, nodeLabel, cellNo } from '../game/yut'
// 판 말: 3D 수달 모델(src/three/otter.js)을 팀 색 목띠·받침으로 비스듬히 찍은 그림 (tools/make_otters.mjs 로 다시 만듦)
import otter0 from '../assets/otters/otter-0.webp'
import otter1 from '../assets/otters/otter-1.webp'
import otter2 from '../assets/otters/otter-2.webp'
import otter3 from '../assets/otters/otter-3.webp'
export const OTTER_IMG = [otter0, otter1, otter2, otter3]

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

// ---------- 칸 글자 맞추기 ----------
// 글자 폭(em)을 어림해서, 칸 안에 들어가는 가장 큰 글자 크기와 줄 나눔을 정함 (Pretendard 기준으로 잰 값)
function emWidth(s) {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e)) w += 0.86
    else if (c === 0x20) w += 0.22
    else if (c >= 0x30 && c <= 0x39) w += 0.47
    else if (c >= 0x41 && c <= 0x5a) w += 0.72
    else if (c >= 0x61 && c <= 0x7a) w += 0.56
    else if ('!.,·:;\'"|'.includes(ch)) w += 0.3
    else if ('()[]{}'.includes(ch)) w += 0.39
    else if (c < 0x2000) w += 0.62
    else w += 1.1 // 이모지 등
  }
  return w
}
// 띄어쓰기 기준으로 가장 고르게 두 줄로 나눔 (띄어쓰기가 없으면 그대로)
function splitLine(line) {
  const sp = [...line.matchAll(/ /g)].map((m) => m.index)
  if (!sp.length) return [line]
  const total = emWidth(line)
  let best = null
  sp.forEach((i) => {
    const a = line.slice(0, i).trim()
    const b = line.slice(i + 1).trim()
    if (!a || !b) return
    const score = Math.max(emWidth(a), emWidth(b))
    if (!best || score < best.score) best = { a, b, score }
  })
  return best && best.score < total ? [best.a, best.b] : [line]
}
// 모든 칸 글자 크기를 똑같이 (판 너비의 1.9% = '의리주 마셔!(글라스에)' 칸 크기). 이 크기로 안 들어가는 줄만 띄어쓰기에서 나누고,
// 나눠도 안 들어가는 긴 단어만 그 칸에서 조금 작아짐
export const CELL_FS = 1.9
// 칸 종류별 글자 상자 (cqw): w = 글자 폭, h2 = 이모지 줄이 있을 때 글자 높이, h3 = 이모지를 위로 올렸을 때
const BOX = {
  cell: { w: 8.0, h2: 5.6, h3: 6.7, max: CELL_FS },
  diag: { w: 7.1, h2: 4.85, h3: 5.85, max: CELL_FS },
}
const LH = 1.08 // 줄 간격 (세 줄 이상은 LH3 로 조금 좁게 → 작은 대각선 칸도 같은 글자 크기)
const LH3 = 1.02
const MIN_FS = CELL_FS // 이 크기로 안 들어가면 줄을 더 나눠 봄
export function fitCellText(text, kind = 'cell') {
  const box = BOX[kind] || BOX.cell
  let lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { lines: [], fs: box.max, l3: false }
  // 너무 긴 줄은 띄어쓰기에서 나눔 (최대 4줄)
  for (let guard = 0; guard < 4; guard++) {
    const widest = lines.reduce((m, l, i) => (emWidth(l) > emWidth(lines[m]) ? i : m), 0)
    if ((box.w / emWidth(lines[widest])) >= MIN_FS || lines.length >= 4) break
    const parts = splitLine(lines[widest])
    if (parts.length < 2) break
    lines = [...lines.slice(0, widest), ...parts, ...lines.slice(widest + 1)]
  }
  const maxEm = Math.max(...lines.map(emWidth))
  const l3 = lines.length >= 3
  const h = l3 ? box.h3 : box.h2
  const fs = Math.min(box.max, box.w / maxEm, h / (lines.length * (l3 ? LH3 : LH)))
  return { lines, fs: Math.round(fs * 100) / 100, l3 }
}

// 칸 번호 (짧게): 출발 칸은 글자에 '출발·골인'이 있으니 비움, 나머지는 번호만 — 모서리·가운데는 칸 모양(네온 테두리)으로 구분
const shortLabel = (id) => (id === START ? '' : String(cellNo(id) ?? ''))

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

export default function YutBoard({ cells, pieces, teamCount, onCellTap, onStackTap, movable, dests, activeNode, mover, hide, ghost, bank, children }) {
  let stacks = stacksOf(pieces, teamCount)
  // 이동 애니메이션 중: 도착 칸의 말 묶음에서 움직이는 말 수만큼 빼고, 움직이는 말은 따로 그림
  if (hide) {
    stacks = stacks
      .map((s) => (s.team === hide.team && s.node === hide.node ? { ...s, count: s.count - hide.count } : s))
      .filter((s) => s.count > 0)
  }
  if (ghost) stacks = [...stacks.filter((s) => s.node !== ghost.node), { ...ghost, ghost: true }]
  // 말이 서 있는 칸은 그 팀 색 테두리로 표시 (말 표시는 칸 오른쪽 위 작은 점이라 글자를 안 가림)
  // 한 칸에 여러 팀 말(방패로 막은 뒤)이면 지금 차례 팀 색, 말은 팀 번호 순으로 자리를 나눔 (오른쪽 위 → 왼쪽 위 → …)
  const occ = {}
  const slotOf = {}
  const byNode = {}
  stacks.forEach((s) => {
    if (!occ[s.node] || s.team === movable?.team) occ[s.node] = s
    ;(byNode[s.node] = byNode[s.node] || []).push(s)
  })
  Object.values(byNode).forEach((list) => list.sort((a, b) => a.team - b.team).forEach((s, i) => (slotOf[`${s.team}|${s.node}`] = i)))
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
        return (
          <button
            key={n.id}
            className={`ycell ${big ? 'big' : ''} ${diag ? 'diag' : ''} ${n.id === START ? 'home' : ''} ${CORNERS.has(n.id) ? 'corner' : ''} ${n.id === 'C' ? 'center' : ''} ${fit.l3 ? 'l3' : ''} ${activeNode === n.id ? 'active' : ''} ${dests?.has(n.id) ? 'dest' : ''} ${c.edited ? 'edited' : ''} ${o ? 'occ' : ''} ${o?.count > 1 ? 'occ-stack' : ''} ${canHere ? 'occ-can' : ''}`}
            style={{ ...pos(n), ...(o ? { '--oc': TEAM_INFO[o.team]?.color } : {}) }}
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
      {stacks.map((s) => {
        const n = NODE_BY_ID[s.node]
        if (!n) return null
        const info = TEAM_INFO[s.team]
        const canMove = !s.moving && !s.ghost && movable?.has(s.node) && movable.team === s.team
        const diag = !/^o/.test(s.node) && s.node !== 'C'
        return (
          <button
            key={`${s.team}-${s.node}-${s.moving ? 'm' : s.ghost ? 'g' : ''}`}
            className={`ytoken ${diag ? 'on-diag' : ''} ${s.count > 1 ? 'stack' : ''} ${s.moving ? 'moving' : ''} ${s.ghost ? 'ghost' : ''} ${canMove ? 'can' : ''} ${!s.moving && slotOf[`${s.team}|${s.node}`] ? `slot${slotOf[`${s.team}|${s.node}`]}` : ''}`}
            style={{ ...pos(n), '--tc': info.color }}
            data-team={s.team}
            onClick={(e) => {
              e.stopPropagation()
              if (canMove) onStackTap?.(s.node)
              else onCellTap?.(s.node)
            }}
            aria-label={`${info.name} 말 ${s.count}개`}
          >
            {/* 수달 말 (팀 색 목띠·받침) + 업은 말이면 팀 색 알약 ×2·×3 */}
            <span className="ytoken-dot">
              <img className="ytoken-otter" src={OTTER_IMG[s.team] || OTTER_IMG[0]} alt="" draggable="false" />
            </span>
            {s.count > 1 && <span className="ytoken-count">×{s.count}</span>}
          </button>
        )
      })}
      {children}
    </div>
  )
}
