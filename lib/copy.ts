// 화면 문구 모음. 문구만 바꿀 땐 이 파일만 고치면 된다.

export const COPY = {
  // 공개 판정
  hit: "정답!",
  cheaper: (pct: number) => `생각보다 ${pct}% 싸요`,
  pricier: "실제가는 더 비쌌어요",

  // 구매 링크
  buy: "구매하기",
  buyAnyway: "그래도 구매할래요",
  viewAtStore: "쿠팡에서 보기",

  // 배송
  shippingMaybe: "배송비 별도일 수 있음",
  shippingFree: "무료배송",

  // 보상 훅
  milestone: (streak: number) => `연속 ${streak}개!`,
} as const;
