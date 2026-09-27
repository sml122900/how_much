import { TITLE_THRESHOLDS } from "./config";
import { COPY } from "./copy";

export type TitleKey = "TITLE_1" | "TITLE_2" | "TITLE_3" | "TITLE_4";

// TITLE_THRESHOLDS[i] 칭호는 COPY.titles.TITLE_{i+1}
const TITLE_KEYS: TitleKey[] = ["TITLE_1", "TITLE_2", "TITLE_3", "TITLE_4"];

/** 역대 best streak 기준 칭호. 임계값을 못 넘었으면 null */
export function titleForBestStreak(best: number): TitleKey | null {
  let title: TitleKey | null = null;
  TITLE_THRESHOLDS.forEach((min, i) => {
    if (best >= min) title = TITLE_KEYS[i];
  });
  return title;
}

export function titleLabel(key: TitleKey | null): string | null {
  return key ? COPY.titles[key] : null;
}
