// 광고 제거 보상 (entitlement). ADS_ENABLED=false 이면 호출하는 쪽에서 아예 부르지 않는다 —
// 존재하지 않는 광고를 "제거해준다"고 말하지 않기 위해서다.
import { AD_FREE_MAX_HOURS, STORAGE_KEYS } from "./config";

const HOUR_MS = 3_600_000;

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.adFreeUntil);
  } catch {
    return null;
  }
}

function write(iso: string) {
  try {
    localStorage.setItem(STORAGE_KEYS.adFreeUntil, iso);
  } catch {
    // 프라이빗 모드 등 — 무시
  }
}

export function getAdFreeUntil(): Date | null {
  const raw = read();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isAdFree(now: Date = new Date()): boolean {
  const until = getAdFreeUntil();
  return !!until && until.getTime() > now.getTime();
}

/**
 * 광고 제거를 hours만큼 부여한다. 이미 활성 중이면 기존 만료 시각에서 연장하고,
 * 아니면 지금부터 시작한다. 지금부터 AD_FREE_MAX_HOURS를 넘게 누적되지는 않는다.
 */
export function grantAdFree(hours: number, now: Date = new Date()): Date {
  const current = getAdFreeUntil();
  const base = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  const cap = now.getTime() + AD_FREE_MAX_HOURS * HOUR_MS;
  const until = new Date(Math.min(base + hours * HOUR_MS, cap));
  write(until.toISOString());
  return until;
}

/** "9/28 14:05" */
export function formatAdFreeUntil(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
