// 홍보 스크립트(render:shorts, captions, queue) 공용
import { daysSince } from "../../lib/freshness";
import { formatCheckedDate } from "../../lib/game";
import type { Product } from "../../lib/types";

/** 홍보물에 옛날 가격이 나가지 않게 — 게임 풀 기준(14일)보다 엄격하게 7일 넘으면 경고 */
export const PROMO_STALE_DAYS = 7;

export function loadEnvLocal() {
  try {
    process.loadEnvFile(".env.local");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

export function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** 로컬 날짜 YYYYMMDD (파일명·utm_campaign 용) */
export function localYmd(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** price_checked_at 이 PROMO_STALE_DAYS 를 넘었으면 경고 문구, 아니면 null */
export function staleWarning(p: Pick<Product, "id" | "price_checked_at">, now = new Date()): string | null {
  const days = daysSince(p.price_checked_at, now);
  if (days !== null && days <= PROMO_STALE_DAYS) return null;
  return `${p.id}: 가격 확인일 ${p.price_checked_at}(${formatCheckedDate(p.price_checked_at)}, ${days ?? "?"}일 전) — ${PROMO_STALE_DAYS}일이 넘었어요. 가격을 다시 확인하고 CSV를 갱신한 뒤 만드세요`;
}

/** 옵션(--key value)과 위치 인자를 나눈다. 모르는 옵션이면 종료 */
export function parseArgs(argv: string[], known: string[], flags: string[] = []) {
  const ids: string[] = [];
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      ids.push(a);
      continue;
    }
    const key = a.slice(2);
    if (flags.includes(key)) opts[key] = true;
    else if (known.includes(key)) {
      const v = argv[++i];
      if (v === undefined) fail(`${a} 뒤에 값이 필요해요`);
      opts[key] = v;
    } else fail(`모르는 옵션 ${a} (가능: ${[...known, ...flags].map((k) => `--${k}`).join(", ")})`);
  }
  return { ids, opts };
}
