// 3D 수달 말 (Three.js) — 사진을 세워 놓는 방식이 아니라 실제 입체 모델이라 어느 방향으로든 돌려 볼 수 있음
//  · 갈색 털: 몸·머리·팔·꼬리를 겹겹이 부풀린 '털 껍질(shell)' 셰이더로 털이 보송하게 보임
//  · 크림색 얼굴(볼·주둥이·턱)과 가슴·배, 눈썹 자리 밝은 털 — 꼭짓점 색으로 경계를 부드럽게
//  · 까만 눈(반짝임), 코, 웃는 입과 혀, 귀, 수염, 앞발(손가락), 뒷발(발가락·발톱), 두툼한 꼬리
//  · 팀 표시는 목띠와 원형 받침만 바뀜 (털 색과 모양은 모든 팀이 같음)
// 좌표: y 가 위, 수달은 +z 쪽을 봄. size 1 = 받침 바닥부터 머리 끝까지 약 1.3
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 팀 색 (참고 이미지 기준) — 1팀 빨강, 2팀 파랑, 3팀 초록, 4팀 노랑 (게임의 team 0~3)
export const OTTER_TEAMS = [
  { name: '빨강팀', color: '#d4202a' },
  { name: '파랑팀', color: '#1252c4' },
  { name: '초록팀', color: '#11993f' },
  { name: '노랑팀', color: '#f7be0a' },
]
export const OTTER_HEIGHT = 1.3

// 털·피부 색 (참고 이미지에서 뽑은 색을 조명 받기 전 색으로 조금 밝게)
const C = {
  fur: new THREE.Color('#7a4c2c'),
  furDark: new THREE.Color('#5a3720'),
  furTop: new THREE.Color('#8a5a36'),
  cream: new THREE.Color('#ecd3b3'),
  chest: new THREE.Color('#e3c4a0'),
  brow: new THREE.Color('#f1dcc0'),
  paw: new THREE.Color('#4e3122'),
  nose: new THREE.Color('#3d261b'),
}

// ---------- 모양 도우미 ----------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// 모양을 몇 조각으로 나눌지 (FULL = 예시 페이지·가까이 보기, SMALL = 게임 판 위 작은 말: 삼각형 약 1/8)
const DETAIL = {
  full: { lathe: 64, latheS: 40, ell: [40, 28], head: [64, 48], arm: [28, 18], tail: [56, 22], cap: 10, claw: 8, eye: [28, 20], shine: [12, 8], shine2: [8, 6], mouth: [40, 28], collar: 72, base: 72, whiskers: true, claws: true },
  small: { lathe: 22, latheS: 16, ell: [14, 10], head: [26, 18], arm: [10, 8], tail: [16, 8], cap: 6, claw: 5, eye: [12, 9], shine: [6, 4], shine2: [5, 3], mouth: [16, 10], collar: 28, base: 30, whiskers: false, claws: false },
}
let Q = DETAIL.full
// 회전체: [반지름, 높이] 점들을 부드러운 곡선으로 이어서 돌림
function lathe(points, segments = 56, samples = Q.latheS) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)))
  const pts = curve.getPoints(samples).map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y))
  const g = new THREE.LatheGeometry(pts, segments)
  g.computeVertexNormals()
  return g
}
function ellipsoid(r, sx, sy, sz, w = Q.ell[0], h = Q.ell[1]) {
  const g = new THREE.SphereGeometry(r, w, h)
  g.scale(sx, sy, sz)
  return g
}
// 굵기가 점점 가늘어지는 관 (꼬리·팔): 곡선 위 점마다 원을 만들어 이음
function taperTube(points, radius, tubular = 48, radial = 20, capEnd = true) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const frames = curve.computeFrenetFrames(tubular, false)
  const pos = []
  const idx = []
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    const p = curve.getPointAt(t)
    const r = radius(t)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z))
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  let g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  if (capEnd) {
    // 끝을 둥글게 막음
    const end = curve.getPointAt(1)
    const cap = new THREE.SphereGeometry(radius(1), radial, Q.cap)
    cap.translate(end.x, end.y, end.z)
    cap.deleteAttribute('uv')
    g = mergeGeometries([g, cap])
  }
  return g
}
// 꼭짓점 색 (위치·법선 → 색)
function paint(g, fn) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const col = new Float32Array(p.count * 3)
  const P = new THREE.Vector3()
  const Nn = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    P.fromBufferAttribute(p, i)
    Nn.fromBufferAttribute(n, i)
    const c = fn(P, Nn)
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
// 털 길이 배율 (얼굴·발은 짧게, 등·꼬리는 길게)
function furLen(g, fn) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const a = new Float32Array(p.count)
  const P = new THREE.Vector3()
  const Nn = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    P.fromBufferAttribute(p, i)
    Nn.fromBufferAttribute(n, i)
    a[i] = typeof fn === 'number' ? fn : fn(P, Nn)
  }
  g.setAttribute('furLen', new THREE.BufferAttribute(a, 1))
  return g
}
const mix = (a, b, t) => a.clone().lerp(b, Math.min(1, Math.max(0, t)))
const clean = (g) => {
  g = g.index ? g : g
  if (g.attributes.uv) g.deleteAttribute('uv')
  return g
}
function placed(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  g.rotateX(rx)
  g.rotateY(ry)
  g.rotateZ(rz)
  g.translate(x, y, z)
  return g
}

