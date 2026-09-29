export const SHIPPING_TYPES = ["rocket_free", "rocket_threshold", "seller_free", "seller_paid"] as const;
export type Shipping = (typeof SHIPPING_TYPES)[number];

/** hard = 가격 감이 잘 안 오는 상품(가전·디지털, 고가 소품 등). 보너스 라운드 전용 풀 */
export const TIERS = ["normal", "hard"] as const;
export type Tier = (typeof TIERS)[number];

export type Product = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  price: number;
  category: string;
  partner_url: string;
  price_checked_at: string; // YYYY-MM-DD
  shipping: Shipping;
  tier: Tier;
  /** 강점 한 줄 (40자 이내). 가격 힌트·1인칭 후기 표현 금지 — scripts/build-products.ts 참고 */
  selling_point?: string;
  /** rating·review_count 는 둘 다 있거나 둘 다 없음 */
  rating?: number;
  review_count?: number;
};

export type GuessResult = {
  product: Product;
  guess: number;
  errorPct: number;
  hit: boolean;
  cheaper: boolean;
  points: number;
};

/** 공개 연출 4분기 */
export type Outcome = "hit_cheaper" | "hit" | "cheaper" | "miss";

export type ClickSource = "reveal" | "reveal_gray" | "result" | "result_rest";

export type RoundType = "main" | "bonus";

/** 보상 로그 태그 (milestones.reward) */
export type RewardType = "title" | "bonus_unlock" | "ad_free";
