import { pickUnique } from './rounds.js'

// 세계 지도 찍기 장소 (위도, 경도). 도시는 도심, 섬·나라 이름은 그 섬·나라 가운데쯤. lv 1 쉬움 · 2 보통 · 3 어려움
// country: 문제와 같이 보여 주는 나라 힌트 (나라 이름이 곧 문제인 곳은 null)
export const WORLD_PLACES = [
  // 쉬움
  { name: '도쿄', country: '일본', lat: 35.6762, lon: 139.6503, lv: 1 },
  { name: '베이징', country: '중국', lat: 39.9042, lon: 116.4074, lv: 1 },
  { name: '뉴욕', country: '미국', lat: 40.7128, lon: -74.006, lv: 1 },
  { name: '런던', country: '영국', lat: 51.5074, lon: -0.1278, lv: 1 },
  { name: '파리', country: '프랑스', lat: 48.8566, lon: 2.3522, lv: 1 },
  { name: '시드니', country: '호주', lat: -33.8688, lon: 151.2093, lv: 1 },
  { name: '모스크바', country: '러시아', lat: 55.7558, lon: 37.6173, lv: 1 },
  { name: '방콕', country: '태국', lat: 13.7563, lon: 100.5018, lv: 1 },
  { name: '로마', country: '이탈리아', lat: 41.9028, lon: 12.4964, lv: 1 },
  { name: '홍콩', country: '중국', lat: 22.3193, lon: 114.1694, lv: 1 },
  // 보통
  { name: '하와이', country: '미국', lat: 21.3069, lon: -157.8583, lv: 2 }, // 호놀룰루
  { name: '두바이', country: '아랍에미리트', lat: 25.2048, lon: 55.2708, lv: 2 },
  { name: '이스탄불', country: '튀르키예', lat: 41.0082, lon: 28.9784, lv: 2 },
  { name: '싱가포르', country: null, lat: 1.3521, lon: 103.8198, lv: 2 }, // 나라 이름과 같음
  { name: '로스앤젤레스', country: '미국', lat: 34.0522, lon: -118.2437, lv: 2 },
  { name: '기자 피라미드', country: '이집트', lat: 29.9792, lon: 31.1342, lv: 2 },
  { name: '리우데자네이루', country: '브라질', lat: -22.9068, lon: -43.1729, lv: 2 },
  { name: '바르셀로나', country: '스페인', lat: 41.3874, lon: 2.1686, lv: 2 },
  { name: '베를린', country: '독일', lat: 52.52, lon: 13.405, lv: 2 },
  { name: '상하이', country: '중국', lat: 31.2304, lon: 121.4737, lv: 2 },
  { name: '하노이', country: '베트남', lat: 21.0278, lon: 105.8342, lv: 2 },
  { name: '발리', country: '인도네시아', lat: -8.4095, lon: 115.1889, lv: 2 },
  { name: '괌', country: '미국령', lat: 13.4443, lon: 144.7937, lv: 2 },
  { name: '밴쿠버', country: '캐나다', lat: 49.2827, lon: -123.1207, lv: 2 },
  { name: '라스베이거스', country: '미국', lat: 36.1699, lon: -115.1398, lv: 2 },
  { name: '뉴델리', country: '인도', lat: 28.6139, lon: 77.209, lv: 2 },
  { name: '세부', country: '필리핀', lat: 10.3157, lon: 123.8854, lv: 2 },
  { name: '타이베이', country: '대만', lat: 25.033, lon: 121.5654, lv: 2 },
  { name: '멕시코시티', country: '멕시코', lat: 19.4326, lon: -99.1332, lv: 2 },
  { name: '아테네', country: '그리스', lat: 37.9838, lon: 23.7275, lv: 2 },
  // 어려움
  { name: '마추픽추', country: '페루', lat: -13.1631, lon: -72.545, lv: 3 },
  { name: '아이슬란드', country: null, lat: 64.9631, lon: -19.0208, lv: 3 }, // 나라 가운데
  { name: '마다가스카르', country: null, lat: -18.7669, lon: 46.8691, lv: 3 }, // 나라(섬) 가운데
  { name: '케이프타운', country: '남아프리카공화국', lat: -33.9249, lon: 18.4241, lv: 3 },
  { name: '에베레스트', country: '네팔', lat: 27.9881, lon: 86.925, lv: 3 },
  { name: '부에노스아이레스', country: '아르헨티나', lat: -34.6037, lon: -58.3816, lv: 3 },
  { name: '몰디브', country: null, lat: 4.1755, lon: 73.5093, lv: 3 }, // 수도 말레
  { name: '앵커리지', country: '미국 알래스카', lat: 61.2181, lon: -149.9003, lv: 3 },
  { name: '그랜드 캐니언', country: '미국', lat: 36.1069, lon: -112.1129, lv: 3 },
  { name: '나이로비', country: '케냐', lat: -1.2921, lon: 36.8219, lv: 3 },
  { name: '우유니 소금사막', country: '볼리비아', lat: -20.1338, lon: -67.4891, lv: 3 },
  { name: '갈라파고스 제도', country: '에콰도르', lat: -0.9538, lon: -90.9656, lv: 3 },
  { name: '이스터섬', country: '칠레', lat: -27.1127, lon: -109.3497, lv: 3 },
  { name: '울란바토르', country: '몽골', lat: 47.8864, lon: 106.9057, lv: 3 },
  { name: '트롬쇠', country: '노르웨이', lat: 69.6492, lon: 18.9553, lv: 3 },
  { name: '하바나', country: '쿠바', lat: 23.1136, lon: -82.3666, lv: 3 },
  { name: '오클랜드', country: '뉴질랜드', lat: -36.8485, lon: 174.7633, lv: 3 },
  { name: '헬싱키', country: '핀란드', lat: 60.1699, lon: 24.9384, lv: 3 },
  // 10/16 추가: 보통 20 → 30곳 (한 판에 세계 지도 게임을 여러 번 해도 안 겹치게). 문제를 번호로 저장해서 새 장소는 항상 맨 뒤에
  { name: '오사카', country: '일본', lat: 34.6937, lon: 135.5023, lv: 2 },
  { name: '삿포로', country: '일본', lat: 43.0618, lon: 141.3545, lv: 2 },
  { name: '다낭', country: '베트남', lat: 16.0544, lon: 108.2022, lv: 2 },
  { name: '쿠알라룸푸르', country: '말레이시아', lat: 3.139, lon: 101.6869, lv: 2 },
  { name: '블라디보스토크', country: '러시아', lat: 43.1155, lon: 131.8855, lv: 2 },
  { name: '암스테르담', country: '네덜란드', lat: 52.3676, lon: 4.9041, lv: 2 },
  { name: '프라하', country: '체코', lat: 50.0755, lon: 14.4378, lv: 2 },
  { name: '빈', country: '오스트리아', lat: 48.2082, lon: 16.3738, lv: 2 },
  { name: '샌프란시스코', country: '미국', lat: 37.7749, lon: -122.4194, lv: 2 },
  { name: '토론토', country: '캐나다', lat: 43.6532, lon: -79.3832, lv: 2 },
]

// 거리 → 점수: 가까울수록 크게, 구간 없이 부드럽게 (1,000km = 500점 — 10/16 맞히기 어려워서 500km → 1,000km 로 후하게)
// 0km 1000 · 100km 990 · 250km 941 · 500km 800 · 1000km 500 · 2000km 200 · 3000km 100
export const WORLD_HALF_KM = 1000
export const worldPoints = (km) => (km == null || !Number.isFinite(km) ? 0 : Math.round(1000 / (1 + (km / WORLD_HALF_KM) ** 2)))

// 한 판 5문제: 쉬움 1 → 보통 3 → 어려움 1 (점점 어려워짐)
// used = 이번 윷놀이 판에 세계 지도로 이미 나온 곳 → 그 판이 끝날 때까지 절대 다시 안 나옴 (rounds.js)
export function pickWorldRounds(used = [], rand = Math.random) {
  return pickUnique(WORLD_PLACES, used, [[1, 1], [2, 3], [3, 1]], rand)
}
