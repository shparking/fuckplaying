// 게임 화면 3D 윷판 (Three.js): 2D 판과 같은 칸 배치·번호·이모지·글자 + 수달 말
//  · 판·칸 윗면은 2D 판과 같은 글자 크기·줄 나눔(fitCellText)을 캔버스에 그려 붙임 (조명 영향 없이 2D 색 그대로)
//  · 카메라는 기울여 내려다보고, 판이 화면 가로를 꽉 채우게 맞춤 → 캔버스 높이는 판 모양에 맞게 정해짐
//  · 말 = 수달 (받침·목띠 팀 색). 칸 오른쪽 위(안쪽)에 서서 칸 글자를 덜 가림. 업은 말은 머리 위 ×2 알약
//  · 판에서 말 고르기: 움직일 수 있는 말은 통통 튀고, 고른 말은 들리고, 갈 칸은 빛남. '새 말'은 출발 칸 왼쪽 아래
//  · 움직이는 게 없으면 그리기를 멈춤 (배터리 아끼기)
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NODES, NODE_BY_ID, BIG_NODES, START, CORNER_TR, CORNER_TL, CORNER_BL, TEAM_INFO, cellNo } from '../game/yut'
import { fitCellText, CELL_W, LH, LH3 } from '../game/cellText'
import { boardStacks } from '../game/boardView'
import { createOtterPiece } from './otter'

const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
// (조정용) ?b3d=기울기,거리
const tune = (qs.get('b3d') || '').split(',').map(Number)
const SPAN = 9 // 바깥 칸 중심 사이 거리 (칸 간격 1)
const INSET = 5.45 // 2D 판과 같은 여백 (%)
const SLAB = SPAN / (1 - (INSET * 2) / 100) // 판 크기 (2D 판 전체와 같은 비율)
const TILE_W = (SLAB * CELL_W.cell) / 100
const DIAG_W = (SLAB * CELL_W.diag) / 100
const SLAB_H = 0.34
const TH = 0.13 // 칸 두께 (판 윗면 y = 0 위에 놓임)
const OTTER = 0.35 // 수달 크기 (키 약 0.46) — 칸 오른쪽 위 구석에 서서 글자를 거의 안 가림
const OTTER_TOP = 0.52 // 받침 바닥에서 머리 위 알약까지
const ELEV = ((tune[0] || 54) * Math.PI) / 180 // 내려다보는 각도
const DIST = tune[1] || 38 // 멀수록 원근이 약해서 먼 칸 글자도 덜 작아짐
const TEX = 256
// (테스트용) ?slowmo=10 → 말 애니메이션을 10배 느리게
const SLOW = Math.max(1, Number(qs.get('slowmo')) || 1)
const clock = () => performance.now() / SLOW
const FONT = "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
const EMOJI_FONT = "'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif"
// 진행 방향 화살표 (2D 판과 같은 자리)
const ARROWS = [
  { x: 89, y: 50, rot: -90 },
  { x: 50, y: 11, rot: 180 },
  { x: 11, y: 50, rot: 90 },
  { x: 50, y: 89, rot: 0 },
]
const LINES = [
  [START, CORNER_TR],
  [CORNER_TR, CORNER_TL],
  [CORNER_TL, CORNER_BL],
  [CORNER_BL, START],
]
const DIAGS = [
  [CORNER_TR, CORNER_BL],
  [CORNER_TL, START],
]

const isDiag = (id) => !/^o/.test(id) && id !== 'C'
const tileW = (id) => (isDiag(id) ? DIAG_W : TILE_W)
export function nodeXZ(id) {
  const n = NODE_BY_ID[id]
  return n ? [(n.x / 100 - 0.5) * SPAN, (n.y / 100 - 0.5) * SPAN] : [0, 0]
}
// 말이 서는 자리: 칸 오른쪽 위 구석 (번호는 왼쪽 위, 이모지는 가운데 위, 글자는 그 아래라 거의 안 가림)
// 새 말은 출발 칸 왼쪽 위 (출발 칸은 번호가 없음)
function anchor(node, kind) {
  const [x, z] = nodeXZ(node === 'goal' ? START : node)
  const w = tileW(node === 'goal' ? START : node)
  if (kind === 'new') return new THREE.Vector3(x - w * 0.3, TH, z - w * 0.3)
  return new THREE.Vector3(x + w * 0.3, TH, z - w * 0.3)
}
const hash = (s) => {
  let h = 2166136261
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 1000) / 1000
}
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
const easeOutBack = (u) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2)

