// 세계 지도 찍기 장소 (위도, 경도). 도시는 도심, 섬·나라 이름은 그 섬·나라 가운데쯤. lv 1 쉬움 · 2 보통 · 3 어려움
export const WORLD_PLACES = [
  // 쉬움
  { name: '도쿄', lat: 35.6762, lon: 139.6503, lv: 1 },
  { name: '베이징', lat: 39.9042, lon: 116.4074, lv: 1 },
  { name: '뉴욕', lat: 40.7128, lon: -74.006, lv: 1 },
  { name: '런던', lat: 51.5074, lon: -0.1278, lv: 1 },
  { name: '파리', lat: 48.8566, lon: 2.3522, lv: 1 },
  { name: '시드니', lat: -33.8688, lon: 151.2093, lv: 1 },
  { name: '모스크바', lat: 55.7558, lon: 37.6173, lv: 1 },
  { name: '방콕', lat: 13.7563, lon: 100.5018, lv: 1 },
  { name: '로마', lat: 41.9028, lon: 12.4964, lv: 1 },
  { name: '홍콩', lat: 22.3193, lon: 114.1694, lv: 1 },
  // 보통
  { name: '하와이 (호놀룰루)', lat: 21.3069, lon: -157.8583, lv: 2 },
  { name: '두바이', lat: 25.2048, lon: 55.2708, lv: 2 },
  { name: '이스탄불', lat: 41.0082, lon: 28.9784, lv: 2 },
  { name: '싱가포르', lat: 1.3521, lon: 103.8198, lv: 2 },
  { name: '로스앤젤레스', lat: 34.0522, lon: -118.2437, lv: 2 },
  { name: '이집트 피라미드', lat: 29.9792, lon: 31.1342, lv: 2 },
  { name: '리우데자네이루', lat: -22.9068, lon: -43.1729, lv: 2 },
  { name: '바르셀로나', lat: 41.3874, lon: 2.1686, lv: 2 },
  { name: '베를린', lat: 52.52, lon: 13.405, lv: 2 },
  { name: '상하이', lat: 31.2304, lon: 121.4737, lv: 2 },
  { name: '하노이', lat: 21.0278, lon: 105.8342, lv: 2 },
  { name: '발리', lat: -8.4095, lon: 115.1889, lv: 2 },
  { name: '괌', lat: 13.4443, lon: 144.7937, lv: 2 },
  { name: '밴쿠버', lat: 49.2827, lon: -123.1207, lv: 2 },
  { name: '라스베이거스', lat: 36.1699, lon: -115.1398, lv: 2 },
  { name: '뉴델리', lat: 28.6139, lon: 77.209, lv: 2 },
  { name: '세부', lat: 10.3157, lon: 123.8854, lv: 2 },
  { name: '타이베이', lat: 25.033, lon: 121.5654, lv: 2 },
  { name: '멕시코시티', lat: 19.4326, lon: -99.1332, lv: 2 },
  { name: '아테네', lat: 37.9838, lon: 23.7275, lv: 2 },
  // 어려움
  { name: '마추픽추', lat: -13.1631, lon: -72.545, lv: 3 },
  { name: '아이슬란드', lat: 64.9631, lon: -19.0208, lv: 3 },
  { name: '마다가스카르', lat: -18.7669, lon: 46.8691, lv: 3 },
  { name: '케이프타운', lat: -33.9249, lon: 18.4241, lv: 3 },
  { name: '에베레스트', lat: 27.9881, lon: 86.925, lv: 3 },
  { name: '부에노스아이레스', lat: -34.6037, lon: -58.3816, lv: 3 },
  { name: '몰디브 (말레)', lat: 4.1755, lon: 73.5093, lv: 3 },
  { name: '알래스카 (앵커리지)', lat: 61.2181, lon: -149.9003, lv: 3 },
  { name: '그랜드 캐니언', lat: 36.1069, lon: -112.1129, lv: 3 },
  { name: '나이로비 (케냐)', lat: -1.2921, lon: 36.8219, lv: 3 },
  { name: '우유니 소금사막', lat: -20.1338, lon: -67.4891, lv: 3 },
  { name: '갈라파고스 제도', lat: -0.9538, lon: -90.9656, lv: 3 },
  { name: '이스터섬 (모아이)', lat: -27.1127, lon: -109.3497, lv: 3 },
  { name: '울란바토르 (몽골)', lat: 47.8864, lon: 106.9057, lv: 3 },
  { name: '트롬쇠 (노르웨이)', lat: 69.6492, lon: 18.9553, lv: 3 },
  { name: '하바나 (쿠바)', lat: 23.1136, lon: -82.3666, lv: 3 },
  { name: '오클랜드 (뉴질랜드)', lat: -36.8485, lon: 174.7633, lv: 3 },
  { name: '헬싱키', lat: 60.1699, lon: 24.9384, lv: 3 },
]

// 거리 → 점수: 가까울수록 크게, 구간 없이 부드럽게 (500km = 500점)
// 0km 1000 · 100km 962 · 250km 800 · 500km 500 · 1000km 200 · 2000km 59
export const WORLD_HALF_KM = 500
export const worldPoints = (km) => (km == null || !Number.isFinite(km) ? 0 : Math.round(1000 / (1 + (km / WORLD_HALF_KM) ** 2)))

// 한 판 5문제: 쉬움 1 → 보통 3 → 어려움 1 (점점 어려워짐), 최근에 나온 곳은 피함
export function pickWorldRounds(used = [], rand = Math.random) {
  const pick = (lv, n, taken) => {
    let pool = WORLD_PLACES.map((p, i) => (p.lv === lv && !taken.includes(i) ? i : -1)).filter((i) => i >= 0)
    const fresh = pool.filter((i) => !used.includes(i))
    if (fresh.length >= n) pool = fresh
    const out = []
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
    return out
  }
  const a = pick(1, 1, [])
  const b = pick(2, 3, a)
  const c = pick(3, 1, [...a, ...b])
  return [...a, ...b, ...c]
}
