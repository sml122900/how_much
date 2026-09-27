import data from "@/data/products.json";
import type { Product } from "./types";

/** scripts/build-products.ts 가 검증·필터링(active, 가격 확인 14일 이내)한 게임 풀 */
export const PRODUCTS: Product[] = data as Product[];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}
