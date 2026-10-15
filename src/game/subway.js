// 지하철 게임: 앱은 서울 지하철 호선만 뽑아 주고, 역 이름은 오프라인으로 돌아가며 말함
// 1~9호선 (색은 서울 지하철 노선 색)
export const SUBWAY_LINES = [
  { n: 1, color: '#0052A4' },
  { n: 2, color: '#00A84D' },
  { n: 3, color: '#EF7C1C' },
  { n: 4, color: '#00A5DE' },
  { n: 5, color: '#996CAC' },
  { n: 6, color: '#CD7C2F' },
  { n: 7, color: '#747F00' },
  { n: 8, color: '#E6186C' },
  { n: 9, color: '#BDB092' },
]
export const subwayLine = (n) => SUBWAY_LINES.find((l) => l.n === Number(n)) || SUBWAY_LINES[0]

// 바로 전에 나온 호선은 빼고 하나
export function pickSubwayLine(prev, rand = Math.random) {
  const pool = SUBWAY_LINES.map((l) => l.n).filter((n) => n !== Number(prev))
  return pool[Math.floor(rand() * pool.length)]
}
