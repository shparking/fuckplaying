// 3D 윷 던지기: 윷가락 4개를 손에서 던진 것처럼 날아가 떨어져 튀고 구르다가, 정해진 결과 면으로 멈춤 (바닥 판 없이 그림자만)
//  · 결과(배/등)는 서버에서 정한 sticks 그대로 → 모든 폰이 같은 결과
//  · 움직임은 던지기 id 로 정한 난수라 모든 폰에서 똑같이 보임
//  · 배(평평한 면, X 무늬) = true, 등(둥근 면) = false. 0번 윷가락은 빽도 윷: 배에 XXX 대신 '-'
import * as THREE from 'three'

export const THROW_FLIGHT_MS = 1250 // 날아가서 멈출 때까지

const L = 1.7 // 윷가락 길이
const R = 0.17 // 반지름 (반원 단면)

function rng(seedStr) {
  let h = 1779033703 ^ String(seedStr).length
  for (const ch of String(seedStr)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353) ^ (h >>> 13)
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
const ease = (t) => 1 - Math.pow(1 - t, 3)

// ---------- 질감 (캔버스로 그림) ----------
function woodTexture(light, marks, backdo) {
  const w = 512
  const h = 64
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, h)
  if (light) {
    grad.addColorStop(0, '#f1d9ab')
    grad.addColorStop(0.5, '#fff0d2')
    grad.addColorStop(1, '#ecd09c')
  } else {
    grad.addColorStop(0, '#7a461b')
    grad.addColorStop(0.5, '#b57b45')
    grad.addColorStop(1, '#6f3f18')
  }
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  // 나뭇결
  g.globalAlpha = light ? 0.18 : 0.28
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = light ? '#a87a42' : '#4a2a0e'
    g.lineWidth = 1 + (i % 3)
    g.beginPath()
    const y = (i * 37) % h
    g.moveTo(0, y)
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3)
    g.stroke()
  }
  g.globalAlpha = 1
  if (marks) {
    g.strokeStyle = '#3b2410'
    g.lineCap = 'round'
    if (backdo) {
      // 빽도 윷: XXX 대신 가운데 '-' 하나
      g.lineWidth = 10
      g.beginPath()
      g.moveTo(w * 0.5 - 34, h / 2)
      g.lineTo(w * 0.5 + 34, h / 2)
      g.stroke()
    } else {
      // X 무늬 3개
      g.lineWidth = 7
      ;[0.26, 0.5, 0.74].forEach((f) => {
        const cx = w * f
        g.beginPath()
        g.moveTo(cx - 16, 16)
        g.lineTo(cx + 16, h - 16)
        g.moveTo(cx + 16, 16)
        g.lineTo(cx - 16, h - 16)
        g.stroke()
      })
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
// 윷가락 하나: 반원기둥 (평평한 면 +y, 길이는 x 방향)
function makeStick(i, mats) {
  const g = new THREE.Group()
  const round = new THREE.CylinderGeometry(R, R, L, 28, 1, false, Math.PI / 2, Math.PI)
  round.rotateZ(Math.PI / 2) // 길이 → x
  round.rotateX(-Math.PI / 2) // 잘린 면 → 위(+y)
  const body = new THREE.Mesh(round, [mats.round, mats.cap, mats.cap])
  body.castShadow = true
  g.add(body)
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(L, R * 2), i === 0 ? mats.flatBack : mats.flat)
  flat.rotation.x = -Math.PI / 2
  flat.position.y = 0.0005
  flat.castShadow = true
  g.add(flat)
  return g
}

let S = null
function setup() {
  if (S) return S
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.domElement.className = 'throw3d-canvas'
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60)
  scene.add(new THREE.HemisphereLight('#fff4e2', '#3a2610', 1.05))
  const key = new THREE.DirectionalLight('#fff1dc', 2.3)
  key.position.set(-2.5, 7, 3.5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -4
  key.shadow.camera.right = 4
  key.shadow.camera.top = 4
  key.shadow.camera.bottom = -4
  key.shadow.bias = -0.0005
  scene.add(key)
  // 바닥 판(멍석)은 그리지 않음: 윷가락만 보이고, 떨어진 자리에 그림자만 은은하게
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.ShadowMaterial({ opacity: 0.38 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const mats = {
    flat: new THREE.MeshStandardMaterial({ map: woodTexture(true, true, false), roughness: 0.55 }),
    flatBack: new THREE.MeshStandardMaterial({ map: woodTexture(true, true, true), roughness: 0.55 }),
    round: new THREE.MeshStandardMaterial({ map: woodTexture(false, false, false), roughness: 0.45 }),
    cap: new THREE.MeshStandardMaterial({ color: '#8a5326', roughness: 0.6 }),
  }
  const sticks = [0, 1, 2, 3].map((i) => {
    const s = makeStick(i, mats)
    scene.add(s)
    return s
  })
  S = { renderer, scene, camera, sticks, raf: 0, plan: null }
  return S
}

// 멈춘 윷가락끼리 겹치지 않게: 위에서 본 직사각형(길이 L+여유, 폭 2R+여유)이 서로 안 겹치는지 (분리축 검사)
function rectsOverlap(a, b) {
  const corners = (q) => {
    const c = Math.cos(q.yaw)
    const s = Math.sin(q.yaw)
    const hx = (L + 0.12) / 2
    const hz = R + 0.06
    return [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ].map(([x, z]) => [q.x + x * c + z * s, q.z - x * s + z * c])
  }
  const A = corners(a)
  const B = corners(b)
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2].map((t) => [Math.cos(t), -Math.sin(t)])
  return axes.every(([ax, az]) => {
    const pa = A.map(([x, z]) => x * ax + z * az)
    const pb = B.map(([x, z]) => x * ax + z * az)
    return Math.max(...pa) > Math.min(...pb) && Math.max(...pb) > Math.min(...pa)
  })
}
// 떨어질 자리: 대체로 나란히, 조금씩 비뚤게 (겹치면 다시 뽑음)
function landSpots(r) {
  let best = null
  for (let tries = 0; tries < 60; tries++) {
    const order = [0, 1, 2, 3].sort(() => r() - 0.5)
    const spots = [0, 1, 2, 3].map((i) => {
      const row = order[i]
      return { x: (r() - 0.5) * 0.9, z: (row - 1.5) * 0.56 + (r() - 0.5) * 0.16 - 0.15, yaw: (r() - 0.5) * 0.7 }
    })
    let bad = 0
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (rectsOverlap(spots[i], spots[j])) bad++
    if (!bad) return spots
    if (!best || bad < best.bad) best = { spots, bad }
  }
  return best.spots
}
// 윷가락마다 날아가는 경로 (던지기 id 로 정함 → 모든 폰 같음)
function makePlan(id, faces) {
  const r = rng(id || 'x')
  const spots = landSpots(r)
  return faces.map((flatUp, i) => {
    const land = new THREE.Vector3(spots[i].x, 0, spots[i].z)
    const start = new THREE.Vector3((r() - 0.5) * 0.8, 0.9, 3.4 + r() * 0.4)
    const yaw0 = (r() - 0.5) * 0.8 + (r() < 0.5 ? Math.PI : 0)
    const yaw1 = spots[i].yaw + (yaw0 > 2 ? Math.PI : 0)
    const rolls = 3 + Math.floor(r() * 3) // 공중에서 몇 바퀴 구르는지
    const roll1 = flatUp ? 0 : Math.PI
    const tumble = (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)) * Math.PI * 2 // 앞뒤로 재주넘기
    const tLand = 0.5 + r() * 0.08 // 처음 땅에 닿는 시점 (전체 비율)
    const peak = 2.3 + r() * 0.9
    const slide = new THREE.Vector3((r() - 0.5) * 0.12, 0, -0.04 - r() * 0.06)
    return { land, start, yaw0, yaw1, rolls, roll1, tumble, tLand, peak, slide, wob: 0.35 + r() * 0.3, delay: i * 0.035 }
  })
}

function poseAt(p, u) {
  // u: 0~1 (윷가락마다 조금씩 늦게 출발)
  const t = Math.min(1, Math.max(0, (u - p.delay) / (1 - p.delay)))
  const pos = new THREE.Vector3()
  let roll
  let pitch
  if (t < p.tLand) {
    // 공중: 포물선 + 구르기
    const k = t / p.tLand
    pos.lerpVectors(p.start, new THREE.Vector3().copy(p.land).sub(p.slide), k)
    pos.y = p.start.y * (1 - k) + R + 4 * p.peak * k * (1 - k)
    roll = p.roll1 + p.rolls * Math.PI * 2 * (1 - k) * 1.0 + 0.6 * (1 - k)
    pitch = p.tumble * (1 - ease(k))
  } else {
    // 땅: 두 번 통통 튀고, 조금 미끄러지며, 흔들리다 멈춤
    const k = (t - p.tLand) / (1 - p.tLand)
    const b1 = 0.38
    const b2 = 0.68
    let hop = 0
    if (k < b1) hop = 0.42 * Math.sin((k / b1) * Math.PI)
    else if (k < b2) hop = 0.13 * Math.sin(((k - b1) / (b2 - b1)) * Math.PI)
    pos.copy(p.land).addScaledVector(p.slide, ease(k) - 1)
    pos.y = hop
    const wob = p.wob * Math.exp(-5 * k) * Math.cos(k * 18)
    roll = p.roll1 + wob + (k < b1 ? 0.9 * (1 - k / b1) : 0)
    pitch = 0.25 * Math.exp(-6 * k) * Math.sin(k * 14)
  }
  const yaw = p.yaw0 + (p.yaw1 - p.yaw0) * ease(Math.min(1, t * 1.1))
  return { pos, roll, pitch, yaw }
}

// 반원기둥은 배가 위면 밑면(둥근 면)이 바닥에 닿아 중심이 R 만큼 위, 등이 위면 평평한 면이 바닥이라 중심이 바닥
function applyPose(stick, ps) {
  stick.position.copy(ps.pos)
  // 바닥에 닿는 높이 보정: 구르는 각도에 따라 중심 높이가 달라짐
  // (긴 축으로만 돌았을 때 가장 낮은 점: 둥근 면이 아래면 R, 평평한 면 쪽이 아래면 모서리 높이)
  const c = Math.cos(ps.roll)
  stick.position.y += c >= 0 ? R : R * Math.abs(Math.sin(ps.roll))
  stick.rotation.set(0, 0, 0)
  stick.rotateY(ps.yaw)
  stick.rotateZ(ps.pitch * 0.15)
  stick.rotateX(ps.roll)
  stick.rotateZ(ps.pitch * 0.85)
}

// 던지기 재생: container 안에 캔버스를 붙이고 THROW_FLIGHT_MS 동안 움직인 뒤 멈춘 모습으로 둠
export function playThrow(container, { id, sticks }) {
  const s = setup()
  const faces = (sticks || [true, false, true, false]).slice(0, 4)
  s.plan = makePlan(id, faces)
  const el = s.renderer.domElement
  if (el.parentNode !== container) container.appendChild(el)
  const size = () => {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    s.renderer.setSize(w, h, false)
    el.style.width = '100%'
    el.style.height = '100%'
    s.camera.aspect = w / h
    // 세로 화면이면 윷가락이 가로에 다 들어오게 조금 멀리
    const portrait = w < h
    s.camera.fov = portrait ? 52 : 40
    s.camera.position.set(0, portrait ? 7.4 : 5.6, portrait ? 4.6 : 4.0)
    s.camera.lookAt(0, 0, 0.15)
    s.camera.updateProjectionMatrix()
  }
  size()
  window.addEventListener('resize', size)
  cancelAnimationFrame(s.raf)
  const t0 = performance.now()
  const draw = () => {
    const u = Math.min(1, (performance.now() - t0) / THROW_FLIGHT_MS)
    s.sticks.forEach((st, i) => applyPose(st, poseAt(s.plan[i], u)))
    s.renderer.render(s.scene, s.camera)
    if (u < 1) s.raf = requestAnimationFrame(draw)
  }
  draw()
  return () => {
    cancelAnimationFrame(s.raf)
    window.removeEventListener('resize', size)
    if (el.parentNode === container) container.removeChild(el)
  }
}

// 테스트용: u(0~1) 순간을 그림
export function renderAt(u) {
  if (!S?.plan) return
  cancelAnimationFrame(S.raf)
  S.sticks.forEach((st, i) => applyPose(st, poseAt(S.plan[i], u)))
  S.renderer.render(S.scene, S.camera)
}
// 테스트용: 최종 면 확인 (배가 위면 true)
export function finalFaces() {
  if (!S) return null
  return S.sticks.map((st) => {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(st.quaternion)
    return up.y > 0
  })
}
