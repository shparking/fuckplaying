// 완벽한 원 그리기: 손가락으로 한 번에 그린 선이 얼마나 동그란지 0~100점
// 1) 그린 길이를 따라 점을 고르게 다시 뽑음 (빨리 그린 곳·천천히 그린 곳 차이 없앰)
// 2) 가장 잘 맞는 원을 찾음 (최소제곱 원 맞추기, Kasa)
// 3) 그 원에서 평균 몇 % 벗어났는지 + 한 바퀴를 다 돌았는지로 점수. 한 바퀴 넘게 돌면 첫 바퀴만
// 좌표는 그림판 크기 기준 0~1000 (폰 크기가 달라도 같은 점수)
export const CIRCLE_BOX = 1000
export const CIRCLE_N = 64 // 채점·저장에 쓰는 점 개수
export const CIRCLE_MIN_TURN = 0.55 // 반 바퀴 남짓도 안 되면 다시 그리기
export const CIRCLE_FULL_TURN = 0.97 // 이만큼 돌면 다 돈 걸로
export const CIRCLE_MIN_R = 0.1 // 그림판 대비 너무 작은 원은 다시 그리기
const K = 4 // 벗어난 정도 → 점수 (평균 2% 벗어나면 92점, 5%면 82점, 10%면 67점)

function resample(pts, n) {
  if (pts.length < 2) return pts.map((q) => [q[0], q[1]])
  const d = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const L = d[d.length - 1]
  if (!(L > 0)) return [[pts[0][0], pts[0][1]]]
  const out = []
  let j = 1
  for (let k = 0; k < n; k++) {
    const t = (L * k) / (n - 1)
    while (j < d.length - 1 && d[j] < t) j++
    const seg = d[j] - d[j - 1] || 1
    const u = Math.min(1, Math.max(0, (t - d[j - 1]) / seg))
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u])
  }
  return out
}
const pathLen = (pts) => pts.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0)

// 최소제곱 원 (평균을 0으로 옮겨서 계산) → { cx, cy, r }
export function fitCircle(pts) {
  const n = pts.length
  const mx = pts.reduce((a, q) => a + q[0], 0) / n
  const my = pts.reduce((a, q) => a + q[1], 0) / n
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
  for (const [x0, y0] of pts) {
    const x = x0 - mx
    const y = y0 - my
    const z = x * x + y * y
    sxx += x * x
    syy += y * y
    sxy += x * y
    sxz += x * z
    syz += y * z
    sz += z
  }
  const det = sxx * syy - sxy * sxy
  if (Math.abs(det) < 1e-9 * Math.max(1, sxx * syy)) {
    // 거의 일직선: 무게중심 + 평균 거리
    const r = pts.reduce((a, q) => a + Math.hypot(q[0] - mx, q[1] - my), 0) / n
    return { cx: mx, cy: my, r, line: true }
  }
  const D = (-sxz * syy + syz * sxy) / det
  const E = (-syz * sxx + sxz * sxy) / det
  const F = -sz / n
  const cx = -D / 2
  const cy = -E / 2
  const r = Math.sqrt(Math.max(0, cx * cx + cy * cy - F))
  return { cx: cx + mx, cy: cy + my, r }
}

// 원 중심을 기준으로 돈 바퀴 수 (부호 있는 각도 합 / 2π) + 각 점까지 누적
function turnsOf(pts, c) {
  let total = 0
  const cum = [0]
  let prev = Math.atan2(pts[0][1] - c.cy, pts[0][0] - c.cx)
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i][1] - c.cy, pts[i][0] - c.cx)
    let da = a - prev
    while (da > Math.PI) da -= 2 * Math.PI
    while (da < -Math.PI) da += 2 * Math.PI
    total += da
    cum.push(total)
    prev = a
  }
  return { turns: Math.abs(total) / (2 * Math.PI), cum }
}

function evaluate(pts) {
  const c = fitCircle(pts)
  const { turns, cum } = turnsOf(pts, c)
  return { c, turns, cum }
}

