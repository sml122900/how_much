import { PRICE_STALE_DAYS } from "./config";

/** "YYYY-MM-DD" → UTC 자정. 형식·달력상 잘못된 날짜면 null */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

/** 현지 날짜 기준으로 ymd 이후 며칠 지났는지 (미래면 음수) */
export function daysSince(ymd: string, now: Date = new Date()): number | null {
  const d = parseYmd(ymd);
  if (!d) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - d.getTime()) / 86_400_000);
}

/** 가격 확인이 PRICE_STALE_DAYS 이내인가 */
export function isPriceFresh(ymd: string, now: Date = new Date()): boolean {
  const days = daysSince(ymd, now);
  return days !== null && days <= PRICE_STALE_DAYS;
}
