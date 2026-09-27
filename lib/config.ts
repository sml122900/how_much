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

/** 이 연속 정답 수(역대 best 기준)에 도달하면 칭호 획득. 문구는 lib/copy.ts, 매핑은 lib/rewards.ts */
export const TITLE_THRESHOLDS = [3, 5, 10, 15] as const;
/** 한 판에서 이 연속 정답에 도달하면 결과 화면에서 보너스 라운드가 열린다 */
export const BONUS_STREAK_THRESHOLD = 5;
export const BONUS_ROUND_SIZE = 5;
/** 한 판에서 이 연속 정답에 도달하면 광고 제거 보상 (ADS_ENABLED일 때만) */
export const AD_FREE_STREAK_THRESHOLD = 10;
export const AD_FREE_HOURS = 24;
/** 여러 번 받아도 지금부터 이 시간을 넘게 누적되지 않음 */
export const AD_FREE_MAX_HOURS = 72;

/** 제휴 링크로 허용하는 호스트 */
export const PARTNER_LINK_HOST = "link.coupang.com";

/**
 * 광고 뼈대. 기본 OFF — 애드센스 승인 전에는 절대 스크립트를 로드하지 않는다.
 * 슬롯 ID가 없으면 ADS_ENABLED=true 여도 AdSlot은 아무것도 렌더하지 않는다.
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
export const AD_SLOTS = {
  start_bottom: process.env.NEXT_PUBLIC_AD_SLOT_START ?? "",
  result_bottom: process.env.NEXT_PUBLIC_AD_SLOT_RESULT ?? "",
} as const;

/** 수정·축약 금지 */
export const DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const STORAGE_KEYS = {
  sessionId: "nd_session_id",
  bestStreak: "nd_best_streak",
  seen: "seen",
  muted: "nd_muted",
  /** lib/entitlements.ts 에서 직접 참조 (ISO timestamp) */
  adFreeUntil: "hm_ad_free_until",
} as const;
