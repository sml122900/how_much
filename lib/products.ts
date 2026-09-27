import data from "@/data/products.json";
import { isPriceFresh } from "./freshness";
import type { Product } from "./types";

/** scripts/build-products.ts 가 검증·필터링한 상품 (빌드 시점 기준) */
export const PRODUCTS: Product[] = data as Product[];

/** 지금 기준으로 가격 확인 14일 이내인 상품만. 빌드 후 시간이 지나도 오래된 상품이 빠진다 */
export function freshPool(now: Date = new Date()): Product[] {
  return PRODUCTS.filter((p) => isPriceFresh(p.price_checked_at, now));
}

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}