// ---------- 몸통·머리 위치 ----------
const BASE_TOP = 0.1
const HEAD = { x: 0, y: 0.98, z: 0.04, r: 0.335, sx: 1.1, sy: 0.9, sz: 0.98 }
// 머리 기준 좌표 (단위 구 표면 → 실제 위치)
const onHead = (nx, ny, nz, out = 0) => {
  const l = Math.hypot(nx, ny, nz)
  const r = HEAD.r + out
  return v3(HEAD.x + (nx / l) * r * HEAD.sx, HEAD.y + (ny / l) * r * HEAD.sy, HEAD.z + (nz / l) * r * HEAD.sz)
}

const SHARED = {}
// 모든 말이 같이 쓰는 모양 (자세함 단계마다 한 번만 만듦)
function buildShared(lod = 'full') {
  if (SHARED[lod]) return SHARED[lod]
  Q = DETAIL[lod] || DETAIL.full
  // --- 털이 나는 부분 (하나로 합쳐 털 껍질을 한 번에 그림) ---
  // 몸통: 엉덩이가 넓고 어깨로 갈수록 좁아지는 배 모양, 앞뒤로 살짝 납작
  const body = lathe(
    [
      [0.22, BASE_TOP - 0.01],
      [0.315, BASE_TOP + 0.035],
      [0.355, BASE_TOP + 0.13],
      [0.355, BASE_TOP + 0.25],
      [0.33, BASE_TOP + 0.38],
      [0.29, BASE_TOP + 0.5],
      [0.255, BASE_TOP + 0.6],
      [0.235, BASE_TOP + 0.7],
      [0.2, BASE_TOP + 0.8],
    ],
    Q.lathe,
  )
  body.scale(1, 1, 0.9)
  body.computeVertexNormals()
  paint(body, (p, n) => {
    // 가슴·배 크림색: 앞쪽, 위는 넓고 아래로 갈수록 좁게
    const h = (p.y - BASE_TOP) / 0.78
    const width = 0.2 + 0.42 * smooth(0.0, 0.85, h)
    const front = smooth(0.1, 0.45, n.z) * smooth(width + 0.12, width - 0.08, Math.abs(n.x))
    const band = smooth(0.06, 0.2, h)
    const m = front * band
    const back = smooth(0.2, -0.6, n.z) // 등은 조금 더 진하게
    return mix(mix(C.fur, C.furDark, back * 0.6), C.chest, m)
  })
  furLen(body, (p, n) => 0.9 + 0.25 * smooth(0.2, -0.8, n.z))

  // 넓적다리 (앉은 엉덩이 볼륨)
  const thighs = [-1, 1].map((s) => {
    const g = ellipsoid(0.15, 1, 0.85, 1.1)
    placed(g, { x: s * 0.19, y: BASE_TOP + 0.12, z: 0.11 })
    paint(g, (p, n) => mix(C.fur, C.chest, smooth(0.55, 0.95, n.z) * 0.25))
    furLen(g, 0.9)
    return g
  })

  // 머리: 넓고 위가 평평한 수달 머리
  const head = ellipsoid(HEAD.r, HEAD.sx, HEAD.sy, HEAD.sz, Q.head[0], Q.head[1])
  head.translate(HEAD.x, HEAD.y, HEAD.z)
  paint(head, (p) => {
    const nx = (p.x - HEAD.x) / (HEAD.r * HEAD.sx)
    const ny = (p.y - HEAD.y) / (HEAD.r * HEAD.sy)
    const nz = (p.z - HEAD.z) / (HEAD.r * HEAD.sz)
    // 크림색 얼굴: 코 높이에서 시작해 옆으로 갈수록 올라가 귀 아래까지 (뒤통수는 갈색)
    const edge = -0.05 + 0.32 * nx * nx
    const lower = smooth(edge + 0.07, edge - 0.05, ny)
    const front = smooth(-0.55, -0.05, nz)
    let c = mix(C.fur, C.cream, lower * front)
    // 눈썹 자리 밝은 털
    for (const s of [-1, 1]) {
      const d = Math.hypot(nx - s * 0.33, ny - 0.47, nz - 0.82)
      c = mix(c, C.brow, smooth(0.2, 0.06, d))
    }
    // 정수리는 살짝 밝게, 코 위 콧등은 진하게
    c = mix(c, C.furTop, smooth(0.55, 0.95, ny) * 0.5)
    c = mix(c, C.furDark, smooth(0.16, 0.0, Math.abs(nx)) * smooth(0.0, 0.3, ny) * smooth(0.6, 0.95, nz) * 0.55)
    return c
  })
  furLen(head, (p, n) => {
    const nz = (p.z - HEAD.z) / (HEAD.r * HEAD.sz)
    return 0.55 + 0.4 * smooth(0.9, 0.2, nz) // 얼굴 앞은 짧은 털
  })

  // 볼(수염 자리) 두 개 + 턱: 통통한 크림색 주둥이
  const muzzle = []
  for (const s of [-1, 1]) {
    const g = ellipsoid(0.1, 1.1, 0.88, 0.95)
    const c = onHead(s * 0.25, -0.24, 0.93, -0.03)
    placed(g, { x: c.x, y: c.y, z: c.z })
    paint(g, () => C.cream)
    furLen(g, 0.4)
    muzzle.push(g)
  }
  {
    const g = ellipsoid(0.08, 1.3, 0.75, 0.9)
    const c = onHead(0, -0.58, 0.74, -0.04)
    placed(g, { x: c.x, y: c.y, z: c.z })
    paint(g, () => C.cream)
    furLen(g, 0.4)
    muzzle.push(g)
  }

  // 팔: 어깨에서 가슴 앞으로 모은 앞발 (팔뚝은 갈색 털)
  const arms = [-1, 1].map((s) =>
    taperTube(
      [v3(s * 0.22, BASE_TOP + 0.62, 0.06), v3(s * 0.27, BASE_TOP + 0.5, 0.2), v3(s * 0.19, BASE_TOP + 0.43, 0.33), v3(s * 0.12, BASE_TOP + 0.43, 0.38)],
      (t) => 0.095 - 0.022 * t,
      Q.arm[0],
      Q.arm[1],
      false,
    ),
  )
  arms.forEach((g) => {
    paint(g, () => C.fur)
    furLen(g, 0.75)
  })

  // 꼬리: 엉덩이 뒤에서 나와 받침 위에 누워 옆으로 휘고, 끝이 살짝 들림 (뿌리가 굵음)
  const tail = taperTube(
    [v3(0.04, BASE_TOP + 0.16, -0.24), v3(0.26, BASE_TOP + 0.1, -0.34), v3(0.46, BASE_TOP + 0.09, -0.27), v3(0.58, BASE_TOP + 0.12, -0.1), v3(0.62, BASE_TOP + 0.22, 0.04)],
    (t) => 0.14 * (1 - t) ** 0.8 + 0.04 * t,
    Q.tail[0],
    Q.tail[1],
    true,
  )
  paint(tail, (p, n) => mix(C.fur, C.furDark, 0.35 + 0.3 * smooth(0, 1, n.y)))
  furLen(tail, 0.8)

  const furParts = [body, ...thighs, head, ...muzzle, ...arms, tail].map(clean)
  furParts.forEach((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'furLen'].includes(k)) g.deleteAttribute(k)
  })
  const fur = mergeGeometries(furParts.map((g) => (g.index ? g : g)), false)

  // --- 털 없는 부분 ---
  // 앞발 (손): 진한 갈색, 손가락 4개
  const paws = []
  for (const s of [-1, 1]) {
    // 손등: 납작하게 아래로 굽힌 손 + 손가락 4개가 아래로 모임
    const hand = ellipsoid(0.07, 1.08, 0.66, 1.0)
    placed(hand, { x: s * 0.115, y: BASE_TOP + 0.415, z: 0.405, rx: 0.45 })
    paws.push(hand)
    for (let k = 0; k < 4; k++) {
      const f = ellipsoid(0.022, 0.95, 1.35, 0.95)
      const a = (k - 1.5) * 0.3
      placed(f, { x: s * 0.115 + Math.sin(a) * 0.056, y: BASE_TOP + 0.37, z: 0.432 + Math.cos(a) * 0.022, rx: 0.25 })
      paws.push(f)
    }
  }
  // 뒷발: 받침 위로 나온 넓적한 발 + 발가락 4개
  for (const s of [-1, 1]) {
    const foot = ellipsoid(0.105, 0.95, 0.45, 1.5)
    placed(foot, { x: s * 0.19, y: BASE_TOP + 0.04, z: 0.27, ry: s * -0.18 })
    paws.push(foot)
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * 0.36
      const t = ellipsoid(0.03, 1, 0.75, 1.15)
      placed(t, { x: s * 0.19 + Math.sin(a + s * -0.18) * 0.09, y: BASE_TOP + 0.028, z: 0.27 + Math.cos(a) * 0.15 + 0.01 })
      paws.push(t)
    }
  }
  const pawGeo = mergeGeometries(paws.map(clean))

  // 발톱 (뒷발 발가락 끝, 작은 원뿔)
  const claws = []
  for (const s of Q.claws ? [-1, 1] : [])
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * 0.36
      const c = new THREE.ConeGeometry(0.009, 0.03, Q.claw)
      placed(c, { x: s * 0.19 + Math.sin(a + s * -0.18) * 0.097, y: BASE_TOP + 0.022, z: 0.27 + Math.cos(a) * 0.18 + 0.012, rx: Math.PI / 2 + 0.25 })
      claws.push(c)
    }
  const clawGeo = claws.length ? mergeGeometries(claws.map(clean)) : new THREE.BufferGeometry()

  // 코: 둥근 역삼각 느낌
  const nose = ellipsoid(0.058, 1.35, 0.78, 0.82)
  {
    const c = onHead(0, -0.08, 1, -0.012)
    placed(nose, { x: c.x, y: c.y + 0.006, z: c.z + 0.03 })
  }
  // 입: 웃으며 벌린 입(안쪽 진한 색) + 분홍 혀
  // 입: 'D' 모양으로 벌린 입 (위는 평평, 아래는 둥글게) 안에 혀
  const mouth = ellipsoid(0.088, 1.3, 0.85, 0.55, Q.mouth[0], Q.mouth[1])
  {
    const p = mouth.attributes.position
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.025) p.setY(i, 0.025 + (p.getY(i) - 0.025) * 0.25)
    mouth.computeVertexNormals()
  }
  const tongue = ellipsoid(0.056, 1.3, 0.55, 1.0)
  {
    const c = onHead(0, -0.45, 0.9, -0.03)
    placed(mouth, { x: c.x, y: c.y, z: c.z + 0.032 })
    placed(tongue, { x: c.x, y: c.y - 0.034, z: c.z + 0.04 })
  }
  // 눈: 까맣고 반짝이는 큰 눈 + 하이라이트
  const eyes = []
  const shines = []
  for (const s of [-1, 1]) {
    const c = onHead(s * 0.37, 0.15, 0.92, -0.02)
    const e = new THREE.SphereGeometry(0.06, Q.eye[0], Q.eye[1])
    e.scale(1, 1.06, 0.78)
    placed(e, { x: c.x, y: c.y, z: c.z })
    eyes.push(e)
    const h = new THREE.SphereGeometry(0.015, Q.shine[0], Q.shine[1])
    placed(h, { x: c.x - 0.016, y: c.y + 0.022, z: c.z + 0.043 })
    shines.push(h)
    const h2 = new THREE.SphereGeometry(0.0065, Q.shine2[0], Q.shine2[1])
    placed(h2, { x: c.x + 0.015, y: c.y - 0.015, z: c.z + 0.045 })
    shines.push(h2)
  }
  // 귀: 머리 옆 작고 둥근 귀
  const ears = []
  for (const s of [-1, 1]) {
    const c = onHead(s * 0.9, 0.42, -0.12, -0.005)
    const g = ellipsoid(0.07, 0.55, 0.92, 0.88)
    placed(g, { x: c.x, y: c.y, z: c.z, rz: s * 0.35 })
    ears.push(g)
  }
  // 수염: 볼에서 양옆으로 휘어 나오는 가는 흰 털 (한쪽 5가닥)
  const whiskers = []
  for (const s of Q.whiskers ? [-1, 1] : [])
    for (let k = 0; k < 5; k++) {
      const start = onHead(s * (0.4 + k * 0.012), -0.26 - k * 0.045, 0.86, 0.025)
      const dy = (k - 2) * 0.05
      const pts = [start, v3(start.x + s * 0.14, start.y + dy * 0.4 + 0.01, start.z - 0.02), v3(start.x + s * 0.3, start.y + dy - 0.02, start.z - 0.08)]
      whiskers.push(clean(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0032, 5, false)))
    }
  const whiskerGeo = whiskers.length ? mergeGeometries(whiskers) : new THREE.BufferGeometry()

  // 목띠: 턱 아래 천 띠 (팀 색)
  // 천 띠 모양 (도넛이 아니라 납작한 띠): 단면이 둥근 직사각형
  const CR = 0.272
  const CH = 0.082
  const collar = new THREE.LatheGeometry(
    [
      new THREE.Vector2(CR - 0.012, -CH / 2),
      new THREE.Vector2(CR + 0.012, -CH / 2 + 0.004),
      new THREE.Vector2(CR + 0.026, -CH / 2 + 0.016),
      new THREE.Vector2(CR + 0.03, 0),
      new THREE.Vector2(CR + 0.026, CH / 2 - 0.016),
      new THREE.Vector2(CR + 0.012, CH / 2 - 0.004),
      new THREE.Vector2(CR - 0.012, CH / 2),
    ],
    Q.collar,
  )
  collar.computeVertexNormals()
  collar.scale(1.0, 1.0, 0.93)
  collar.rotateX(0.08) // 앞쪽이 살짝 내려감
  collar.translate(0, BASE_TOP + 0.585, 0.02)

  // 원형 받침 (팀 색): 가장자리가 둥근 원판
  const base = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0001, 0),
      new THREE.Vector2(0.58, 0),
      new THREE.Vector2(0.6, 0.015),
      new THREE.Vector2(0.605, 0.04),
      new THREE.Vector2(0.6, BASE_TOP - 0.03),
      new THREE.Vector2(0.585, BASE_TOP - 0.008),
      new THREE.Vector2(0.55, BASE_TOP),
      new THREE.Vector2(0.0001, BASE_TOP),
    ],
    Q.base,
  )
  base.computeVertexNormals()

  SHARED[lod] = { fur, pawGeo, clawGeo, nose, mouth, tongue, eyes: mergeGeometries(eyes), shines: mergeGeometries(shines), ears: mergeGeometries(ears.map(clean)), whiskerGeo, collar, base }
  Q = DETAIL.full
  return SHARED[lod]
}

