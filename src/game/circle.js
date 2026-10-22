// 완벽한 원 그리기: 손가락으로 한 번에 그린 선이 얼마나 동그란지 0~100점 (10/16 정삼각형~정육각형도 — 아래 '정n각형')
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

// 점수 한마디 (n: 도형 — 0 원, 3~6 정n각형)
export function circleComment(s, n = 0) {
  if (s >= 95) return '🤯 컴퓨터가 그렸나?'
  if (s >= 90) return '🎯 거의 완벽!'
  if (s >= 80) return '👏 잘 그렸다'
  if (s >= 70) return '🙂 나쁘지 않아'
  if (s >= 55) return '🥴 벌써 취했어?'
  return `🫠 이게 ${{ 3: '삼각형', 4: '사각형', 5: '오각형', 6: '육각형' }[Number(n)] || '원'}…?`
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

// ---------- 정n각형 (10/16 사용자 요청: 완벽한 원에 정삼각형~정육각형도) ----------
// 게임마다 원·정삼각형·정사각형·정오각형·정육각형 중 하나 (모두 같은 도형을 그림, 바로 전 도형은 빼고)
// 채점 (0~100) = 모양 × 꼭짓점 × 한 바퀴
//  1) 모양: 그린 선과 가장 잘 맞는 정n각형(가운데·크기·돌린 각도)을 찾아서, 선이 그 테두리에서 평균 몇 % 벗어났는지 (원과 같은 점수표)
//  2) 꼭짓점: 꼭짓점 n개가 진짜 정n각형만큼 튀어나왔는지 — 가운데에서 잰 거리가 n번 커졌다 작아지는 정도 (원처럼 둥글게 그리면 크게 감점)
//  3) 한 바퀴: 원과 같음 (97% 넘게 돌아야 만점)
export const SHAPES = [0, 3, 4, 5, 6] // 0 = 원
const SHAPE_KO = { 0: '원', 3: '정삼각형', 4: '정사각형', 5: '정오각형', 6: '정육각형' }
export const shapeName = (n) => SHAPE_KO[Number(n) || 0] || '원'
// 10/22 사용자 요청: 게임 이름 '완벽한 원' → '완벽한 도형 그리기' (그리는 도형은 따로 보여 줌)
export const CIRCLE_GAME = '완벽한 도형 그리기'
export const shapeTitle = (n) => `${CIRCLE_GAME} (${shapeName(n)})` // 기록·알림용
export function pickShape(prev, rand = Math.random) {
  const pool = SHAPES.filter((n) => n !== Number(prev ?? -1))
  return pool[Math.floor(rand() * pool.length)]
}
const CORNER_SLACK = 0.85 // 진짜 정n각형 꼭짓점의 85%만 튀어나와도 꼭짓점 만점 (손으로 그리면 조금 둥글어짐)

// 정n각형 꼭짓점 (가운데 cx, cy · 꼭짓점까지 R · 첫 꼭짓점 각도 th)
export const polyVerts = (cx, cy, R, th, n) => Array.from({ length: n }, (_, k) => [cx + R * Math.cos(th + (2 * Math.PI * k) / n), cy + R * Math.sin(th + (2 * Math.PI * k) / n)])
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(ax + t * dx - px, ay + t * dy - py)
}
// 점들이 다각형 테두리에서 평균 얼마나 떨어져 있는지
function meanPolyDist(pts, V) {
  let s = 0
  for (const [x, y] of pts) {
    let m = Infinity
    for (let k = 0; k < V.length; k++) {
      const a = V[k]
      const b = V[(k + 1) % V.length]
      const d = segDist(x, y, a[0], a[1], b[0], b[1])
      if (d < m) m = d
    }
    s += m
  }
  return s / pts.length
}
// 가운데에서 잰 거리의 n번째 성분: amp = 꼭짓점 쪽으로 튀어나온 정도 (평균 거리 대비), th = 꼭짓점 방향
function harmonic(pts, cx, cy, n) {
  let re = 0
  let im = 0
  let rs = 0
  for (const [x, y] of pts) {
    const r = Math.hypot(x - cx, y - cy)
    const a = Math.atan2(y - cy, x - cx)
    re += r * Math.cos(n * a)
    im += r * Math.sin(n * a)
    rs += r
  }
  const rbar = rs / pts.length
  return { amp: rbar > 0 ? Math.hypot(re, im) / pts.length / rbar : 0, th: Math.atan2(im, re) / n, rbar }
}
const centroid = (pts) => [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length]
// 진짜 정n각형으로 기준값: 꼭짓점 성분(amp)과 평균 거리 / 꼭짓점 거리(ratio)
const IDEAL_POLY = {}
for (const n of SHAPES.filter(Boolean)) {
  const V = polyVerts(500, 500, 300, 0.3, n)
  const dense = []
  for (let k = 0; k < n; k++) for (let i = 0; i < 40; i++) dense.push([V[k][0] + ((V[(k + 1) % n][0] - V[k][0]) * i) / 40, V[k][1] + ((V[(k + 1) % n][1] - V[k][1]) * i) / 40])
  dense.push(V[0])
  const fine = resample(dense, 256)
  const [cx, cy] = centroid(fine)
  const h = harmonic(fine, cx, cy, n)
  IDEAL_POLY[n] = { amp: h.amp, ratio: h.rbar / 300 }
}
// 가장 잘 맞는 정n각형: 무게중심·꼭짓점 방향에서 시작해 가운데·크기·각도를 조금씩 바꿔 가며 (꼭짓점/변 가운데 두 방향에서 시작해 더 나은 것)
export function fitPolygon(rs, n) {
  const [cx0, cy0] = centroid(rs)
  const h = harmonic(rs, cx0, cy0, n)
  const R0 = h.rbar / IDEAL_POLY[n].ratio
  let best = null
  for (const th0 of [h.th, h.th + Math.PI / n]) {
    let x = [cx0, cy0, R0, th0]
    let f = meanPolyDist(rs, polyVerts(x[0], x[1], x[2], x[3], n))
    let step = [0.05 * R0, 0.05 * R0, 0.05 * R0, (Math.PI / n) * 0.2]
    for (let it = 0; it < 400 && step[0] > 0.001 * R0; it++) {
      let improved = false
      for (let d = 0; d < 4 && !improved; d++) {
        for (const sg of [1, -1]) {
          const y = x.slice()
          y[d] += sg * step[d]
          const g = meanPolyDist(rs, polyVerts(y[0], y[1], y[2], y[3], n))
          if (g < f) {
            x = y
            f = g
            improved = true
            break
          }
        }
      }
      if (!improved) step = step.map((s) => s / 2)
    }
    if (!best || f < best.f) best = { x, f }
  }
  const [cx, cy, R, th] = best.x
  return { cx, cy, R: Math.abs(R), th, dev: best.f / Math.abs(R) }
}

