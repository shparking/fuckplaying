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

  // ── 10/16 추가: CU 홈페이지 상품 목록(카테고리별 전체 페이지)에서 잘 알려진 것만 골라 넣음 ──
  // 문제는 이 목록의 번호로 저장돼서, 새 상품은 항상 맨 뒤에 붙이기 (중간에 넣으면 진행 중인 방 문제가 바뀜)
  // 라면
  { cat: '라면', emoji: '🍜', name: '진라면 매운맛', unit: '봉지', price: 1000 },
  { cat: '라면', emoji: '🍜', name: '너구리 얼큰한맛', unit: '봉지', price: 1150 },
  { cat: '라면', emoji: '🍜', name: '안성탕면', unit: '봉지', price: 900 },
  { cat: '라면', emoji: '🍜', name: '삼양라면', unit: '봉지', price: 760 },
  { cat: '라면', emoji: '🍜', name: '팔도비빔면', unit: '봉지', price: 1110 },
  { cat: '라면', emoji: '🍜', name: '오징어짬뽕', unit: '봉지', price: 1300 },
  { cat: '라면', emoji: '🍜', name: '진짬뽕', unit: '봉지', price: 1750 },
  { cat: '라면', emoji: '🍜', name: '참깨라면', unit: '봉지', price: 1500 },
  { cat: '라면', emoji: '🍜', name: '열라면', unit: '봉지', price: 1000 },
  { cat: '라면', emoji: '🍜', name: '무파마탕면', unit: '봉지', price: 1300 },
  { cat: '라면', emoji: '🍜', name: '사천짜파게티', unit: '봉지', price: 1400 },
  { cat: '라면', emoji: '🍜', name: '신라면 툼바', unit: '봉지', price: 1500 },
  { cat: '라면', emoji: '🍜', name: '간짬뽕', unit: '봉지', price: 1240 },
  { cat: '라면', emoji: '🍜', name: '생생우동', unit: '봉지', price: 2400 },
  { cat: '라면', emoji: '🍜', name: '왕뚜껑', unit: '컵', price: 1600 },
  { cat: '라면', emoji: '🍜', name: '팔도 도시락', unit: '컵', price: 1200 },
  { cat: '라면', emoji: '🍜', name: '튀김우동 큰사발', unit: '컵', price: 1600 },
  { cat: '라면', emoji: '🍜', name: '새우탕 큰사발', unit: '컵', price: 1600 },
  { cat: '라면', emoji: '🍜', name: '김치사발면', unit: '컵', price: 1200 },
  { cat: '라면', emoji: '🍜', name: '너구리 큰사발', unit: '컵', price: 1900 },
  { cat: '라면', emoji: '🍜', name: '짜파게티 범벅', unit: '작은 컵', price: 1050 },
  // 과자
  { cat: '과자', emoji: '🍪', name: '꼬깔콘 고소한맛', unit: '한 봉지', price: 1700 },
  { cat: '과자', emoji: '🍪', name: '바나나킥', unit: '75g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '칸쵸', unit: '한 갑', price: 1500 },
  { cat: '과자', emoji: '🍪', name: '맛동산', unit: '165g', price: 3200 },
  { cat: '과자', emoji: '🍪', name: '양파링', unit: '80g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '오징어집', unit: '78g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '감자깡', unit: '75g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '꿀꽈배기', unit: '90g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '자갈치', unit: '90g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '포스틱', unit: '84g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '꽃게랑', unit: '한 봉지', price: 1700 },
  { cat: '과자', emoji: '🍪', name: '죠리퐁', unit: '한 봉지', price: 1500 },
  { cat: '과자', emoji: '🍪', name: '알새우칩', unit: '68g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '도도한 나쵸 치즈맛', unit: '92g', price: 1500 },
  { cat: '과자', emoji: '🍪', name: '눈을감자', unit: '56g', price: 2000 },
  { cat: '과자', emoji: '🍪', name: '오감자 그라탕', unit: '50g', price: 1400 },
  { cat: '과자', emoji: '🍪', name: '태양의 맛 썬', unit: '80g', price: 1700 },
  { cat: '과자', emoji: '🍪', name: '왕고래밥', unit: '한 봉지', price: 1100 },
  { cat: '과자', emoji: '🍪', name: '먹태깡 청양마요맛', unit: '60g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '닭다리 후라이드맛', unit: '66g', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '카라멜콘과 땅콩', unit: '72g', price: 1500 },
  { cat: '과자', emoji: '🍪', name: '뿌셔뿌셔 바베큐맛', unit: '한 봉지', price: 1500 },
  { cat: '과자', emoji: '🍪', name: '치토스 매콤달콤한맛', unit: '한 봉지', price: 1700 },
  { cat: '과자', emoji: '🍪', name: '에이스', unit: '한 갑', price: 1800 },
  { cat: '과자', emoji: '🍪', name: '참크래커', unit: '한 봉지', price: 1200 },
  { cat: '과자', emoji: '🍪', name: '리츠 크래커', unit: '한 갑', price: 2000 },
  { cat: '과자', emoji: '🍪', name: '초코송이', unit: '한 갑', price: 1200 },
  { cat: '과자', emoji: '🍪', name: '칙촉', unit: '한 갑', price: 2800 },
  { cat: '과자', emoji: '🍪', name: '촉촉한 초코칩', unit: '한 갑', price: 2800 },
  { cat: '과자', emoji: '🍪', name: '오레오 초콜릿크림', unit: '한 갑', price: 2300 },
  { cat: '과자', emoji: '🍪', name: '빈츠', unit: '한 갑', price: 3300 },
  { cat: '과자', emoji: '🍪', name: '쿠크다스', unit: '한 갑', price: 3000 },
  { cat: '과자', emoji: '🍪', name: '빅파이 딸기', unit: '한 갑', price: 3200 },
  { cat: '과자', emoji: '🍪', name: '쵸코하임', unit: '142g', price: 3300 },
  { cat: '과자', emoji: '🍪', name: '몽쉘 오리지널', unit: '6개입', price: 3500 },
  { cat: '과자', emoji: '🍪', name: '후렌치파이 사과', unit: '한 갑', price: 4200 },
  { cat: '과자', emoji: '🍪', name: '다이제', unit: '한 갑', price: 2000 },
  { cat: '과자', emoji: '🍞', name: '삼립 보름달', unit: '1개', price: 2000 },
  // 사탕·젤리·초콜릿
  { cat: '사탕', emoji: '🍬', name: '마이쮸 포도', unit: '한 줄', price: 800 },
  { cat: '사탕', emoji: '🍬', name: '새콤달콤 복숭아', unit: '한 줄', price: 500 },
  { cat: '사탕', emoji: '🍭', name: '츄파춥스', unit: '1개', price: 300 },
  { cat: '사탕', emoji: '🍬', name: '멘토스 레인보우', unit: '한 줄', price: 900 },
  { cat: '사탕', emoji: '🍬', name: '왕꿈틀이', unit: '67g', price: 1000 },
  { cat: '사탕', emoji: '🐻', name: '하리보 골드바렌', unit: '100g', price: 2500 },
  { cat: '사탕', emoji: '🍬', name: '목캔디 허브', unit: '한 갑', price: 1200 },
  { cat: '사탕', emoji: '🍬', name: '밀크카라멜', unit: '50g', price: 1000 },
  { cat: '사탕', emoji: '🍫', name: '가나 마일드', unit: '34g', price: 1700 },
  { cat: '사탕', emoji: '🍫', name: '허쉬 밀크초콜릿', unit: '40g', price: 2000 },
  { cat: '사탕', emoji: '🍫', name: '자유시간', unit: '1개', price: 1400 },
  { cat: '사탕', emoji: '🍫', name: '페레로로쉐', unit: '3개입', price: 3500 },
  { cat: '사탕', emoji: '🍫', name: '연양갱', unit: '1개', price: 900 },
  // 음료
  { cat: '음료', emoji: '🥤', name: '펩시콜라', unit: '600ml 페트', price: 2500 },
  { cat: '음료', emoji: '🥤', name: '스프라이트', unit: '500ml 페트', price: 2400 },
  { cat: '음료', emoji: '🥤', name: '밀키스', unit: '250ml 캔', price: 1600 },
  { cat: '음료', emoji: '🥤', name: '맥콜', unit: '250ml 캔', price: 1600 },
  { cat: '음료', emoji: '🥤', name: '데미소다 애플', unit: '250ml 캔', price: 1700 },
  { cat: '음료', emoji: '🥤', name: '환타 오렌지', unit: '250ml 캔', price: 1700 },
  { cat: '음료', emoji: '🍇', name: '웰치스 포도', unit: '355ml 캔', price: 1600 },
  { cat: '음료', emoji: '🍑', name: '2% 부족할때 복숭아', unit: '240ml 캔', price: 1300 },
  { cat: '음료', emoji: '🌲', name: '솔의눈', unit: '240ml 캔', price: 1400 },
  { cat: '음료', emoji: '🥤', name: '데자와', unit: '240ml 캔', price: 1600 },
  { cat: '음료', emoji: '☕', name: '레쓰비', unit: '200ml 캔', price: 1300 },
  { cat: '음료', emoji: '☕', name: '조지아 오리지널', unit: '240ml 캔', price: 1400 },
  { cat: '음료', emoji: '☕', name: '티오피(TOP) 더블랙', unit: '275ml 캔', price: 2700 },
  { cat: '음료', emoji: '🥤', name: '파워에이드', unit: '600ml 페트', price: 2600 },
  { cat: '음료', emoji: '🍚', name: '비락식혜', unit: '500ml 페트', price: 2200 },
  { cat: '음료', emoji: '🥤', name: '아침햇살', unit: '500ml 페트', price: 2500 },
  { cat: '음료', emoji: '🌽', name: '옥수수수염차', unit: '500ml 페트', price: 2400 },
  { cat: '음료', emoji: '🥤', name: '트레비 플레인', unit: '500ml 페트', price: 1800 },
  { cat: '음료', emoji: '💧', name: '에비앙', unit: '500ml 페트', price: 2200 },
  { cat: '음료', emoji: '🥤', name: '오로나민C', unit: '120ml 병', price: 1500 },
  { cat: '음료', emoji: '🍊', name: '미닛메이드 오렌지', unit: '350ml 페트', price: 2100 },
  { cat: '음료', emoji: '🧃', name: '카프리썬 오렌지', unit: '200ml 팩', price: 1200 },
  { cat: '음료', emoji: '🧃', name: '쥬시쿨 복숭아', unit: '180ml 팩', price: 600 },
  { cat: '음료', emoji: '🥛', name: '초코에몽', unit: '180ml', price: 1600 },
  { cat: '음료', emoji: '🥛', name: '서울우유 딸기우유', unit: '200ml', price: 1300 },
  { cat: '음료', emoji: '🥛', name: '베지밀B', unit: '190ml 병', price: 1800 },
  { cat: '음료', emoji: '🍺', name: '카스 올제로 (무알코올)', unit: '500ml 캔', price: 3100 },
  // 아이스크림
  { cat: '아이스크림', emoji: '🍦', name: '부라보콘 바닐라', unit: '1개', price: 2500 },
  { cat: '아이스크림', emoji: '🍦', name: '구구콘', unit: '1개', price: 2500 },
  { cat: '아이스크림', emoji: '🍦', name: '빵빠레 바닐라', unit: '1개', price: 2500 },
  { cat: '아이스크림', emoji: '🍡', name: '찰떡아이스', unit: '1개', price: 2200 },
  { cat: '아이스크림', emoji: '🍞', name: '빵또아', unit: '1개', price: 2500 },
  { cat: '아이스크림', emoji: '🍭', name: '스크류바', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍉', name: '거꾸로 수박바', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍫', name: '쌍쌍바', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍦', name: '비비빅', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🐷', name: '돼지바', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍪', name: '쿠앤크바', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍦', name: '캔디바', unit: '1개', price: 1500 },
  { cat: '아이스크림', emoji: '🍫', name: '빠삐코', unit: '1개', price: 1800 },
  { cat: '아이스크림', emoji: '🍦', name: '탱크보이', unit: '1개', price: 1800 },
  { cat: '아이스크림', emoji: '🧊', name: '뽕따 소다맛', unit: '1개', price: 1800 },
  { cat: '아이스크림', emoji: '🥛', name: '설레임 밀크쉐이크', unit: '1개', price: 2500 },
  { cat: '아이스크림', emoji: '🍧', name: '일품팥빙수', unit: '1개', price: 3000 },
  { cat: '아이스크림', emoji: '🍨', name: '투게더', unit: '한 통', price: 9800 },
  { cat: '아이스크림', emoji: '🍨', name: '하겐다즈 바닐라', unit: '파인트', price: 17900 },
  // 간편식
  { cat: '간편식', emoji: '🥫', name: '스팸', unit: '200g 캔', price: 6900 },
  { cat: '간편식', emoji: '🥫', name: '동원참치', unit: '150g 캔', price: 4800 },
  { cat: '간편식', emoji: '🍛', name: '3분 카레 매운맛', unit: '1개', price: 2900 },
  { cat: '간편식', emoji: '🍚', name: '컵밥 참치마요덮밥', unit: '1개', price: 5400 },
  { cat: '간편식', emoji: '🍲', name: '비비고 사골곰탕', unit: '500g', price: 2900 },
  { cat: '간편식', emoji: '🌭', name: '맥스봉 오리지널', unit: '50g', price: 2200 },
  { cat: '간편식', emoji: '🌭', name: '의성마늘 핫바', unit: '70g', price: 2600 },
  { cat: '간편식', emoji: '🥚', name: '훈제란', unit: '2개입', price: 2600 },
  { cat: '간편식', emoji: '🍙', name: '양반 들기름김', unit: '1봉', price: 800 },
  // 안주
  { cat: '안주', emoji: '🦑', name: '숏다리', unit: '20g', price: 2600 },
  { cat: '안주', emoji: '🦑', name: '꾸이맨', unit: '30g', price: 2500 },
  { cat: '안주', emoji: '🐟', name: '쥐포구이채', unit: '45g', price: 4400 },
  { cat: '안주', emoji: '🥩', name: '질러 부드러운 육포', unit: '30g', price: 4900 },
  { cat: '안주', emoji: '🌰', name: '맛밤', unit: '80g', price: 3900 },
  { cat: '안주', emoji: '🥜', name: '머거본 꿀땅콩', unit: '캔', price: 4500 },
  { cat: '안주', emoji: '🐷', name: '장충동 순살족발', unit: '1팩', price: 9200 },
  { cat: '안주', emoji: '🐔', name: '안주야 무뼈닭발', unit: '160g', price: 9500 },
  // 숙취
  { cat: '숙취', emoji: '💊', name: '깨수깡', unit: '160ml 캔', price: 5000 },
]

// 문제로 나올 수 있는 상품 (가격 확인된 것만)
export const priceItemIds = () => PRICE_ITEMS.map((x, i) => (x.price > 0 ? i : -1)).filter((i) => i >= 0)
// 한 방에서 최근에 나온 상품은 안 나오게 기억해 두는 개수 (항상 15개 넘게 남겨서 뽑기)
export const PRICE_USED_KEEP = Math.max(5, priceItemIds().length - 15)

// 차이 → 점수: 10% 단위 (10/16 사용자 요청 — 10%·20%·50% 처럼 갑자기 커지지 않게)
// 차이가 10% 이내 1000 · 20% 이내 900 · 30% 800 · … · 100% 이내 100 · 100% 넘게 0
export const PRICE_STEPS = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]
export function pricePoints(guess, price) {
  const g = Number(guess)
  if (!(g > 0) || !(price > 0)) return 0
  const band = Math.max(0, Math.ceil((Math.abs(g - price) * 10) / price - 1e-9) - 1) // 0~10% → 0, 10~20% → 1 …
  return PRICE_STEPS[band] ?? 0
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