// ---------- 색 (2D 판과 같은 CSS 변수) ----------
function palette() {
  const cs = getComputedStyle(document.documentElement)
  const v = (k, d) => (cs.getPropertyValue(k) || '').trim() || d
  const light = document.documentElement.dataset.theme === 'light'
  return {
    light,
    boardBg: v('--board-bg', '#12152c'),
    boardDot: v('--board-dot', 'rgba(255,255,255,0.045)'),
    boardLine: v('--board-line', 'rgba(255,122,26,0.6)'),
    boardDiag: v('--board-diag', 'rgba(255,77,141,0.55)'),
    cellBg: v('--cell-bg', '#1c2043'),
    cellLine: v('--cell-line', 'rgba(255,255,255,0.11)'),
    cellText: v('--cell-text', '#ece7f5'),
    nodeBg: v('--node-bg', '#231b35'),
    text: v('--text', '#f8f3ea'),
    text3: v('--text-3', '#77738f'),
    accent: v('--accent', '#ff7a1a'),
    accentSoft: v('--accent-soft', 'rgba(255,122,26,0.16)'),
    accentGlow: v('--accent-glow', 'rgba(255,122,26,0.55)'),
    soju: v('--soju', '#3be38b'),
    sojuSoft: v('--soju-soft', 'rgba(59,227,139,0.15)'),
    pink: v('--pink', '#ff4d8d'),
    cyan: v('--cyan', '#3cd3f5'),
  }
}
function rrect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
const canLetterSpace = typeof document !== 'undefined' && 'letterSpacing' in (document.createElement('canvas').getContext('2d') || {})

// ---------- 칸 윗면 그림: 2D 칸과 같은 배치 (번호 왼쪽 위 · 이모지 · 글자) ----------
function drawTile(cv, id, cell, pal) {
  const g = cv.getContext('2d')
  const S = TEX
  const diag = isDiag(id)
  const big = BIG_NODES.has(id)
  const home = id === START
  const k = S / CELL_W[diag ? 'diag' : 'cell'] // 1cqw 가 몇 px 인지
  g.clearRect(0, 0, S, S)
  const lw = S * (big ? 0.045 : 0.03)
  const r = S * 0.2
  rrect(g, lw / 2, lw / 2, S - lw, S - lw, r)
  g.fillStyle = big ? pal.nodeBg : pal.cellBg
  g.fill()
  g.save()
  g.clip()
  if (big) {
    const rg = g.createRadialGradient(S / 2, S * 0.25, 0, S / 2, S * 0.25, S * 0.75)
    rg.addColorStop(0, home ? pal.sojuSoft : pal.accentSoft)
    rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg
    g.fillRect(0, 0, S, S)
    // 안쪽 네온 빛
    g.shadowColor = home ? pal.soju : pal.accentGlow
    g.shadowBlur = S * 0.08
    g.lineWidth = lw * 1.4
    g.strokeStyle = home ? pal.soju : pal.accent
    rrect(g, lw / 2, lw / 2, S - lw, S - lw, r)
    g.stroke()
    g.shadowBlur = 0
  } else if (!pal.light) {
    const lg = g.createLinearGradient(0, 0, 0, S)
    lg.addColorStop(0, 'rgba(255,255,255,0.045)')
    lg.addColorStop(0.45, 'rgba(255,255,255,0)')
    g.fillStyle = lg
    g.fillRect(0, 0, S, S)
  }
  g.restore()
  g.lineWidth = lw
  g.strokeStyle = home ? pal.soju : big ? pal.accent : diag ? pal.boardDiag : pal.cellLine
  if (cell?.edited) g.setLineDash([S * 0.06, S * 0.045])
  rrect(g, lw / 2, lw / 2, S - lw, S - lw, r)
  g.stroke()
  g.setLineDash([])
  // 번호
  const no = home ? '' : String(cellNo(id) ?? '')
  g.textAlign = 'left'
  g.textBaseline = 'top'
  g.font = `800 ${1.55 * k}px ${FONT}`
  g.fillStyle = home ? pal.soju : big ? pal.accent : pal.text3
  if (no) g.fillText(no, 0.65 * k, 0.45 * k)
  // 이모지 + 글자
  const fit = fitCellText(cell?.text, diag ? 'diag' : 'cell')
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let top
  if (fit.l3) {
    g.font = `${1.75 * k}px ${EMOJI_FONT}`
    g.fillText(cell?.emoji || '', S / 2, 0.15 * k + 0.9 * k)
    top = 0.35 * k + 1.6 * k
  } else {
    g.font = `${2.45 * k}px ${EMOJI_FONT}`
    g.fillText(cell?.emoji || '', S / 2, 0.35 * k + 1.42 * k)
    top = 0.35 * k + 2.75 * k
  }
  const bottom = S - 0.3 * k
  const fs = fit.fs * k
  const lh = fs * (fit.l3 ? LH3 : LH)
  let y = top + (bottom - top - lh * fit.lines.length) / 2 + lh / 2
  g.font = `750 ${fs}px ${FONT}`
  if (canLetterSpace) g.letterSpacing = `${-0.05 * fs}px`
  g.fillStyle = big ? pal.text : pal.cellText
  const maxW = S - 0.6 * k
  fit.lines.forEach((line) => {
    const w = g.measureText(line).width
    if (w > maxW) {
      g.save()
      g.translate(S / 2, y)
      g.scale(maxW / w, 1)
      g.fillText(line, 0, 0)
      g.restore()
    } else g.fillText(line, S / 2, y)
    y += lh
  })
  if (canLetterSpace) g.letterSpacing = '0px'
}