// 정n각형 채점. 결과 { ok, s, turns, dev, corner, c:[cx,cy,R], a: 첫 꼭짓점 각도(0.1도 단위 0~3599), pts } / 다시: { ok: false, why }
export function scorePolygon(raw, n, box = CIRCLE_BOX) {
  const pts = (raw || []).filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))
  if (pts.length < 8 || pathLen(pts) < box * 0.5) return { ok: false, why: 'short' }
  let rs = resample(pts, CIRCLE_N)
  // 한 바퀴 넘게 돌면 첫 바퀴까지만
  const [mx, my] = centroid(rs)
  const t0 = turnsOf(rs, { cx: mx, cy: my })
  if (t0.turns > 1.02) {
    const k = t0.cum.findIndex((a) => Math.abs(a) >= 2 * Math.PI)
    if (k > 8) {
      const L = pathLen(rs.slice(0, k + 1))
      let acc = 0
      const cut = [pts[0]]
      for (let i = 1; i < pts.length && acc < L; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        cut.push(pts[i])
      }
      rs = resample(cut, CIRCLE_N)
    }
  }
  const fit = fitPolygon(rs, n)
  const { turns } = turnsOf(rs, { cx: fit.cx, cy: fit.cy })
  if (turns < CIRCLE_MIN_TURN) return { ok: false, why: 'turn', turns }
  if (fit.R < box * CIRCLE_MIN_R) return { ok: false, why: 'small', turns }
  const h = harmonic(resample(rs, 256), fit.cx, fit.cy, n)
  const corner = Math.sqrt(Math.min(1, h.amp / (CORNER_SLACK * IDEAL_POLY[n].amp)))
  const shape = Math.exp(-K * fit.dev)
  const full = Math.min(1, turns / CIRCLE_FULL_TURN)
  const s = Math.round(1000 * shape * corner * Math.pow(full, 1.6)) / 10
  const clamp = (v) => Math.max(0, Math.min(box, Math.round(v)))
  const deg = ((((fit.th * 180) / Math.PI) % 360) + 360) % 360
  return {
    ok: true,
    s: Math.max(0, Math.min(100, s)),
    turns: Math.round(turns * 100) / 100,
    dev: Math.round(fit.dev * 1000) / 1000,
    corner: Math.round(corner * 1000) / 1000,
    c: [clamp(fit.cx), clamp(fit.cy), clamp(fit.R)],
    a: Math.round(deg * 10) % 3600,
    pts: rs.flatMap((q) => [clamp(q[0]), clamp(q[1])]),
  }
}
// 원이면 scoreCircle, 정n각형이면 scorePolygon
export const scoreShape = (raw, n) => (Number(n) >= 3 ? scorePolygon(raw, Number(n)) : scoreCircle(raw))

