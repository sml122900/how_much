// content/queue/*.json — 캡션 초안 대기열. status: draft → (사람이 수정 후) approved → (게시 후) posted
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const QUEUE_DIR = resolve("content/queue");
export const STATUSES = ["draft", "approved", "posted"] as const;
export type Status = (typeof STATUSES)[number];
export const PLATFORMS = ["youtube", "instagram", "tiktok", "threads", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type QueueItem = {
  id: string; // "{product_id}-{YYYYMMDD}" = 파일명 = utm_campaign
  product_id: string;
  product_name: string;
  status: Status;
  created_at: string; // ISO
  model: string;
  youtube: { title: string; description: string; link: string };
  instagram: { caption: string; hashtags: string[]; link: string };
  tiktok: { caption: string; hashtags: string[]; link: string };
  threads: { body: string; reply: string; link: string };
  x: { body: string; reply: string; link: string };
  /** 사람 확인용 — 게시 전에 이 가격이 지금도 맞는지 다시 볼 것 */
  checks: { price: number; price_checked_at: string };
  warnings: string[];
};

export type QueueFile = { file: string; item: Partial<QueueItem> & Record<string, unknown> };

/** 읽을 수 없는 파일은 item 대신 error 로 */
export function readQueue(): (QueueFile | { file: string; error: string })[] {
  if (!existsSync(QUEUE_DIR)) return [];
  return readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      try {
        return { file, item: JSON.parse(readFileSync(join(QUEUE_DIR, file), "utf8")) };
      } catch (e) {
        return { file, error: (e as Error).message };
      }
    });
}

/** 캡션 텍스트만 모아서 (중복 회피 프롬프트용) */
export function captionTexts(item: Partial<QueueItem>): Record<string, string> {
  const out: Record<string, string> = {};
  if (item.youtube) out["youtube.title"] = item.youtube.title;
  if (item.youtube) out["youtube.description"] = item.youtube.description;
  if (item.instagram) out["instagram.caption"] = item.instagram.caption;
  if (item.tiktok) out["tiktok.caption"] = item.tiktok.caption;
  if (item.threads) out["threads.body"] = item.threads.body;
  if (item.threads) out["threads.reply"] = item.threads.reply;
  if (item.x) out["x.body"] = item.x.body;
  if (item.x) out["x.reply"] = item.x.reply;
  return out;
}