// ---------- 털 껍질 재질 ----------
// 같은 모양을 법선 방향으로 조금씩 부풀린 층을 여러 장 그리고, 층마다 털 가닥(작은 점) 자리만 남겨서 털처럼 보이게 함
const FUR_LEN = 0.02
const FUR_DENSITY = 210
const furMats = new Map()
function furMaterial(shell, layers) {
  const key = `${shell}/${layers}`
  if (furMats.has(key)) return furMats.get(key)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  const t = layers ? shell / layers : 0
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uShell = { value: t }
    sh.uniforms.uFurLen = { value: FUR_LEN }
    sh.uniforms.uDensity = { value: FUR_DENSITY }
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float furLen;
uniform float uShell;
uniform float uFurLen;
varying vec3 vFurPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFurPos = position;
float fl = uShell * uFurLen * furLen;
transformed += normal * fl;
transformed.y -= uShell * uShell * uFurLen * 0.35 * furLen;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uShell;
uniform float uDensity;
varying vec3 vFurPos;
float furHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 fc = mat3(0.788, 0.369, -0.492, -0.246, 0.912, 0.328, 0.564, -0.180, 0.806) * vFurPos * uDensity;
float strand = furHash(floor(fc));
if (uShell > 0.0) {
  vec3 f = fract(fc) - 0.5;
  if (strand < uShell * 0.92 || length(f) > 0.62 - uShell * 0.42) discard;
}
// 뿌리는 어둡게, 끝은 밝게 + 가닥마다 색 조금씩 다르게
diffuseColor.rgb *= mix(0.62, 1.12, uShell) * mix(0.86, 1.14, furHash(floor(fc * 0.5) + 7.0));`,
      )
  }
  m.customProgramCacheKey = () => 'otter-fur-v2'
  furMats.set(key, m)
  return m
}

// ---------- 털 없는 부분 재질 (모든 말이 같이 씀) ----------
let MATS = null
function sharedMaterials() {
  if (MATS) return MATS
  MATS = {
    paw: new THREE.MeshStandardMaterial({ color: C.paw, roughness: 0.62 }),
    claw: new THREE.MeshStandardMaterial({ color: '#d8cbbb', roughness: 0.5 }),
    nose: new THREE.MeshPhysicalMaterial({ color: C.nose, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    mouth: new THREE.MeshStandardMaterial({ color: '#3a1215', roughness: 0.8 }),
    tongue: new THREE.MeshPhysicalMaterial({ color: '#e07b86', roughness: 0.4, clearcoat: 0.4 }),
    eye: new THREE.MeshPhysicalMaterial({ color: '#0d0b0a', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    ear: new THREE.MeshStandardMaterial({ color: C.furDark, roughness: 0.85 }),
    whisker: new THREE.MeshStandardMaterial({ color: '#f7f0e6', roughness: 0.5, transparent: true, opacity: 0.9 }),
  }
  return MATS
}
const teamMats = new Map()
function teamMaterials(team) {
  const t = ((team % OTTER_TEAMS.length) + OTTER_TEAMS.length) % OTTER_TEAMS.length
  if (teamMats.has(t)) return teamMats.get(t)
  const color = new THREE.Color(OTTER_TEAMS[t].color)
  const m = {
    base: new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    collar: new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.96), roughness: 0.72 }),
  }
  teamMats.set(t, m)
  return m
}

/**
 * 수달 말 만들기.
 * @param {object} opt
 * @param {number} opt.team  팀 번호 0~3 (0 = 1팀 빨강, 1 = 2팀 파랑, 2 = 3팀 초록, 3 = 4팀 노랑) — 게임의 TEAM_INFO 순서와 같음
 * @param {number} opt.size  크기 배율 (1 = 키 약 1.3)
 * @param {'high'|'low'|'off'} opt.fur  털 껍질 품질 (high 12겹, low 6겹, off 털 없이 매끈하게)
 * @param {'full'|'small'} opt.lod  모양 자세함 (small = 게임 판 위 작은 말용, 삼각형이 훨씬 적음)
 * @returns {THREE.Group} group.userData = { team, size, setTeam(t), setSize(s) }
 */
export function createOtterPiece({ team = 0, size = 1, fur = 'high', lod = 'full' } = {}) {
  const S = buildShared(lod)
  const M = sharedMaterials()
  const layers = fur === 'off' ? 0 : fur === 'low' ? 6 : 12
  const g = new THREE.Group()
  g.name = 'otter'
  const model = new THREE.Group() // 몸 전체 (받침 제외) — 애니메이션용
  model.name = 'otter-body'
  g.add(model)

  // 털: 맨 아래 층(불투명) + 털 껍질 층
  const furBase = new THREE.Mesh(S.fur, furMaterial(0, layers))
  furBase.castShadow = true
  furBase.receiveShadow = true
  model.add(furBase)
  for (let i = 1; i <= layers; i++) {
    const shell = new THREE.Mesh(S.fur, furMaterial(i, layers))
    shell.renderOrder = i
    model.add(shell)
  }
  const add = (geo, mat, shadow = true) => {
    if (!geo.attributes.position) return null // 작은 말에서 뺀 부분 (수염·발톱)
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = shadow
    model.add(m)
    return m
  }
  add(S.pawGeo, M.paw)
  add(S.clawGeo, M.claw, false)
  add(S.nose, M.nose)
  add(S.mouth, M.mouth, false)
  add(S.tongue, M.tongue, false)
  add(S.eyes, M.eye)
  add(S.shines, M.shine, false)
  add(S.ears, M.ear)
  add(S.whiskerGeo, M.whisker, false)

  const T = teamMaterials(team)
  const collar = new THREE.Mesh(S.collar, T.collar)
  collar.castShadow = true
  collar.name = 'collar'
  model.add(collar)
  const base = new THREE.Mesh(S.base, T.base)
  base.castShadow = true
  base.receiveShadow = true
  base.name = 'base'
  g.add(base)

  g.userData = {
    team,
    size,
    setTeam(t) {
      const tm = teamMaterials(t)
      collar.material = tm.collar
      base.material = tm.base
      g.userData.team = t
    },
    setSize(s) {
      g.scale.setScalar(s)
      g.userData.size = s
    },
  }
  g.scale.setScalar(size)
  return g
}

// 살짝 숨 쉬듯 움직이기 (t = 초). 말마다 phase 를 다르게 주면 자연스러움
export function animateOtter(piece, t, phase = 0) {
  const body = piece.children[0]
  if (!body) return
  const b = Math.sin(t * 2.2 + phase)
  body.scale.set(1 + b * 0.006, 1 + b * 0.012, 1 + b * 0.006)
  body.rotation.z = Math.sin(t * 1.1 + phase) * 0.02
}
