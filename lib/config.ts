export const APP_NAME = "how_much";
export const APP_TITLE = `${APP_NAME} — 가격 맞히기`;
export const APP_SUBCOPY = "눈대중으로 가격 맞히기";

/** |guess − price| / price ≤ TOLERANCE_PCT% 면 정답(hit) */
export const TOLERANCE_PCT = 15;
export const ROUND_SIZE = 10;
/** 문제당 최대 점수 */
export const MAX_POINTS = 100;
/** HIT만 / MISS 공개 후 자동으로 다음 문제로 넘어가는 시간 */
export const AUTO_ADVANCE_MS = 2500;
/** localStorage `seen`에 보관하는 최근 상품 수 */
export const SEEN_LIMIT = 50;
/** price_checked_at 이 이 일수를 넘으면 게임 풀에서 제외 (빌드 시 + 런타임) */
export const PRICE_STALE_DAYS = 14;

/** 드럼: 십만~십 5칸 + 고정 "0" → 10원 단위, 최대 999,990원 */
export const PRICE_UNIT = 10;
export const MAX_PRICE = 999_990;

/** 이 연속 정답 수에 도달하면 토스트 + milestone 로그 (보상은 다음 패스) */
export const STREAK_MILESTONES = [3, 5, 10] as const;

/** 제휴 링크로 허용하는 호스트 */
export const PARTNER_LINK_HOST = "link.coupang.com";

/** 수정·축약 금지 */
export const DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const STORAGE_KEYS = {
  sessionId: "nd_session_id",
  bestStreak: "nd_best_streak",
  seen: "seen",
  muted: "nd_muted",
} as const;