// 결과에 그릴 정n각형 꼭짓점 (저장된 c = [cx, cy, R], a = 0.1도 단위)
export const resultVerts = (r, n) => {
  const c = Array.isArray(r?.c) ? r.c : Object.values(r?.c || {})
  return c.length === 3 && Number(n) >= 3 ? polyVerts(c[0], c[1], c[2], ((Number(r?.a) || 0) / 10) * (Math.PI / 180), Number(n)) : null
}

// 가짜 참가자 정n각형 (손으로 그린 것처럼: 꼭짓점 위치가 조금씩 어긋나고, 변이 휘고, 모서리가 둥글고, 한 바퀴 언저리)
export function fakeShape(n, rand = Math.random) {
  if (!(Number(n) >= 3)) return fakeCircle(rand)
  n = Number(n)
  const q = rand()
  const R = 260 + rand() * 140
  const cx = 500 + (rand() - 0.5) * 80
  const cy = 500 + (rand() - 0.5) * 80
  const th = rand() * Math.PI * 2
  const jit = 0.01 + (1 - q) * 0.1
  const V = Array.from({ length: n }, (_, k) => {
    const a = th + (2 * Math.PI * k) / n + (rand() - 0.5) * 2 * jit * 0.7
    const rr = R * (1 + (rand() - 0.5) * 2 * jit)
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  })
  const bows = V.map(() => (rand() - 0.5) * 2 * (0.01 + (1 - q) * 0.08))
  const total = n * (0.93 + rand() * 0.11)
  const start = rand() * n
  const steps = 150
  const raw = []
  for (let i = 0; i <= steps; i++) {
    const u = start + (i / steps) * total
    const k = Math.floor(u) % n
    const f = u - Math.floor(u)
    const A = V[k]
    const B = V[(k + 1) % n]
    const ex = B[0] - A[0]
    const ey = B[1] - A[1]
    const L = Math.hypot(ex, ey) || 1
    const off = bows[k] * L * Math.sin(Math.PI * f)
    raw.push([A[0] + ex * f - (ey / L) * off + (rand() - 0.5) * 5, A[1] + ey * f + (ex / L) * off + (rand() - 0.5) * 5])
  }
  const w = Math.round(1 + (1 - q) * 3) // 모서리 둥근 정도
  const pts = raw.map((_, i) => {
    let sx = 0
    let sy = 0
    let c = 0
    for (let j = Math.max(0, i - w); j <= Math.min(raw.length - 1, i + w); j++) {
      sx += raw[j][0]
      sy += raw[j][1]
      c++
    }
    return [sx / c, sy / c]
  })
  const res = scorePolygon(pts, n)
  return res.ok ? res : scorePolygon(pts.map(([x, y]) => [500 + (x - 500) * 1.2, 500 + (y - 500) * 1.2]), n)
}