// ---------- 판 윗면: 2D 판 바탕 (빛 번짐 · 점 무늬 · 길 · 진행 방향 화살표) ----------
function drawBoardTop(cv, pal) {
  const S = cv.width
  const g = cv.getContext('2d')
  const u = S / 100 // 2D 판 1%
  g.clearRect(0, 0, S, S)
  rrect(g, 0, 0, S, S, (0.16 / SLAB) * S)
  g.fillStyle = pal.boardBg
  g.fill()
  g.save()
  g.clip()
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.62)
  rg.addColorStop(0, pal.accentSoft)
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, S, S)
  g.fillStyle = pal.boardDot
  const step = 4.2 * u
  for (let y = step / 2; y < S; y += step)
    for (let x = step / 2; x < S; x += step) {
      g.beginPath()
      g.arc(x, y, 0.28 * u, 0, Math.PI * 2)
      g.fill()
    }
  const P = (id) => {
    const n = NODE_BY_ID[id]
    return [(INSET + (n.x * (100 - INSET * 2)) / 100) * u, (INSET + (n.y * (100 - INSET * 2)) / 100) * u]
  }
  g.lineCap = 'round'
  g.shadowColor = pal.accentGlow
  g.shadowBlur = 0.5 * u
  g.lineWidth = 0.7 * u
  g.strokeStyle = pal.boardLine
  LINES.forEach(([a, b]) => {
    g.beginPath()
    g.moveTo(...P(a))
    g.lineTo(...P(b))
    g.stroke()
  })
  g.strokeStyle = pal.boardDiag
  g.setLineDash([1.4 * u, 1.3 * u])
  DIAGS.forEach(([a, b]) => {
    g.beginPath()
    g.moveTo(...P(a))
    g.lineTo(...P(b))
    g.stroke()
  })
  g.setLineDash([])
  // 진행 방향 화살표
  g.font = `${3 * u}px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = pal.accent
  g.globalAlpha = 0.75
  g.shadowBlur = 1.2 * u
  ARROWS.forEach((a) => {
    g.save()
    g.translate((INSET + (a.x * (100 - INSET * 2)) / 100) * u, (INSET + (a.y * (100 - INSET * 2)) / 100) * u)
    g.rotate((a.rot * Math.PI) / 180)
    g.fillText('➜', 0, 0)
    g.restore()
  })
  g.globalAlpha = 1
  g.restore()
  // 테두리
  g.lineWidth = 0.35 * u
  g.strokeStyle = pal.light ? 'rgba(60,30,0,0.17)' : 'rgba(255,255,255,0.15)'
  rrect(g, 0.2 * u, 0.2 * u, S - 0.4 * u, S - 0.4 * u, (0.16 / SLAB) * S)
  g.stroke()
}
// 칸 테두리 빛 (흰색 → 재질 색으로 물들임): 칸보다 조금 큰 판에 그림
const GLOW_PAD = 1.42
function glowTexture() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  const inner = S / GLOW_PAD
  const o = (S - inner) / 2
  g.strokeStyle = '#fff'
  g.shadowColor = '#fff'
  g.lineWidth = S * 0.035
  for (const blur of [S * 0.09, S * 0.04]) {
    g.shadowBlur = blur
    rrect(g, o, o, inner, inner, inner * 0.2)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function canvasTex(cv, aniso) {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  return t
}

/**
 * 3D 윷판 만들기. container 안에 캔버스와 글자 표(알약) 층을 넣음.
 * handlers: { onCellTap(node, via), onStackTap(node), onLost() }
 * 돌려주는 값: { update(props), dispose() } — props 는 2D YutBoard 와 같은 형식
 */
export function createGameBoard(container, handlers = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: qs.has('shot') })
  renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false // 그림자는 말이 자리를 옮길 때만 다시 그림 (통통 튀는 동안은 그대로)
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  canvas.className = 'y3d-canvas'
  container.appendChild(canvas)
  const layer = document.createElement('div')
  layer.className = 'y3d-labels'
  container.appendChild(layer)
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(20, 1, 0.5, DIST + 40)
  scene.add(new THREE.HemisphereLight('#fff3e0', '#2a2018', 1.0))
  const key = new THREE.DirectionalLight('#fff0db', 2.3)
  key.position.set(3.5, 11, 6.5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -6.2
  key.shadow.camera.right = 6.2
  key.shadow.camera.top = 6.2
  key.shadow.camera.bottom = -6.2
  key.shadow.camera.near = 1
  key.shadow.camera.far = 30
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)
  const rim = new THREE.DirectionalLight('#aac8ff', 0.8)
  rim.position.set(-6, 5, -7)
  scene.add(rim)
  const fill = new THREE.DirectionalLight('#ffe2c4', 0.5)
  fill.position.set(-5, 3, 6)
  scene.add(fill)

  let pal = palette()
  const disposables = []
  const keep = (x) => (disposables.push(x), x)

  // ---- 판 ----
  const slabMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.75 }))
  const slab = new THREE.Mesh(keep(new RoundedBoxGeometry(SLAB, SLAB_H, SLAB, 4, 0.16)), slabMat)
  slab.position.y = -SLAB_H / 2
  slab.receiveShadow = true
  scene.add(slab)
  const topCv = document.createElement('canvas')
  topCv.width = topCv.height = 1024
  const topTex = keep(canvasTex(topCv, aniso))
  const topMat = keep(new THREE.MeshBasicMaterial({ map: topTex, alphaTest: 0.5, toneMapped: false }))
  const top = new THREE.Mesh(keep(new THREE.PlaneGeometry(SLAB, SLAB)), topMat)
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.002
  scene.add(top)

  // ---- 칸 ----
  const glowTex = keep(glowTexture())
  const sideMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.6 }))
  const boxGeo = { cell: keep(new RoundedBoxGeometry(TILE_W, TH, TILE_W, 3, 0.07)), diag: keep(new RoundedBoxGeometry(DIAG_W, TH, DIAG_W, 3, 0.065)) }
  const planeGeo = { cell: keep(new THREE.PlaneGeometry(TILE_W, TILE_W)), diag: keep(new THREE.PlaneGeometry(DIAG_W, DIAG_W)) }
  const glowGeo = { cell: keep(new THREE.PlaneGeometry(TILE_W * GLOW_PAD, TILE_W * GLOW_PAD)), diag: keep(new THREE.PlaneGeometry(DIAG_W * GLOW_PAD, DIAG_W * GLOW_PAD)) }
  const tiles = {}
  const tileMeshes = []
  NODES.forEach((n) => {
    const kind = isDiag(n.id) ? 'diag' : 'cell'
    const [x, z] = nodeXZ(n.id)
    const box = new THREE.Mesh(boxGeo[kind], sideMat)
    box.position.set(x, TH / 2, z)
    box.castShadow = true
    box.receiveShadow = true
    box.userData.node = n.id
    scene.add(box)
    const cv = document.createElement('canvas')
    cv.width = cv.height = TEX
    const tex = keep(canvasTex(cv, aniso))
    const mat = keep(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, toneMapped: false }))
    const face = new THREE.Mesh(planeGeo[kind], mat)
    face.rotation.x = -Math.PI / 2
    face.position.set(x, TH + 0.002, z)
    face.userData.node = n.id
    scene.add(face)
    const gm = keep(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }))
    const glow = new THREE.Mesh(glowGeo[kind], gm)
    glow.rotation.x = -Math.PI / 2
    glow.position.set(x, TH + 0.006, z)
    glow.visible = false
    glow.renderOrder = 2
    scene.add(glow)
    tiles[n.id] = { box, face, tex, cv, glow, gm, key: null, cell: null, state: null }
    tileMeshes.push(box, face)
  })
  // 그림자만 받는 투명 판 (판·칸 윗면은 조명 없는 그림이라 따로 받음): 판 바닥(칸 그림자) + 칸 윗면들(수달 그림자)
  const shadowMat = keep(new THREE.ShadowMaterial({ opacity: 0.34 }))
  const floorCatch = new THREE.Mesh(keep(new THREE.PlaneGeometry(SLAB, SLAB)), shadowMat)
  floorCatch.rotation.x = -Math.PI / 2
  floorCatch.position.y = 0.004
  floorCatch.receiveShadow = true
  floorCatch.renderOrder = 1
  scene.add(floorCatch)
  const tops = NODES.map((n) => {
    const w = tileW(n.id) * 0.97
    const [x, z] = nodeXZ(n.id)
    const g = new THREE.PlaneGeometry(w, w)
    g.rotateX(-Math.PI / 2)
    g.translate(x, TH + 0.004, z)
    return g
  })
  const topCatch = new THREE.Mesh(keep(mergeGeometries(tops)), shadowMat)
  tops.forEach((g) => g.dispose())
  topCatch.receiveShadow = true
  topCatch.renderOrder = 1
  scene.add(topCatch)

  function applyTheme() {
    const side = new THREE.Color(pal.cellBg)
    sideMat.color.copy(side).multiplyScalar(pal.light ? 0.86 : 0.9)
    slabMat.color.set(pal.boardBg).multiplyScalar(pal.light ? 0.82 : 0.85)
    shadowMat.opacity = pal.light ? 0.2 : 0.34
    Object.values(tiles).forEach((t) => (t.gm.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending))
    drawBoardTop(topCv, pal)
    topTex.needsUpdate = true
    Object.entries(tiles).forEach(([id, t]) => {
      drawTile(t.cv, id, t.cell, pal)
      t.tex.needsUpdate = true
    })
  }

  // ---- 말 (수달) ----
  const otters = new Map() // key → { key, kind, team, node, count, root, piece, hit, hop, pop, knock, leave, phase, x, z }
  const hitGeo = keep(new THREE.CylinderGeometry(0.3, 0.3, 0.66, 10))
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }))
  function addOtter(k, s, from) {
    const piece = createOtterPiece({ team: s.team, size: OTTER, fur: 'low', lod: 'small' })
    const root = new THREE.Group()
    root.add(piece)
    const hit = new THREE.Mesh(hitGeo, hitMat)
    hit.position.y = 0.3
    hit.userData.key = k
    root.add(hit)
    const a = from || anchor(s.node, s.kind)
    root.position.copy(a)
    piece.rotation.y = (hash(k) - 0.5) * 0.5
    scene.add(root)
    const o = { key: k, ...s, root, piece, hit, x: a.x, z: a.z, phase: hash(k + 'p') * 0.9, hop: null, pop: null, knock: null, leave: null }
    otters.set(k, o)
    return o
  }
  function removeOtter(o) {
    scene.remove(o.root)
    otters.delete(o.key)
  }
  // 깡충: 지금 보이는 자리 → 새 자리 (o.x·o.z 는 멈출 자리)
  function startHop(o, to, now, dur = 230) {
    o.hop = { fx: o.dx ?? o.x, fz: o.dz ?? o.z, tx: to.x, tz: to.z, t0: now, dur }
    o.x = to.x
    o.z = to.z
  }

  // ---- 알약·표시 글자 (HTML 층: 선명하게) ----
  const tags = new Map() // key → { el, pos: Vector3 | () => Vector3 }
  function tag(k, cls, text, style) {
    let t = tags.get(k)
    if (!t) {
      const el = document.createElement('span')
      layer.appendChild(el)
      t = { el, text: null, cls: null }
      tags.set(k, t)
    }
    if (t.cls !== cls) t.el.className = t.cls = cls
    if (t.text !== text) t.el.textContent = t.text = text
    if (style) Object.entries(style).forEach(([p, v]) => t.el.style.setProperty(p, v))
    t.used = true
    return t
  }

  // ---- 상태 반영 ----
  let props = {}
  let moving = false
  let sig = ''
  const setSig = (st) => (st ? [...st].sort().join(',') + '/' + (st.team ?? '') : '')
  function update(p) {
    props = p || {}
    const s2 = JSON.stringify([props.pieces, props.teamCount, setSig(props.movable), props.selected, setSig(props.dests), props.routes, props.goal, props.newPiece, props.activeNode, props.mover, props.moverFrom, props.hide, props.ghost, props.bank, props.cells])
    if (s2 === sig && W === Math.round(container.clientWidth)) return
    sig = s2
    const now = clock()
    // 칸 내용
    NODES.forEach((n) => {
      const c = props.cells?.[n.id] || {}
      const k = `${c.text}|${c.emoji}|${c.type}|${c.edited ? 1 : 0}`
      const t = tiles[n.id]
      if (t.key !== k) {
        t.key = k
        t.cell = c
        drawTile(t.cv, n.id, c, pal)
        t.tex.needsUpdate = true
      }
    })
    // 말
    const want = new Map()
    boardStacks(props.pieces, props.teamCount || 2, { hide: props.hide, ghost: props.ghost }).forEach((s) => {
      want.set(`${s.ghost ? 'g' : 's'}:${s.team}:${s.node}`, { team: s.team, node: s.node, count: s.count, kind: s.ghost ? 'ghost' : 'stack' })
    })
    const mv = props.mover
    if (mv && (NODE_BY_ID[mv.node] || mv.node === 'goal')) want.set('mover', { team: mv.team, node: mv.node, count: mv.count || 1, kind: 'mover' })
    if (props.newPiece?.can) want.set(`new:${props.newPiece.team}`, { team: props.newPiece.team, node: START, count: props.newPiece.count || 1, kind: 'new' })
    for (const o of [...otters.values()]) if (!want.has(o.key)) removeOtter(o)
    for (const [k, s] of want) {
      let o = otters.get(k)
      if (!o) {
        // 새 말이 판에 들어올 때: 출발 칸 '새 말' 자리에서 깡충
        const from = s.kind === 'mover' && props.moverFrom === 'home' ? anchor(START, 'new') : null
        o = addOtter(k, s, from)
        if (from) startHop(o, anchor(s.node), now, 260)
        else if (s.kind === 'stack' && moving) o.pop = null
        else if (s.kind === 'new' || s.kind === 'mover') o.pop = { t0: now }
        if (s.kind === 'mover' && s.node === 'goal') o.leave = { t0: now + 230 }
      } else if (s.kind === 'mover' && s.node !== o.node) {
        startHop(o, anchor(s.node), now)
        if (s.node === 'goal') o.leave = { t0: now + 230 }
        // 잡히는 말: 이동하는 말이 그 칸에 닿으면 튕겨 나감
        const victim = [...otters.values()].find((x) => x.kind === 'ghost' && x.node === s.node && !x.knock)
        if (victim) victim.knockAt = now + 200
      }
      if (o.team !== s.team) o.piece.userData.setTeam(s.team)
      Object.assign(o, { team: s.team, node: s.node, count: s.count, kind: s.kind })
    }
    moving = !!mv
    container.classList.toggle('moving', moving)
    // 칸 빛
    const occ = {}
    for (const o of otters.values()) if (o.kind === 'stack' || o.kind === 'ghost') occ[o.node] = o
    const mvTeam = props.movable?.team
    Object.entries(tiles).forEach(([id, t]) => {
      const o = occ[id]
      const can = o && o.kind === 'stack' && props.movable?.has(id) && mvTeam === o.team
      let st = null
      if (props.activeNode === id) st = { c: pal.cyan, a: 1, pulse: false }
      else if (props.dests?.has(id) || (props.goal && id === START)) st = { c: pal.accent, a: 1, pulse: true }
      else if (can && props.selected === id) st = { c: TEAM_INFO[o.team].color, a: 1, pulse: false, strong: true }
      else if (props.selected === 'home' && id === START && props.newPiece?.can) st = { c: TEAM_INFO[props.newPiece.team].color, a: 1, pulse: false, strong: true }
      else if (id === START && props.newPiece?.can) st = { c: TEAM_INFO[props.newPiece.team].color, a: 0.85, pulse: true }
      else if (can) st = { c: TEAM_INFO[o.team].color, a: 0.85, pulse: true }
      else if (o) st = { c: TEAM_INFO[o.team].color, a: 0.5, pulse: false }
      t.state = st
      t.glow.visible = !!st
      if (st) {
        t.gm.color.set(st.c)
        t.gm.opacity = st.a
        t.glow.scale.setScalar(st.strong ? 1.04 : 1)
      }
    })
    renderer.shadowMap.needsUpdate = true
    ensureFonts()
    resizeIfNeeded()
    kick()
  }

  // ---- 카메라: 판이 가로를 꽉 채우게 (원근 비대칭 절두체) ----
  const fitPts = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      fitPts.push(new THREE.Vector3((sx * SLAB) / 2, 0, (sz * SLAB) / 2), new THREE.Vector3((sx * SLAB) / 2, -SLAB_H, (sz * SLAB) / 2))
      fitPts.push(new THREE.Vector3(sx * SPAN * 0.5 + sx * 0.4, TH + OTTER * 1.35, -SPAN * 0.5 - TILE_W * 0.3)) // 맨 위 줄 말 머리
    }
  const tmp = new THREE.Vector3()
  let W = 0
  let H = 0
  function fitCamera(w) {
    camera.position.set(0, DIST * Math.sin(ELEV), DIST * Math.cos(ELEV))
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    fitPts.forEach((p) => {
      tmp.copy(p).applyMatrix4(camera.matrixWorldInverse)
      const tx = tmp.x / -tmp.z
      const ty = tmp.y / -tmp.z
      x0 = Math.min(x0, tx)
      x1 = Math.max(x1, tx)
      y0 = Math.min(y0, ty)
      y1 = Math.max(y1, ty)
    })
    const mx = (x1 - x0) * 0.006
    x0 -= mx
    x1 += mx
    y0 -= (y1 - y0) * 0.01
    y1 += (y1 - y0) * 0.004
    const n = camera.near
    camera.projectionMatrix.makePerspective(n * x0, n * x1, n * y1, n * y0, n, camera.far)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    return Math.round((w * (y1 - y0)) / (x1 - x0))
  }
  function resizeIfNeeded() {
    const w = Math.round(container.clientWidth)
    if (!w || w === W) return
    W = w
    H = fitCamera(W)
    container.style.height = `${H}px`
    renderer.setSize(W, H, false)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => (resizeIfNeeded(), kick())) : null
  ro?.observe(container)

  // ---- 그리기 ----
  const proj = new THREE.Vector3()
  function place(t, v) {
    proj.copy(v).project(camera)
    t.el.style.transform = `translate(${((proj.x + 1) / 2) * W}px, ${((1 - proj.y) / 2) * H}px)`
  }
  function frame() {
    const now = clock()
    raf = 0
    const t = now / 1000
    let fast = false
    let ambient = false
    for (const o of [...otters.values()]) {
      let x = o.x
      let z = o.z
      let y = 0
      let sc = 1
      let lean = 0
      if (o.hop) {
        const u = Math.min(1, (now - o.hop.t0) / o.hop.dur)
        const e = easeInOut(u)
        x = o.hop.fx + (o.hop.tx - o.hop.fx) * e
        z = o.hop.fz + (o.hop.tz - o.hop.fz) * e
        y += Math.sin(Math.PI * u) * 0.32
        lean = -Math.sin(Math.PI * u) * 0.18 * Math.sign(o.hop.tx - o.hop.fx || 0.0001)
        if (u >= 1) o.hop = null
        fast = true
      }
      o.dx = x
      o.dz = z
      if (o.pop) {
        const u = Math.min(1, (now - o.pop.t0) / 260)
        sc *= Math.max(0.01, easeOutBack(u))
        if (u >= 1) o.pop = null
        fast = true
      }
      if (o.leave && now >= o.leave.t0) {
        const u = Math.min(1, (now - o.leave.t0) / 240)
        sc *= Math.max(0.01, 1 - u)
        y += u * 0.3
        fast = u < 1 || fast
      }
      if (o.knockAt && now >= o.knockAt && !o.knock) o.knock = { t0: now, dx: (hash(o.key) - 0.5) * 1.6, dz: 0.9 }
      if (o.knock) {
        const u = Math.min(1, (now - o.knock.t0) / 650)
        x += o.knock.dx * u
        z += o.knock.dz * u
        y += Math.sin(Math.PI * Math.min(1, u * 1.2)) * 0.9
        o.piece.rotation.z = u * 5
        sc *= 1 - u * 0.85
        if (u >= 1) o.root.visible = false
        fast = fast || u < 1
      }
      const isStack = o.kind === 'stack'
      const can = isStack && props.movable?.has(o.node) && props.movable.team === o.team
      const sel = (can && props.selected === o.node) || (o.kind === 'new' && props.selected === 'home')
      if (sel) {
        y += 0.12
        sc *= 1.12
      } else if (can || o.kind === 'new') {
        y += 0.14 * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t + o.phase)) / 0.9))
        ambient = true
      }
      if (o.kind === 'mover') sc *= 1.12
      o.root.position.set(x, TH + y, z)
      o.root.rotation.z = lean
      o.root.scale.setScalar(sc)
      o.curY = y
    }
    // 빛나는 칸
    for (const tl of Object.values(tiles)) {
      if (!tl.state?.pulse) continue
      tl.gm.opacity = tl.state.a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 1.1)))
      ambient = true
    }
    if (fast) renderer.shadowMap.needsUpdate = true
    renderer.render(scene, camera)
    drawTags()
    if (qs.has('shot')) {
      window.__board3dFrames = (window.__board3dFrames || 0) + 1
      if (window.__board3dFrames >= 3) return
    }
    if (fast) raf = requestAnimationFrame(frame)
    else if (ambient) slowTimer = setTimeout(() => ((slowTimer = 0), kick()), 33) // 튀는 말·빛나는 칸만 있으면 30fps
  }
  let raf = 0
  let slowTimer = 0
  let dead = false
  function kick() {
    if (dead || raf) return
    if (slowTimer) {
      clearTimeout(slowTimer)
      slowTimer = 0
    }
    raf = requestAnimationFrame(frame)
  }
  function drawTags() {
    tags.forEach((t) => (t.used = false))
    for (const o of otters.values()) {
      if (!o.root.visible) continue
      const head = o.root.position.clone()
      head.y += OTTER_TOP * o.root.scale.x
      if (o.kind !== 'new' && o.count > 1) place(tag(`p:${o.key}`, `y3d-pill ${o.kind === 'mover' ? 'moving' : ''}`, `×${o.count}`, { '--tc': TEAM_INFO[o.team]?.color }), head)
    }
    // 갈림길·골인 표시: 빛나는 칸 위쪽
    const routes = { ...(props.routes || {}) }
    if (props.goal) routes[START] = '🏁 골인'
    Object.entries(routes).forEach(([id, label]) => {
      if (!NODE_BY_ID[id]) return
      const [x, z] = nodeXZ(id)
      place(tag(`r:${id}`, 'y3d-route', label), tmp.set(x, TH, z - tileW(id) * 0.5))
    })
    // 소주 보관소 잔 수
    const bank = props.bank || 0
    if (bank > 0) {
      const [x, z] = nodeXZ('C')
      place(tag('bank', 'y3d-bank', `🍶${bank}`), tmp.set(x - TILE_W * 0.3, TH, z - TILE_W * 0.42))
    }
    tags.forEach((t, k) => {
      if (t.used) return
      t.el.remove()
      tags.delete(k)
    })
  }

  // ---- 누르기 (스크롤과 구분: 조금만 움직이고 짧게 누른 것만) ----
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let down = null
  const onDown = (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId })
  const onUp = (e) => {
    if (!down || e.pointerId !== down.id) return
    const d = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const dt = performance.now() - down.t
    down = null
    if (d > 12 || dt > 900) return
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects([...otters.values()].filter((o) => o.root.visible && o.kind !== 'mover').map((o) => o.hit), false)
    if (hits.length) {
      const o = otters.get(hits[0].object.userData.key)
      if (o?.kind === 'new') return handlers.onCellTap?.(START, 'new')
      if (o?.kind === 'stack') return handlers.onStackTap?.(o.node)
      if (o) return handlers.onCellTap?.(o.node)
    }
    const th = ray.intersectObjects(tileMeshes, false)
    if (th.length) handlers.onCellTap?.(th[0].object.userData.node)
  }
  const onCancel = () => (down = null)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)
  const onLost = (e) => {
    e.preventDefault()
    handlers.onLost?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  // ---- 테마·글꼴 ----
  const mo = new MutationObserver(() => {
    pal = palette()
    applyTheme()
    kick()
  })
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  applyTheme()
  // 칸 글자에 쓰인 글자의 Pretendard 조각을 불러온 뒤 다시 그림 (처음엔 기본 글꼴로 그려질 수 있음)
  let fontKey = ''
  function ensureFonts() {
    if (!document.fonts?.load) return
    const text = [...new Set(Object.values(props.cells || {}).map((c) => c?.text || '').join('') + '0123456789새말꺼내기')].sort().join('')
    if (text === fontKey) return
    fontKey = text
    Promise.all([document.fonts.load(`750 40px ${FONT}`, text), document.fonts.load(`800 40px ${FONT}`, '0123456789')])
      .then(() => {
        if (dead || fontKey !== text) return
        applyTheme()
        renderer.shadowMap.needsUpdate = true
        kick()
      })
      .catch(() => {})
  }

  function dispose() {
    dead = true
    if (raf) cancelAnimationFrame(raf)
    if (slowTimer) clearTimeout(slowTimer)
    ro?.disconnect()
    mo.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onCancel)
    canvas.removeEventListener('webglcontextlost', onLost)
    for (const o of [...otters.values()]) removeOtter(o)
    disposables.forEach((x) => x.dispose?.())
    renderer.dispose()
    renderer.forceContextLoss?.()
    canvas.remove()
    layer.remove()
    container.style.height = ''
    container.classList.remove('moving')
  }
  // (테스트용) 칸·말이 화면 어디에 있는지: kind = 'tile' | 'stack' | 'new'
  function screenPoint(node, kind = 'tile') {
    const r = canvas.getBoundingClientRect()
    const [x, z] = nodeXZ(node)
    const v = kind === 'tile' ? new THREE.Vector3(x, TH, z) : anchor(node, kind).add(new THREE.Vector3(0, 0.3, 0))
    v.project(camera)
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }
  resizeIfNeeded()
  return { update, dispose, screenPoint, getProps: () => props, refreshFonts: () => (applyTheme(), kick()) }
}
