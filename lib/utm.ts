// 홍보 채널 유입 추적. 첫 방문 URL의 utm_source / utm_medium / utm_campaign 을 sessionStorage 에 두고,
// guesses·clicks 로그에 utm_source·utm_campaign 을 같이 보낸다. UTM 없이 들어오면 null (= 직접 방문).
// 게임 화면에는 아무것도 표시하지 않는다.
import { STORAGE_KEYS } from "./config";

export type Utm = { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null };

const KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const VALUE_RE = /^[A-Za-z0-9_.~-]{1,100}$/;

/** 형식이 이상한 값은 버린다 (클라이언트·서버 공용) */
export function cleanUtmValue(v: unknown): string | null {
  return typeof v === "string" && VALUE_RE.test(v) ? v : null;
}

/** URL에 utm_* 가 하나라도 있으면 그 세트로 저장 (새 링크로 다시 들어오면 새 값으로), 없으면 기존 값 유지 */
export function captureUtm(search: string) {
  try {
    const q = new URLSearchParams(search);
    if (!KEYS.some((k) => q.has(k))) return;
    const utm = Object.fromEntries(KEYS.map((k) => [k, cleanUtmValue(q.get(k))])) as Utm;
    sessionStorage.setItem(STORAGE_KEYS.utm, JSON.stringify(utm));
  } catch {
    // 스토리지 막힘 등 — 추적만 빠지고 게임은 그대로
  }
}

/** 로그에 붙일 값. 저장된 게 없으면 둘 다 null */
export function getUtm(): Pick<Utm, "utm_source" | "utm_campaign"> {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.utm) ?? "null") as Partial<Utm> | null;
    return { utm_source: cleanUtmValue(v?.utm_source), utm_campaign: cleanUtmValue(v?.utm_campaign) };
  } catch {
    return { utm_source: null, utm_campaign: null };
  }
}
