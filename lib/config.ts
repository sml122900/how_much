export const APP_NAME = "눈대중";
export const APP_TITLE = `${APP_NAME} — 가격 맞히기`;
export const APP_SUBCOPY = "눈대중으로 가격 맞히기";

/** |guess − price| / price ≤ TOLERANCE_PCT% 면 정답(hit) */
export const TOLERANCE_PCT = 15;
export const ROUND_SIZE = 10;
/** 문제당 최대 점수 */
export const MAX_POINTS = 100;
/** CHEAPER 아닐 때 자동으로 다음 문제로 넘어가는 시간 */
export const AUTO_ADVANCE_MS = 1500;
/** localStorage `seen`에 보관하는 최근 상품 수 */
export const SEEN_LIMIT = 50;
/** price_checked_at 이 이 일수를 넘으면 게임 풀에서 제외 */
export const PRICE_STALE_DAYS = 14;
/** 입력 가능한 최대 자릿수 (Postgres int 범위 안) */
export const GUESS_MAX_DIGITS = 9;

/** 제휴 링크로 허용하는 호스트 */
export const PARTNER_LINK_HOST = "link.coupang.com";
export const CTA_LABEL = "쿠팡에서 보기";

/** 수정·축약 금지 */
export const DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const STORAGE_KEYS = {
  sessionId: "nd_session_id",
  bestStreak: "nd_best_streak",
  seen: "seen",
} as const;
