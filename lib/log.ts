import { getSessionId } from "./storage";
import type { ClickSource } from "./types";

export type LogEvent =
  | { type: "guess"; product_id: string; guess: number }
  | { type: "click"; product_id: string; source: ClickSource }
  | { type: "milestone"; streak: number };

/** fire-and-forget. 실패해도 UI에 영향 없음 */
export function logEvent(event: LogEvent) {
  try {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, session_id: getSessionId() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // noop
  }
}
