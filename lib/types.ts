export const SHIPPING_TYPES = ["rocket_free", "rocket_threshold", "seller_free", "seller_paid"] as const;
export type Shipping = (typeof SHIPPING_TYPES)[number];

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
