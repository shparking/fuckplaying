// 칸 글자 맞추기 (2D 윷판·3D 윷판이 같이 씀)
// 글자 폭(em)을 어림해서, 칸 안에 들어가는 가장 큰 글자 크기와 줄 나눔을 정함 (Pretendard 기준으로 잰 값)
export function emWidth(s) {
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
// 칸 크기 (판 너비 %): 바깥·모서리·가운데 / 대각선
export const CELL_W = { cell: 9.15, diag: 8.3 }
// 칸 종류별 글자 상자 (cqw): w = 글자 폭, h2 = 이모지 줄이 있을 때 글자 높이, h3 = 이모지를 위로 올렸을 때
const BOX = {
  cell: { w: 8.0, h2: 5.6, h3: 6.7, max: CELL_FS },
  diag: { w: 7.1, h2: 4.85, h3: 5.85, max: CELL_FS },
}
export const LH = 1.08 // 줄 간격 (세 줄 이상은 LH3 로 조금 좁게 → 작은 대각선 칸도 같은 글자 크기)
export const LH3 = 1.02
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
    if (box.w / emWidth(lines[widest]) >= MIN_FS || lines.length >= 4) break
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
