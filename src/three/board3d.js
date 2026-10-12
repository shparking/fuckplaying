// 3D 윷판: 게임과 똑같은 칸 배치(yut.js 의 NODES 좌표)와 칸 내용(DEFAULT_YUT_CELLS)으로 만든 입체 판
// + 게임의 말 상태(pieces: { [팀]: [{ n: 'home'|'goal'|노드 }] })를 그대로 받아 수달 말을 배치하는 syncPieces
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { NODES, NODE_BY_ID, BIG_NODES, START, CORNER_TR, CORNER_TL, CORNER_BL, cellNo } from '../game/yut'
import { createOtterPiece, OTTER_TEAMS } from './otter'

export const BOARD_SPAN = 9 // 바깥 칸 중심 사이 거리 (칸 간격 1)
const TILE_H = 0.14
// 노드 좌표(0~100) → 판 위 위치 (x 오른쪽, z 아래쪽 = 화면 앞쪽)
export function nodeToWorld(id, y = 0) {
  const n = NODE_BY_ID[id]
  if (!n) return new THREE.Vector3(0, y, 0)
  return new THREE.Vector3((n.x / 100 - 0.5) * BOARD_SPAN, y, (n.y / 100 - 0.5) * BOARD_SPAN)
}
export const TILE_TOP = 0.2 + TILE_H

// 칸 윗면 그림: 번호 · 이모지 · 글자 (게임 화면 칸과 같은 내용)
function tileTexture(id, cell, big, diag) {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  const r = 46
  g.fillStyle = big ? '#2a1d38' : '#1e2246'
  g.beginPath()
  g.roundRect(4, 4, S - 8, S - 8, r)
  g.fill()
  g.lineWidth = big ? 10 : 5
  g.strokeStyle = id === START ? '#3be38b' : big ? '#ff7a1a' : diag ? 'rgba(255,77,141,0.55)' : 'rgba(255,255,255,0.16)'
  g.stroke()
  const font = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
  g.textAlign = 'left'
  g.textBaseline = 'top'
  g.fillStyle = big ? '#ff9a4a' : '#8d89a8'
  g.font = `800 34px ${font}`
  if (id !== START) g.fillText(String(cellNo(id) ?? ''), 22, 18)
  g.textAlign = 'center'
  g.font = `64px 'Apple Color Emoji','Noto Color Emoji','Segoe UI Emoji',sans-serif`
  g.fillText(cell?.emoji || '', S / 2, 26)
  const lines = String(cell?.text || '').split('\n').slice(0, 3)
  const size = lines.some((l) => l.length > 5) ? 34 : 40
  g.fillStyle = '#f2edf8'
  g.font = `800 ${size}px ${font}`
  lines.forEach((l, i) => g.fillText(l, S / 2, 112 + i * (size + 6) - (lines.length - 2) * 14))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// 판 만들기 → { group, tiles: { 노드: mesh }, pieces: Group }
export function createYutBoard3D({ cells = {} } = {}) {
  const group = new THREE.Group()
  group.name = 'yut-board'
  // 바닥 판 (포장마차 밤 테마: 남색 판 + 네온 선)
  const slab = new THREE.Mesh(new RoundedBoxGeometry(BOARD_SPAN + 1.7, 0.4, BOARD_SPAN + 1.7, 6, 0.25), new THREE.MeshStandardMaterial({ color: '#141832', roughness: 0.8 }))
  slab.receiveShadow = true
  group.add(slab)
  // 길 표시: 바깥 네모 + 대각선 두 줄 (빛나는 띠)
  const lineMat = new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 0.9, roughness: 0.5 })
  const diagMat = new THREE.MeshStandardMaterial({ color: '#ff4d8d', emissive: '#ff4d8d', emissiveIntensity: 0.8, roughness: 0.5 })
  const strip = (a, b, mat) => {
    const pa = nodeToWorld(a, 0.205)
    const pb = nodeToWorld(b, 0.205)
    const len = pa.distanceTo(pb)
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.07), mat)
    m.position.copy(pa).lerp(pb, 0.5)
    m.rotation.y = -Math.atan2(pb.z - pa.z, pb.x - pa.x)
    group.add(m)
  }
  strip(START, CORNER_TR, lineMat)
  strip(CORNER_TR, CORNER_TL, lineMat)
  strip(CORNER_TL, CORNER_BL, lineMat)
  strip(CORNER_BL, START, lineMat)
  strip(CORNER_TR, CORNER_BL, diagMat)
  strip(CORNER_TL, START, diagMat)
  // 칸 (게임 화면과 같은 번호·이모지·글자)
  const tiles = {}
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#232850', roughness: 0.6 })
  NODES.forEach((n) => {
    const big = BIG_NODES.has(n.id)
    const diag = !/^o/.test(n.id) && n.id !== 'C'
    const w = diag ? 0.84 : 0.92
    const tile = new THREE.Group()
    const box = new THREE.Mesh(new RoundedBoxGeometry(w, TILE_H, w, 3, 0.1), bodyMat)
    box.castShadow = true
    box.receiveShadow = true
    tile.add(box)
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.97, w * 0.97), new THREE.MeshStandardMaterial({ map: tileTexture(n.id, cells[n.id], big, diag), roughness: 0.55 }))
    top.rotation.x = -Math.PI / 2
    top.position.y = TILE_H / 2 + 0.001
    top.receiveShadow = true
    tile.add(top)
    tile.position.copy(nodeToWorld(n.id, 0.2 + TILE_H / 2))
    tile.userData.node = n.id
    group.add(tile)
    tiles[n.id] = tile
  })
  const pieces = new THREE.Group()
  pieces.name = 'pieces'
  group.add(pieces)
  return { group, tiles, pieces, otters: [] }
}

