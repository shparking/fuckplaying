// 판에 그릴 말 묶음 (2D 판·3D 판이 같이 씀)
// pieces: { [team]: [{ n }] }  → 노드별 말 묶음 [{ team, node, count }]
export function stacksOf(pieces, teamCount) {
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
// 이동 애니메이션 중: 도착 칸에서 움직이는 말 수만큼 빼고(hide), 잡힌 말(ghost)은 애니메이션이 끝날 때까지 보여 줌
export function boardStacks(pieces, teamCount, { hide, ghost } = {}) {
  let stacks = stacksOf(pieces, teamCount)
  if (hide) {
    stacks = stacks
      .map((s) => (s.team === hide.team && s.node === hide.node ? { ...s, count: s.count - hide.count } : s))
      .filter((s) => s.count > 0)
  }
  if (ghost) stacks = [...stacks.filter((s) => s.node !== ghost.node), { ...ghost, ghost: true }]
  return stacks
}
