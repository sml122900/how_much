import { getSessionId } from "./storage";
import type { ClickSource, RewardType, RoundType } from "./types";
import { getUtm } from "./utm";

export type LogEvent =
  | { type: "guess"; product_id: string; guess: number; round_type: RoundType }
  | { type: "click"; product_id: string; source: ClickSource }
  | { type: "milestone"; streak: number; reward: RewardType };

/** fire-and-forget. 실패해도 UI에 영향 없음. 유입 채널(utm_source·utm_campaign, 없으면 null)을 같이 보낸다 */
export function logEvent(event: LogEvent) {
  try {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, session_id: getSessionId(), ...getUtm() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // noop
  }
}
