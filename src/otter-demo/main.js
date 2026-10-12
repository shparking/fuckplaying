// 3D 수달 말 예시: 윷판 위에 두 팀(빨강·파랑) 말을 게임과 같은 형식으로 배치하고, 팀·크기를 골라 말을 추가해 볼 수 있음
//  주소 옵션: ?view=board|showroom|turn  &team=0~3  &bg=light  &ui=0 (조작판 숨김)  &fur=high|low|off  &spin=1
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createOtterPiece, animateOtter, OTTER_TEAMS } from '../three/otter'
import { createYutBoard3D, syncPieces, nodeToWorld, TILE_TOP } from '../three/board3d'
import { DEFAULT_YUT_CELLS, NODES } from '../game/yut'

const qs = new URLSearchParams(location.search)
let view = qs.get('view') || 'board'
const furQ = qs.get('fur') || 'high'
if (qs.get('ui') === '0') document.body.classList.add('hide-ui')

// ---------- 렌더러 · 장면 ----------
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: qs.has('shot') })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.47

// 조명: 하늘빛 + 따뜻한 주 조명(그림자) + 뒤쪽 테두리 빛
scene.add(new THREE.HemisphereLight('#fff3e0', '#2a2018', 0.95))
const key = new THREE.DirectionalLight('#fff0db', 2.4)
key.position.set(4, 9, 6)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.bias = -0.0004
key.shadow.normalBias = 0.02
scene.add(key)
const rim = new THREE.DirectionalLight('#aac8ff', 0.9)
rim.position.set(-6, 5, -7)
scene.add(rim)
const fill = new THREE.DirectionalLight('#ffe2c4', 0.55)
fill.position.set(-5, 3, 6)
scene.add(fill)

// ---------- 장면 구성 ----------
const root = new THREE.Group()
scene.add(root)
let board = null
let otters = []
let floor = null
let selected = null
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 12, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }))
ring.rotation.x = Math.PI / 2
ring.visible = false
scene.add(ring)

// 예시: 게임의 말 상태와 같은 형식 (팀 0 = 1팀 빨강, 팀 1 = 2팀 파랑)
const EXAMPLE = {
  0: [{ n: 'o4' }, { n: 'a2' }, { n: 'a2' }, { n: 'home' }],
  1: [{ n: 'o17' }, { n: 'C' }, { n: 'goal' }, { n: 'home' }],
}
let teamPick = Math.min(3, Math.max(0, parseInt(qs.get('team') || '0', 10) || 0))
let size = 0.62

