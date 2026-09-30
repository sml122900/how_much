/**
 * 캡션 대기열(content/queue/*.json)을 표로 보여준다.
 *
 *   npm run queue
 *
 * status 는 JSON 파일을 직접 고쳐서 바꾼다: "draft" → (내용 확인·수정 후) "approved" → (게시 후) "posted"
 * 가격 확인일이 7일 넘은 항목은 ⚠ — 게시 전에 가격을 다시 확인할 것.
 */
import { daysSince } from "../lib/freshness";
import { PROMO_STALE_DAYS } from "./lib/promo";
import { readQueue, STATUSES, type Status } from "./lib/queue";

/** 터미널 표시 폭 (한글·이모지 2칸) */
function width(s: string): number {
  let n = 0;
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
  return n;
}
function pad(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - width(s)));
}
function clip(s: string, w: number): string {
  if (width(s) <= w) return s;
  let out = "";
  for (const ch of s) {
    if (width(out + ch) > w - 1) break;
    out += ch;
  }
  return `${out}…`;
}

const STATUS_ORDER: Record<Status, number> = { draft: 0, approved: 1, posted: 2 };

const entries = readQueue();
if (entries.length === 0) {
  console.log("대기열이 비어 있어요. npm run captions -- <상품id> 로 초안을 만드세요.");
  process.exit(0);
}

const rows = entries.map((e) => {
  if ("error" in e) return { sort: [9, ""], cells: [e.file, "(JSON 오류)", "✖ 읽기 실패", "", ""], note: e.error };
  const it = e.item;
  const status = STATUSES.includes(it.status as Status) ? (it.status as Status) : null;
  const checked = it.checks?.price_checked_at ?? "";
  const days = checked ? daysSince(checked) : null;
  const stale = days === null || days > PROMO_STALE_DAYS;
  const created = it.created_at ? new Date(it.created_at) : null;
  const createdText = created
    ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")} ${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`
    : "";
  return {
    sort: [status ? STATUS_ORDER[status] : 8, String(it.created_at ?? "")],
    cells: [
      String(it.id ?? e.file),
      clip(String(it.product_name ?? it.product_id ?? ""), 24),
      status ?? `✖ ${String(it.status)}`,
      createdText,
      checked ? `${checked}${stale ? ` ⚠ ${days ?? "?"}일 전` : ""}` : "⚠ 없음",
    ],
    note: null as string | null,
  };
});
rows.sort((a, b) => (a.sort[0] as number) - (b.sort[0] as number) || String(b.sort[1]).localeCompare(String(a.sort[1])));

const header = ["id", "상품", "status", "생성일", "가격 확인일"];
const widths = header.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r.cells[i]))));
const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join("  ");
console.log(line(header));
console.log(widths.map((w) => "─".repeat(w)).join("  "));
for (const r of rows) {
  console.log(line(r.cells));
  if (r.note) console.log(`  └ ${r.note}`);
}
const count = (s: Status) => entries.filter((e) => "item" in e && e.item.status === s).length;
console.log(`\n총 ${entries.length}개 · draft ${count("draft")} · approved ${count("approved")} · posted ${count("posted")}`);