// raw: 그린 점 [[x, y], ...] (0~1000 좌표). 결과 { ok, s(0~100, 소수 1자리), turns, dev, c:[cx,cy,r], pts:[x0,y0,x1,y1,...] }
// 다시 그려야 하면 { ok: false, why: 'short' | 'turn' | 'small' }
export function scoreCircle(raw, box = CIRCLE_BOX) {
  const pts = (raw || []).filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))
  if (pts.length < 8 || pathLen(pts) < box * 0.5) return { ok: false, why: 'short' }
  let rs = resample(pts, CIRCLE_N)
  let ev = evaluate(rs)
  // 한 바퀴 넘게 돌면 첫 바퀴까지만 (겹쳐 그린 꼬리는 빼고 다시 채점)
  if (ev.turns > 1.02) {
    const full = 2 * Math.PI
    const k = ev.cum.findIndex((a) => Math.abs(a) >= full)
    if (k > 8) {
      const L = pathLen(rs.slice(0, k + 1))
      // 원래 점들에서 같은 길이까지 자름
      let acc = 0
      const cut = [pts[0]]
      for (let i = 1; i < pts.length && acc < L; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        cut.push(pts[i])
      }
      rs = resample(cut, CIRCLE_N)
      ev = evaluate(rs)
    }
  }
  const { c, turns } = ev
  if (c.line || turns < CIRCLE_MIN_TURN) return { ok: false, why: 'turn', turns }
  if (c.r < box * CIRCLE_MIN_R) return { ok: false, why: 'small', turns }
  const dev = rs.reduce((a, q) => a + Math.abs(Math.hypot(q[0] - c.cx, q[1] - c.cy) - c.r), 0) / rs.length / c.r
  const shape = Math.exp(-K * dev)
  const full = Math.min(1, turns / CIRCLE_FULL_TURN)
  const s = Math.round(1000 * shape * Math.pow(full, 1.6)) / 10
  const clamp = (v) => Math.max(0, Math.min(box, Math.round(v)))
  return {
    ok: true,
    s: Math.max(0, Math.min(100, s)),
    turns: Math.round(turns * 100) / 100,
    dev: Math.round(dev * 1000) / 1000,
    c: [clamp(c.cx), clamp(c.cy), clamp(c.r)],
    pts: rs.flatMap((q) => [clamp(q[0]), clamp(q[1])]),
  }
}

// 그리는 중 정확도 (한 바퀴 다 안 돌아도, 지금까지 그린 선이 원에서 얼마나 벗어났는지만). 1/4 바퀴 전엔 null
export function circleAccuracy(raw, box = CIRCLE_BOX) {
  const pts = raw || []
  if (pts.length < 10 || pathLen(pts) < box * 0.25) return null
  const rs = resample(pts, 48)
  const c = fitCircle(rs)
  if (c.line || !(c.r > 0)) return null
  if (turnsOf(rs, c).turns < 0.25) return null
  const dev = rs.reduce((a, q) => a + Math.abs(Math.hypot(q[0] - c.cx, q[1] - c.cy) - c.r), 0) / rs.length / c.r
  return { acc: Math.round(1000 * Math.exp(-K * dev)) / 10, c }
}

// 0~1 난수 (시드 고정): 안내 화면 예시 원이 매번 같게
export function seeded(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 점수 한마디
export function circleComment(s) {
  if (s >= 95) return '🤯 컴퓨터가 그렸나?'
  if (s >= 90) return '🎯 거의 완벽!'
  if (s >= 80) return '👏 잘 그렸다'
  if (s >= 70) return '🙂 나쁘지 않아'
  if (s >= 55) return '🥴 벌써 취했어?'
  return '🫠 이게 원…?'
}

// 가짜 참가자 원 (혼자 연습·혼자 보는 데모): 손으로 그린 것처럼 흔들리는 원 → 실제 채점
export function fakeCircle(rand = Math.random) {
  const q = rand() // 잘 그리는 정도
  const R = 260 + rand() * 140
  const cx = 500 + (rand() - 0.5) * 80
  const cy = 500 + (rand() - 0.5) * 80
  const w1 = (0.012 + (1 - q) * 0.13) * (rand() < 0.5 ? 1 : -1)
  const w2 = 0.008 + (1 - q) * 0.07
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const a0 = rand() * Math.PI * 2
  const dir = rand() < 0.5 ? 1 : -1
  const turns = 0.9 + rand() * 0.14
  const drift = (rand() - 0.5) * 0.08 * (1 - q * 0.6) // 끝이 안쪽/바깥쪽으로 새는 정도
  const pts = []
  const n = 90
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const a = a0 + dir * f * turns * Math.PI * 2
    const r = R * (1 + w1 * Math.sin(2 * a + p1) + w2 * Math.sin(3 * a + p2) + drift * f + (rand() - 0.5) * 0.012)
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  const res = scoreCircle(pts)
  return res.ok ? res : scoreCircle(pts.map(([x, y]) => [500 + (x - 500) * 1.2, 500 + (y - 500) * 1.2]))
}