function clear() {
  while (root.children.length) root.remove(root.children[0])
  otters = []
  board = null
  floor = null
  select(null)
}
function light(bgLight) {
  document.body.classList.toggle('light', bgLight)
  scene.background = new THREE.Color(bgLight ? '#f3f0ea' : '#0b0c18')
  scene.fog = bgLight ? null : new THREE.Fog('#0b0c18', 26, 60)
}
function buildBoard() {
  clear()
  light(qs.get('bg') === 'light')
  board = createYutBoard3D({ cells: DEFAULT_YUT_CELLS })
  root.add(board.group)
  otters = syncPieces(board, EXAMPLE, { teamCount: 2, size, fur: furQ })
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: qs.get('bg') === 'light' ? '#e9e4dc' : '#0d0f1f', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)
  key.shadow.camera.left = -8
  key.shadow.camera.right = 8
  key.shadow.camera.top = 8
  key.shadow.camera.bottom = -8
  key.shadow.camera.far = 30
  key.shadow.camera.updateProjectionMatrix()
  fitBoard()
  controls.minDistance = 2.5
  controls.maxDistance = 40
}
// 쇼룸: 네 팀 수달을 나란히 (참고 이미지처럼)
function buildShowroom() {
  clear()
  light(qs.get('bg') !== 'dark')
  floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.22 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  root.add(floor)
  for (let t = 0; t < 4; t++) {
    const o = createOtterPiece({ team: t, size: 1, fur: furQ })
    o.position.set((t - 1.5) * 1.45, 0, 0)
    o.userData.label = `${OTTER_TEAMS[t].name} 수달`
    root.add(o)
    otters.push(o)
  }
  setShadowBox(4)
  camera.position.set(0, 1.2, 5.3)
  controls.target.set(0, 0.6, 0)
  controls.minDistance = 1.5
  controls.maxDistance = 14
}
// 한 마리를 앞·옆·뒤·비스듬히 (참고 이미지 첫 장처럼)
function buildTurnaround() {
  clear()
  light(qs.get('bg') !== 'dark')
  floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.22 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  root.add(floor)
  const angles = [0, -Math.PI / 2, Math.PI, -Math.PI / 5]
  angles.forEach((a, i) => {
    const o = createOtterPiece({ team: teamPick, size: 1, fur: furQ })
    o.position.set((i - 1.5) * 1.5, 0, 0)
    o.rotation.y = a
    root.add(o)
    otters.push(o)
  })
  setShadowBox(4)
  camera.position.set(0, 1.1, 4.9)
  controls.target.set(0, 0.6, 0)
}
// 판 전체가 화면 가로에 들어오게 카메라 거리 맞춤 (세로 폰 화면이면 더 멀리·더 위에서)
function fitBoard() {
  const aspect = window.innerWidth / window.innerHeight
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect)
  const need = aspect < 1 ? 11.2 : 12.4
  const dist = Math.max(13, need / 2 / Math.tan(hfov / 2))
  const tilt = aspect < 1 ? 0.9 : 0.72 // 위에서 내려다보는 정도
  camera.position.set(0, dist * tilt, dist * Math.sqrt(1 - tilt * tilt) + 0.6)
  // 아래 조작판에 가리지 않게 판을 조금 위로
  controls.target.set(0, 0, aspect < 1 ? 1.6 : 0.6)
}
function setShadowBox(s) {
  key.shadow.camera.left = -s
  key.shadow.camera.right = s
  key.shadow.camera.top = s
  key.shadow.camera.bottom = -s
  key.shadow.camera.far = 30
  key.shadow.camera.updateProjectionMatrix()
}
function buildCloseup() {
  buildTurnaround()
  otters.forEach((o, i) => (o.visible = i === 0))
  otters[0].position.set(0, 0, 0)
  otters[0].rotation.y = parseFloat(qs.get('angle') || '0.35')
  camera.position.set(0.4, 1.2, 2.3)
  controls.target.set(0, 0.72, 0)
}
function build() {
  if (view === 'close') buildCloseup()
  else if (view === 'showroom') buildShowroom()
  else if (view === 'turn') buildTurnaround()
  else buildBoard()
  document.getElementById('view').textContent = view === 'board' ? '🏆 쇼룸' : '🎲 윷판'
}

// ---------- 조작 ----------
const teamSeg = document.getElementById('team')
OTTER_TEAMS.forEach((t, i) => {
  const b = document.createElement('button')
  b.style.setProperty('--tc', t.color)
  b.innerHTML = `<i></i>${i + 1}팀`
  b.title = t.name
  b.onclick = () => {
    teamPick = i
    ;[...teamSeg.children].forEach((x, k) => x.classList.toggle('on', k === i))
    if (selected) selected.userData.setTeam(i)
    showSel()
  }
  teamSeg.appendChild(b)
})
teamSeg.children[teamPick].classList.add('on')
const sizeIn = document.getElementById('size')
const sizeV = document.getElementById('sizev')
sizeIn.oninput = () => {
  size = parseFloat(sizeIn.value)
  sizeV.textContent = size.toFixed(2)
  if (selected) selected.userData.setSize(size)
}
let spin = qs.get('spin') === '1'
const spinBtn = document.getElementById('spin')
spinBtn.classList.toggle('on', spin)
spinBtn.onclick = () => {
  spin = !spin
  spinBtn.classList.toggle('on', spin)
}
document.getElementById('view').onclick = () => {
  view = view === 'board' ? 'showroom' : 'board'
  build()
}
document.getElementById('reset').onclick = () => {
  userMoved = false
  build()
}
// 말 추가: 고른 팀·크기로 빈 칸에 하나 (윷판 보기에서)
document.getElementById('add').onclick = () => {
  const o = createOtterPiece({ team: teamPick, size: view === 'board' ? size : 1, fur: furQ })
  if (view === 'board' && board) {
    const used = new Set(otters.map((x) => x.userData.node))
    const free = NODES.map((n) => n.id).filter((id) => !used.has(id) && id !== 'o0')
    const node = free[Math.floor(Math.random() * free.length)]
    o.position.copy(nodeToWorld(node, TILE_TOP))
    o.userData.node = node
    o.userData.label = `${OTTER_TEAMS[teamPick].name} · 새 말`
    board.pieces.add(o)
  } else {
    o.position.set((otters.length - 1.5) * 1.45, 0, 1.4)
    o.userData.label = `${OTTER_TEAMS[teamPick].name} 수달`
    root.add(o)
  }
  o.rotation.y = Math.random() * 0.6 - 0.3
  otters.push(o)
  select(o)
}

