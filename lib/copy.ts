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

  // 칭호 (역대 best streak 기준). 4번째는 브랜드명이 들어가 "가격의 신"으로 대체
  titles: {
    TITLE_1: "눈썰미 있음",
    TITLE_2: "가격 감별사",
    TITLE_3: "걸어다니는 최저가",
    TITLE_4: "가격의 신",
  },
  newTitle: "새 칭호 획득!",

  // 보너스 라운드
  bonusBadge: "BONUS",
  bonusUnlocked: "보너스 라운드 해금!",
  bonusCta: "보너스 라운드 도전",
  bonusScore: (n: number) => `보너스 +${n}`,

  // 광고 제거 보상 (ADS_ENABLED일 때만 부여·표시)
  adFreeGranted: "광고 없는 24시간 획득!",
  adFreeUntil: (when: string) => `광고 제거 ~ ${when}`,
  adLabel: "광고",

  // 시작 화면 — 연속 정답 보상 안내
  rewardsInfoTitle: "연속 정답 보상",
  rewardsInfoTitleLine: "3·5·10·15연속 정답마다 칭호 획득",
  rewardsInfoBonusLine: "5연속이면 결과 화면에서 보너스 라운드에 도전할 수 있어요",
  rewardsInfoAdFreeLine: "10연속이면 광고 없는 24시간을 드려요",
} as const;
