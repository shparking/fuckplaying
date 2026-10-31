// 지도 찍기 · 세계 지도 찍기 공통 문제 뽑기 (10/16 사용자 요청: 윷놀이 한 판에서 지도 게임을 여러 번 해도 장소가 아예 안 겹치게)
//  list: 장소 목록 ({ lv, w? }), used: 이번 판에 이미 나온 장소 번호 (나온 순서대로)
//  plan: [[난이도, 개수], …] — 기본 쉬움 1 · 보통 3 · 어려움 1 (쉬운 것부터 나옴), 지도 게임은 10/31부터 쉬움 1 · 보통 1 · 어려움 1
//  - 이번 판에 나온 곳은 절대 다시 안 뽑음. 그 난이도를 다 썼으면 가까운 난이도에서 채움 (겹치는 것보다 나음)
//  - 장소를 전부 다 쓴 뒤에만 (한 판에 지도 게임이 아주 많을 때) 이번 판에 가장 오래전에 나온 곳부터 다시
//  - w: 뽑힐 무게 (기본 1, 청주 같은 곳은 크게)
export function pickUnique(list, used = [], plan = [[1, 1], [2, 3], [3, 1]], rand = Math.random) {
  const usedSet = new Set(used)
  const out = []
  const lvs = [...new Set(list.map((p) => p.lv))].sort((a, b) => a - b)
  const free = (lv) => list.map((_, i) => i).filter((i) => list[i].lv === lv && !usedSet.has(i) && !out.includes(i))
  const weighted = (pool) => {
    const total = pool.reduce((a, i) => a + (list[i].w || 1), 0)
    let r = rand() * total
    for (const i of pool) {
      r -= list[i].w || 1
      if (r < 0) return i
    }
    return pool[pool.length - 1]
  }
  // 이번 판에 마지막으로 나온 때 (작을수록 오래전)
  const last = new Map()
  used.forEach((i, k) => last.set(i, k))
  for (const [lv, n] of plan) {
    for (let k = 0; k < n; k++) {
      let pool = free(lv)
      if (!pool.length) {
        const near = lvs.filter((x) => x !== lv).sort((a, b) => Math.abs(a - lv) - Math.abs(b - lv) || a - b)
        for (const x of near) {
          pool = free(x)
          if (pool.length) break
        }
      }
      if (pool.length) {
        out.push(weighted(pool))
        continue
      }
      // 전부 다 씀: 이번 판에 가장 오래전에 나온 곳 (이번 문제들끼리는 안 겹침)
      const again = list
        .map((_, i) => i)
        .filter((i) => !out.includes(i))
        .sort((a, b) => (last.get(a) ?? -1) - (last.get(b) ?? -1))
      if (!again.length) break
      out.push(again[0])
    }
  }
  // 쉬운 것 → 어려운 것 순서 (같은 난이도 안에서는 뽑힌 순서 그대로)
  return out.map((i, k) => [i, k]).sort((a, b) => list[a[0]].lv - list[b[0]].lv || a[1] - b[1]).map((x) => x[0])
}