// 말 상태 → 수달 말 배치 (게임의 roomPieces() 결과 형식 그대로)
//  · 같은 칸에 업힌 말은 나란히 서고, 대기 중(home)인 말은 출발 칸 옆, 골인(goal)한 말은 판 오른쪽 아래 밖에 섬
export function syncPieces(board, pieces, { teamCount = 2, size = 0.62, fur = 'high' } = {}) {
  board.otters.forEach((o) => board.pieces.remove(o))
  board.otters = []
  const start = nodeToWorld(START, TILE_TOP)
  for (let t = 0; t < teamCount; t++) {
    const list = pieces?.[t] || []
    const byNode = {}
    list.forEach((pc) => (byNode[pc.n] = (byNode[pc.n] || 0) + 1))
    Object.entries(byNode).forEach(([node, count]) => {
      for (let k = 0; k < count; k++) {
        const o = createOtterPiece({ team: t, size, fur })
        let p
        if (node === 'home') p = new THREE.Vector3(start.x + 1.25 + k * 0.62, 0.2, start.z - 1.0 - t * 0.75)
        else if (node === 'goal') p = new THREE.Vector3(start.x + 1.25 + k * 0.62, 0.2, start.z + 0.2 - t * 0.75)
        else {
          p = nodeToWorld(node, TILE_TOP)
          // 업은 말: 칸 안에서 나란히
          const off = count > 1 ? (k - (count - 1) / 2) * 0.36 : 0
          p.x += off
          p.z += count > 1 ? Math.abs(off) * 0.25 : 0
        }
        o.position.copy(p)
        o.rotation.y = node === 'home' || node === 'goal' ? -0.5 : 0.15 * (k - 0.5)
        o.userData.node = node
        o.userData.label = `${OTTER_TEAMS[t].name} · ${node === 'home' ? '대기' : node === 'goal' ? '골인' : `${cellNo(node) ?? ''}번 칸`}${count > 1 ? ` (업힌 말 ${count}개)` : ''}`
        board.pieces.add(o)
        board.otters.push(o)
      }
    })
  }
  return board.otters
}
