// 지도 찍기 장소 (위도, 경도). 도시는 시청 기준. lv 1 쉬움 · 2 보통 · 3 어려움
// 좌표 확인: 위키백과(마라도·땅끝마을·백령도·독도·울릉도·남이섬), 나머지는 시청·역·정상 좌표
export const PLACES = [
  // 쉬움
  { name: '서울', lat: 37.5665, lon: 126.978, lv: 1 },
  { name: '부산', lat: 35.1796, lon: 129.0756, lv: 1 },
  { name: '대구', lat: 35.8714, lon: 128.6014, lv: 1 },
  { name: '광주', lat: 35.1595, lon: 126.8526, lv: 1 },
  { name: '대전', lat: 36.3504, lon: 127.3845, lv: 1 },
  { name: '울산', lat: 35.5384, lon: 129.3114, lv: 1 },
  { name: '제주시', lat: 33.4996, lon: 126.5312, lv: 1 },
  { name: '인천공항', lat: 37.4602, lon: 126.4407, lv: 1 },
  // 보통
  { name: '전주', lat: 35.8242, lon: 127.148, lv: 2 },
  { name: '청주', lat: 36.6424, lon: 127.489, lv: 2 },
  { name: '춘천', lat: 37.8813, lon: 127.7298, lv: 2 },
  { name: '강릉', lat: 37.7519, lon: 128.8761, lv: 2 },
  { name: '속초', lat: 38.207, lon: 128.5918, lv: 2 },
  { name: '원주', lat: 37.3422, lon: 127.9202, lv: 2 },
  { name: '수원', lat: 37.2636, lon: 127.0286, lv: 2 },
  { name: '천안', lat: 36.8151, lon: 127.1139, lv: 2 },
  { name: '안동', lat: 36.5684, lon: 128.7294, lv: 2 },
  { name: '포항', lat: 36.019, lon: 129.3435, lv: 2 },
  { name: '경주', lat: 35.8562, lon: 129.2247, lv: 2 },
  { name: '창원', lat: 35.228, lon: 128.6811, lv: 2 },
  { name: '진주', lat: 35.18, lon: 128.1076, lv: 2 },
  { name: '통영', lat: 34.8544, lon: 128.4331, lv: 2 },
  { name: '여수', lat: 34.7604, lon: 127.6622, lv: 2 },
  { name: '순천', lat: 34.9507, lon: 127.4872, lv: 2 },
  { name: '목포', lat: 34.8118, lon: 126.3922, lv: 2 },
  { name: '군산', lat: 35.9676, lon: 126.7366, lv: 2 },
  // 어려움
  { name: '독도', lat: 37.2417, lon: 131.8667, lv: 3 },
  { name: '울릉도', lat: 37.5011, lon: 130.8564, lv: 3 },
  { name: '백령도', lat: 37.967, lon: 124.65, lv: 3 },
  { name: '마라도', lat: 33.1, lon: 126.2667, lv: 3 },
  { name: '땅끝마을 (해남)', lat: 34.2986, lon: 126.5278, lv: 3 },
  { name: '정동진', lat: 37.6911, lon: 129.0342, lv: 3 },
  { name: '판문점', lat: 37.9558, lon: 126.6772, lv: 3 },
  { name: '호미곶 (포항)', lat: 36.0767, lon: 129.5675, lv: 3 },
  { name: '남이섬', lat: 37.79, lon: 127.5258, lv: 3 },
  { name: '단양', lat: 36.9847, lon: 128.3656, lv: 3 },
  { name: '태백', lat: 37.1641, lon: 128.9857, lv: 3 },
  { name: '대천해수욕장 (보령)', lat: 36.3153, lon: 126.5135, lv: 3 },
  { name: '죽녹원 (담양)', lat: 35.3271, lon: 126.9861, lv: 3 },
  { name: '설악산 대청봉', lat: 38.119, lon: 128.4655, lv: 3 },
  { name: '지리산 천왕봉', lat: 35.337, lon: 127.7307, lv: 3 },
  { name: '한라산 백록담', lat: 33.3617, lon: 126.5292, lv: 3 },
]

// 거리 → 점수: 가까울수록 크게, 구간 없이 부드럽게 (40km = 500점)
// 0km 1000 · 10km 941 · 20km 800 · 40km 500 · 60km 308 · 100km 138 · 200km 38
export const MAP_HALF_KM = 40
export const mapPoints = (km) => (km == null || !Number.isFinite(km) ? 0 : Math.round(1000 / (1 + (km / MAP_HALF_KM) ** 2)))

// 한 판 5문제: 쉬움 1 → 보통 3 → 어려움 1 (점점 어려워짐), 최근에 나온 곳은 피함
export function pickMapRounds(used = [], rand = Math.random) {
  const pick = (lv, n, taken) => {
    let pool = PLACES.map((p, i) => (p.lv === lv && !taken.includes(i) ? i : -1)).filter((i) => i >= 0)
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