// 말 고르기 · 끌어서 회전
const ray = new THREE.Raycaster()
const ptr = new THREE.Vector2()
let drag = null
function pick(e) {
  const r = canvas.getBoundingClientRect()
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ptr, camera)
  const hits = ray.intersectObjects(otters, true)
  if (!hits.length) return null
  let o = hits[0].object
  while (o && !otters.includes(o)) o = o.parent
  return o
}
function select(o) {
  selected = o
  ring.visible = !!o
  showSel()
}
function showSel() {
  const el = document.getElementById('sel')
  if (!el) return
  el.textContent = selected ? `선택: ${selected.userData.label || '수달'} — 좌우로 끌면 회전, 팀·크기를 바꾸면 이 말에 적용` : ''
}
canvas.addEventListener('pointerdown', (e) => {
  const o = pick(e)
  if (o) {
    select(o)
    drag = { x: e.clientX, rot: o.rotation.y }
    controls.enabled = false
    canvas.setPointerCapture(e.pointerId)
  } else if (!e.shiftKey) select(null)
})
canvas.addEventListener('pointermove', (e) => {
  if (!drag || !selected) return
  selected.rotation.y = drag.rot + (e.clientX - drag.x) * 0.012
})
const endDrag = () => {
  drag = null
  controls.enabled = true
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

// ---------- 그리기 ----------
function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // 세로 화면에선 조금 멀리서
  camera.fov = w < h ? 46 : 38
  camera.updateProjectionMatrix()
  if (view === 'board' && board && !userMoved) fitBoard()
}
let userMoved = false
controls.addEventListener('start', () => (userMoved = true))
window.addEventListener('resize', resize)
resize()
build()
const t0 = performance.now()
let last = t0
const tmp = new THREE.Vector3()
function frame() {
  const nowMs = performance.now()
  const t = (nowMs - t0) / 1000
  const dt = Math.min(0.05, (nowMs - last) / 1000)
  last = nowMs
  otters.forEach((o, i) => {
    animateOtter(o, t, i * 1.7)
    if (spin) o.rotation.y += 0.6 * dt
  })
  if (selected) {
    selected.getWorldPosition(tmp)
    ring.position.set(tmp.x, tmp.y + 0.02, tmp.z)
    ring.scale.setScalar(selected.scale.x)
    ring.material.color.set(OTTER_TEAMS[selected.userData.team]?.color || '#fff')
  }
  controls.update()
  renderer.render(scene, camera)
  frames++
  // 테스트 스크린샷(&shot=1): 몇 장만 그리고 멈춤 (소프트웨어 렌더링에서도 찍히게)
  if (qs.has('shot') && frames >= 2) {
    window.__otterDrawn = true
    return
  }
  requestAnimationFrame(frame)
}
let frames = 0
frame()
// 테스트용: 그려졌는지 확인
window.__otterReady = true
