import { SEEN_LIMIT, STORAGE_KEYS } from "./config";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 프라이빗 모드 등 — 무시
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );
}

export function getSessionId(): string {
  let id = read(STORAGE_KEYS.sessionId);
  if (!id) {
    id = uuid();
    write(STORAGE_KEYS.sessionId, id);
  }
  return id;
}

export function getBestStreak(): number {
  const n = Number(read(STORAGE_KEYS.bestStreak));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setBestStreak(n: number) {
  write(STORAGE_KEYS.bestStreak, String(n));
}

export function getSeen(): string[] {
  try {
    const v = JSON.parse(read(STORAGE_KEYS.seen) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 오래된 것 → 최근 순으로 최대 SEEN_LIMIT개 유지 */
export function addSeen(ids: string[]) {
  const next = [...getSeen().filter((id) => !ids.includes(id)), ...ids].slice(-SEEN_LIMIT);
  write(STORAGE_KEYS.seen, JSON.stringify(next));
}
