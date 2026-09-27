import { MAX_POINTS, TOLERANCE_PCT } from "./config";
import type { GuessResult, Outcome, Product } from "./types";

export function errorPct(guess: number, price: number): number {
  return (Math.abs(guess - price) / price) * 100;
}

/** 정수 비교로 부동소수 오차 없이 판정 */
export function isHit(guess: number, price: number): boolean {
  return Math.abs(guess - price) * 100 <= TOLERANCE_PCT * price;
}

/** 엄격 부등호: 같으면 CHEAPER 아님 */
export function isCheaper(guess: number, price: number): boolean {
  return guess > price;
}

export function pointsFor(guess: number, price: number): number {
  return Math.round(Math.max(0, MAX_POINTS - errorPct(guess, price)));
}

export function evaluateGuess(product: Product, guess: number): GuessResult {
  return {
    product,
    guess,
    errorPct: errorPct(guess, product.price),
    hit: isHit(guess, product.price),
    cheaper: isCheaper(guess, product.price),
    points: pointsFor(guess, product.price),
  };
}

/** 점수 축(HIT)과 구매 축(CHEAPER)을 조합한 공개 연출 분기 */
export function outcomeOf(r: Pick<GuessResult, "hit" | "cheaper">): Outcome {
  if (r.hit) return r.cheaper ? "hit_cheaper" : "hit";
  return r.cheaper ? "cheaper" : "miss";
}

/** "생각보다 N% 싸요" — 예상가 대비 얼마나 싼지 */
export function cheaperPct(guess: number, price: number): number {
  return Math.max(1, Math.round(((guess - price) / guess) * 100));
}

export function maxStreak(results: Pick<GuessResult, "hit">[]): number {
  let best = 0;
  let cur = 0;
  for (const r of results) {
    cur = r.hit ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export function resultLine(results: Pick<GuessResult, "hit">[]): string {
  return results.map((r) => (r.hit ? "🟩" : "🟥")).join("");
}

export function buildShareText(
  appName: string,
  results: Pick<GuessResult, "hit">[],
  url: string,
): string {
  const hits = results.filter((r) => r.hit).length;
  return `${appName} 🎯 ${hits}/${results.length} · 연속 ${maxStreak(results)}\n${resultLine(results)}\n${url}`;
}

// ---------- 상품 선택 ----------

export type Rng = () => number;

function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 시드 고정 난수 (mulberry32) */
export function seededRng(seed: string | number): Rng {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type PickOptions = {
  /** 최근 본 상품 id (오래된 것 → 최근 순). 우선 회피 */
  seen?: string[];
  /** 주면 결과가 결정적 (Phase 2 데일리 챌린지용) */
  seed?: string | number;
};

/**
 * 풀에서 size개를 중복 없이 고른다. 안 본 상품 우선,
 * 모자라면 본 지 오래된 상품부터 채운다.
 */
export function pickRound(pool: Product[], size: number, opts: PickOptions = {}): Product[] {
  const rng = opts.seed !== undefined ? seededRng(opts.seed) : Math.random;
  const seenOrder = new Map((opts.seen ?? []).map((id, i) => [id, i]));
  const shuffled = shuffle(pool, rng);
  const unseen = shuffled.filter((p) => !seenOrder.has(p.id));
  const seen = shuffled
    .filter((p) => seenOrder.has(p.id))
    .sort((a, b) => seenOrder.get(a.id)! - seenOrder.get(b.id)!);
  return [...unseen, ...seen].slice(0, size);
}

// ---------- 표시 ----------

export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** "2026-09-27" → "9월 27일" */
export function formatCheckedDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일`;
}
