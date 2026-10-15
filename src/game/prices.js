// 얼마게요: 편의점 가격 맞히기. 가격은 CU 공식 홈페이지 상품 목록 기준 (2026년 10월 조회)
// price 가 null 인 상품은 아직 가격 확인 전이라 문제로 안 나옴 (술은 편의점 홈페이지에 없음)
export const PRICE_BASE = 'CU 홈페이지 가격 (2026년 10월)'
export const PRICE_ITEMS = [
  // 라면
  { cat: '라면', emoji: '🍜', name: '불닭볶음면', unit: '봉지', price: 1250 },
  { cat: '라면', emoji: '🍜', name: '불닭볶음면 큰컵', unit: '컵', price: 1800 },
  { cat: '라면', emoji: '🍜', name: '까르보불닭볶음면', unit: '봉지', price: 1700 },
  { cat: '라면', emoji: '🍜', name: '신라면', unit: '봉지', price: 1000 },
  { cat: '라면', emoji: '🍜', name: '신라면 큰사발', unit: '컵', price: 1600 },
  { cat: '라면', emoji: '🍜', name: '신라면 블랙', unit: '봉지', price: 1900 },
  { cat: '라면', emoji: '🍜', name: '짜파게티', unit: '봉지', price: 1300 },
  { cat: '라면', emoji: '🍜', name: '육개장 사발면', unit: '컵', price: 1200 },
  // 술·숙취
  { cat: '술', emoji: '🍶', name: '참이슬 후레쉬', unit: '360ml 병', price: null },
  { cat: '술', emoji: '🍶', name: '새로', unit: '360ml 병', price: null },
  { cat: '숙취', emoji: '💊', name: '컨디션 헛개', unit: '100ml 병', price: 5000 },
  { cat: '숙취', emoji: '💊', name: '여명808', unit: '140ml 캔', price: 5500 },
  { cat: '숙취', emoji: '💊', name: '헛개수', unit: '500ml', price: 2500 },
  { cat: '숙취', emoji: '💊', name: '박카스F', unit: '120ml 병', price: 1000 },
  // 과자·안주
  { cat: '과자', emoji: '🍪', name: '새우깡', unit: '90g', price: 1600 },
  { cat: '과자', emoji: '🍪', name: '포카칩 오리지널', unit: '66g', price: 1700 },
  { cat: '과자', emoji: '🍪', name: '허니버터칩', unit: '60g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '꼬북칩 콘스프맛', unit: '한 봉지', price: 1700 },
  { cat: '과자', emoji: '🍪', name: '빼빼로 초코', unit: '한 갑', price: 2000 },
  { cat: '과자', emoji: '🍪', name: '오징어땅콩', unit: '98g', price: 1600 },
  { cat: '과자', emoji: '🍪', name: '초코 홈런볼', unit: '46g', price: 2000 },
  { cat: '과자', emoji: '🍪', name: '프링글스 오리지널', unit: '110g', price: 4200 },
  { cat: '과자', emoji: '🍪', name: '초코파이', unit: '12개입', price: 5400 },
  // 음료
  { cat: '음료', emoji: '🥤', name: '바나나맛우유', unit: '240ml', price: 1800 },
  { cat: '음료', emoji: '🥤', name: '코카콜라', unit: '500ml 페트', price: 2600 },
  { cat: '음료', emoji: '🥤', name: '칠성사이다', unit: '500ml 페트', price: 2500 },
  { cat: '음료', emoji: '🥤', name: '포카리스웨트', unit: '620ml', price: 2600 },
  { cat: '음료', emoji: '🥤', name: '제주삼다수', unit: '500ml', price: 1100 },
  { cat: '음료', emoji: '🥤', name: '비타500', unit: '100ml 병', price: 1100 },
  { cat: '음료', emoji: '🥤', name: '핫식스', unit: '250ml 캔', price: 1700 },
  { cat: '음료', emoji: '🥤', name: '몬스터 에너지', unit: '355ml 캔', price: 2300 },
  // 간편식·아이스크림
  { cat: '간편식', emoji: '🍙', name: '삼각김밥 전주비빔', unit: '1개', price: 1200 },
  { cat: '간편식', emoji: '🍚', name: '햇반', unit: '210g', price: 2400 },
  { cat: '아이스크림', emoji: '🍦', name: '메로나', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍦', name: '월드콘', unit: '1개', price: 2500 },
  { cat: '아이스크림', emoji: '🍦', name: '붕어싸만코', unit: '1개', price: 2500 },
]

// 문제로 나올 수 있는 상품 (가격 확인된 것만)
export const priceItemIds = () => PRICE_ITEMS.map((x, i) => (x.price > 0 ? i : -1)).filter((i) => i >= 0)

// 점수: 정답과 차이(%)가 작을수록 크게, 구간 없이 부드럽게 (20% 차이 = 500점)
// 0% 1000 · 5% 941 · 10% 800 · 20% 500 · 30% 308 · 50% 138 · 2배 38
export const PRICE_HALF = 0.2
export function pricePoints(guess, price) {
  const g = Number(guess)
  if (!(g > 0) || !(price > 0)) return 0
  const e = Math.abs(g - price) / price
  return Math.round(1000 / (1 + (e / PRICE_HALF) ** 2))
}

// 한 판에 나올 상품 n개: 같은 종류는 2개까지만 (라면만 5개 나오지 않게)
export function pickPriceRounds(n = 5, used = [], rand = Math.random) {
  let pool = priceItemIds().filter((i) => !used.includes(i))
  if (pool.length < n) pool = priceItemIds()
  const out = []
  const cats = {}
  const shuffled = pool.map((i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
  for (const i of shuffled) {
    const c = PRICE_ITEMS[i].cat
    if ((cats[c] || 0) >= 2) continue
    cats[c] = (cats[c] || 0) + 1
    out.push(i)
    if (out.length >= n) break
  }
  for (const i of shuffled) if (out.length < n && !out.includes(i)) out.push(i)
  return out
}

export const won = (v) => `${Math.round(Number(v) || 0).toLocaleString('ko-KR')}원`
