// 지하철 게임: 앱은 서울 지하철 노선만 뽑아 주고, 역 이름은 오프라인으로 돌아가며 말함
// 1~9호선 + (10/22 사용자 요청) 수인분당선·경의중앙선 같은 이름 있는 노선. 색은 수도권 전철 노선도 색
// n: 노선 번호(1~9) 또는 이름 노선 코드 (방에 저장되는 값이라 바꾸지 말기), badge: 동그라미 안 글자 (이름 노선만)
export const SUBWAY_LINES = [
  { n: 1, name: '1호선', color: '#0052A4' },
  { n: 2, name: '2호선', color: '#00A84D' },
  { n: 3, name: '3호선', color: '#EF7C1C' },
  { n: 4, name: '4호선', color: '#00A5DE' },
  { n: 5, name: '5호선', color: '#996CAC' },
  { n: 6, name: '6호선', color: '#CD7C2F' },
  { n: 7, name: '7호선', color: '#747F00' },
  { n: 8, name: '8호선', color: '#E6186C' },
  { n: 9, name: '9호선', color: '#BDB092' },
  { n: 'su', name: '수인분당선', badge: '수인분당', color: '#F5A200' },
  { n: 'sb', name: '신분당선', badge: '신분당', color: '#D4003B' },
  { n: 'gj', name: '경의중앙선', badge: '경의중앙', color: '#77C4A3' },
  { n: 'gc', name: '경춘선', badge: '경춘', color: '#0C8E72' },
  { n: 'ar', name: '공항철도', badge: '공항철도', color: '#0090D2' },
  { n: 'sh', name: '서해선', badge: '서해', color: '#8FC31F' },
  { n: 'gg', name: '경강선', badge: '경강', color: '#0054A6' },
  { n: 'ui', name: '우이신설선', badge: '우이신설', color: '#B0CE18' },
  { n: 'sl', name: '신림선', badge: '신림', color: '#6789CA' },
  { n: 'gp', name: '김포골드라인', badge: '김포골드', color: '#A17800' },
]
export const subwayLine = (n) => SUBWAY_LINES.find((l) => String(l.n) === String(n)) || SUBWAY_LINES[0]

// 바로 전에 나온 노선은 빼고 하나
export function pickSubwayLine(prev, rand = Math.random) {
  const pool = SUBWAY_LINES.map((l) => l.n).filter((n) => String(n) !== String(prev))
  return pool[Math.floor(rand() * pool.length)]
}
