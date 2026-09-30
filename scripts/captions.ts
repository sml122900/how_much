/**
 * 상품별 SNS 캡션 초안을 만든다 → content/queue/{id}-{YYYYMMDD}.json (status: "draft")
 *
 *   npm run captions -- p007
 *   npm run captions -- p007 p012
 *   npm run captions -- p007 --force      # 오늘 만든 draft 다시 만들기 (approved/posted 는 절대 덮지 않음)
 *   npm run captions -- p007 --dry-run    # API 호출 없이 프롬프트만 출력
 *
 * .env.local: ANTHROPIC_API_KEY, NEXT_PUBLIC_SITE_URL(캡션에 넣을 사이트 주소)
 *             ANTHROPIC_WORKSPACE_ID — 키가 특정 워크스페이스에 묶이지 않은 경우에만 (anthropic-workspace-id 헤더)
 *
 * 톤은 content/voice.md, 겹치지 않게 최근 캡션 5개(content/queue)를 프롬프트에 넣는다.
 * 하드 규칙(링크·날짜 문구·가격 공개 위치·후기/과장 표현·길이)은 프롬프트에 넣고 결과를 코드로 다시 검사한다.
 * 어기면 이유를 붙여 다시 쓰게 하고(최대 2번), 그래도 어기면 파일을 만들지 않는다.
 * 링크는 모델이 직접 쓰지 않고 {link} 자리표시자만 쓰게 한 뒤, 코드가 플랫폼별 UTM 링크로 바꿔 넣는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { formatCheckedDate, formatRating, formatWon } from "../lib/game";
import { getProduct } from "../lib/products";
import type { Product } from "../lib/types";
import { fail, loadEnvLocal, localYmd, parseArgs, staleWarning } from "./lib/promo";
import { captionTexts, PLATFORMS, QUEUE_DIR, readQueue, type Platform, type QueueItem } from "./lib/queue";

loadEnvLocal();

const MODEL = "claude-opus-5-5";
const MAX_ATTEMPTS = 3;
const RECENT_COUNT = 5;
const VOICE_FILE = resolve("content/voice.md");
const LINK = "{link}";

/** 1인칭 사용 후기처럼 보이는 표현 + 과장 표현 (scripts/build-products.ts 의 selling_point 규칙과 같은 취지) */
const BANNED = [
  "써보니",
  "써 보니",
  "사용해보니",
  "사용해 보니",
  "사용해본",
  "사용해 본",
  "제가 써",
  "제가 사용",
  "직접 써보",
  "내돈내산",
  "역대급",
  "무조건",
  "최저가",
  "초특가",
];
/** {link} 가 정확히 한 번 들어가야 하는 필드 — 나머지 필드엔 링크 없음 (인스타·틱톡 캡션은 링크가 안 눌림) */
const LINK_FIELDS = ["youtube.description", "threads.reply", "x.reply"];
/** 가격을 공개하는(=반드시 써야 하는) 필드. 나머지는 영상·질문의 스포일러라 금액을 아예 쓰지 않는다 */
const PRICE_FIELDS = ["threads.reply", "x.reply"];

type Draft = {
  youtube: { title: string; description: string };
  instagram: { caption: string; hashtags: string[] };
  tiktok: { caption: string; hashtags: string[] };
  threads: { body: string; reply: string };
  x: { body: string; reply: string };
};

const str = { type: "string" };
const obj = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});
const SCHEMA = obj({
  youtube: obj({ title: str, description: str }),
  instagram: obj({ caption: str, hashtags: { type: "array", items: str } }),
  tiktok: obj({ caption: str, hashtags: { type: "array", items: str } }),
  threads: obj({ body: str, reply: str }),
  x: obj({ body: str, reply: str }),
});

// ---------- 링크 ----------

function siteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw || raw.includes("your-domain")) fail("NEXT_PUBLIC_SITE_URL 을 .env.local 에 실제 사이트 주소로 채워주세요");
  try {
    return new URL(raw);
  } catch {
    fail(`NEXT_PUBLIC_SITE_URL 이 URL 형식이 아니에요: ${raw}`);
  }
}

export function utmLink(site: URL, source: Platform, campaign: string): string {
  const u = new URL(site.href);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaign);
  return u.href;
}

// ---------- 프롬프트 ----------

function systemPrompt(dateText: string, voice: string): string {
  return `너는 "how_much"(사진과 한 줄 설명만 보고 상품 가격을 맞히는 10문제 웹 게임)의 SNS 홍보 문구를 쓴다.
게시물은 짧은 세로 영상(상품 사진 → 3·2·1 → 슬롯머신처럼 가격 공개 → 사이트 주소)과 함께 올라간다.
목적은 구매 권유가 아니라 "나도 맞혀볼래" 하는 게임 참여 유도다.

# 반드시 지킬 규칙 (코드로 검사한다. 어기면 다시 쓰게 된다)
1. 링크: URL·도메인을 직접 쓰지 말고 링크 자리에 ${LINK} 라고만 쓴다. ${LINK} 는 youtube.description, threads.reply, x.reply 에 정확히 한 번씩, 다른 필드에는 쓰지 않는다. 인스타그램·틱톡 캡션은 링크가 눌리지 않으니 "프로필 링크" 같은 말로 안내한다. 쇼핑몰 이름이나 쇼핑몰·제휴 링크는 절대 쓰지 않는다.
2. 날짜: youtube.title 을 뺀 모든 필드에 "가격은 ${dateText} 기준" 을 글자 그대로 넣는다.
3. 가격 공개: 정답 가격은 threads.reply 와 x.reply 에서만 공개하고, 쓸 때는 상품 정보의 가격 표기를 그대로 쓴다. 나머지 필드(유튜브 제목·설명, 인스타·틱톡 캡션, threads.body, x.body)에는 가격도, "~만원대"·"커피 N잔 값" 같은 가격 힌트도 쓰지 않는다(영상과 질문의 스포일러). threads.body 와 x.body 는 가격을 묻는 질문형으로 쓴다.
4. 후기 금지: 우리는 이 상품을 써본 적이 없다. "써보니", "제가 사용해본", "직접 써보니", "내돈내산" 같은 사용 경험 표현을 쓰지 않는다. 상품 정보에 있는 사실만 말하고 효과·품질을 지어내지 않는다.
5. 과장 금지: "역대급", "무조건", "최저가", "초특가" 같은 과장·단정 표현, "제일 싸다" 같은 비교 주장, "지금 사세요" 같은 구매 재촉을 쓰지 않는다.
6. 길이: youtube.title 40자 이내. x.body·x.reply 는 각각 한글 120자 이내(${LINK} 포함). threads.body·threads.reply 각각 300자 이내. youtube.description·instagram·tiktok 캡션은 400자 이내. 해시태그는 instagram 5~10개, tiktok 3~6개, 각각 # 로 시작하고 띄어쓰기 없이.
7. 반복 금지: 뒤에 주는 "최근 캡션"과 첫 문장, 질문 방식, 문장 구조, 이모지 위치, 해시태그 조합이 겹치지 않게 새로 쓴다. 플랫폼끼리도 같은 문장을 복사하지 말고 플랫폼마다 따로 쓴다.

# 톤 가이드 (content/voice.md — 운영자가 직접 관리)
${voice}`;
}

function userPrompt(p: Product, dateText: string, recent: Record<string, string>[]): string {
  const facts = [
    `- 상품명: ${p.name}`,
    `- 한 줄 설명: ${p.description}`,
    `- 카테고리: ${p.category}`,
    `- 가격: ${formatWon(p.price)} (가격은 ${dateText} 기준)`,
    p.selling_point ? `- 특징: ${p.selling_point}` : null,
    p.rating !== undefined && p.review_count !== undefined ? `- 별점: ${formatRating(p.rating, p.review_count)}` : null,
  ].filter(Boolean);
  const recentBlock = recent.length
    ? recent.map((r, i) => `## 최근 캡션 ${i + 1}\n${JSON.stringify(r, null, 1)}`).join("\n\n")
    : "(아직 없음)";
  return `아래 상품으로 youtube / instagram / tiktok / threads / x 게시물 문구를 JSON으로 써줘.

# 상품 정보 (사실은 이것만 쓸 것)
${facts.join("\n")}

# 최근 캡션 — 이것들과 겹치지 않게
${recentBlock}`;
}

// ---------- 검사 ----------

/** X 가중 글자 수 (twitter-text 기준: 라틴·기본 기호 1, 한글·이모지 등 2, 링크 23) → 280 이하 */
function xWeightedLength(text: string): number {
  let n = 0;
  for (const ch of text.replaceAll(LINK, "")) {
    const cp = ch.codePointAt(0)!;
    const light =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    n += light ? 1 : 2;
  }
  return n + text.split(LINK).length * 23 - 23;
}

const chars = (s: string) => [...s].length;

function fields(d: Draft): Record<string, string> {
  return {
    "youtube.title": d.youtube.title,
    "youtube.description": d.youtube.description,
    "instagram.caption": d.instagram.caption,
    "tiktok.caption": d.tiktok.caption,
    "threads.body": d.threads.body,
    "threads.reply": d.threads.reply,
    "x.body": d.x.body,
    "x.reply": d.x.reply,
  };
}

function validate(d: Draft, p: Product, dateText: string): string[] {
  const v: string[] = [];
  const dateNeedle = `가격은 ${dateText} 기준`;
  const priceText = p.price.toLocaleString("ko-KR");
  for (const [k, text] of Object.entries(fields(d))) {
    if (typeof text !== "string" || !text.trim()) {
      v.push(`${k}: 비어 있음`);
      continue;
    }
    for (const w of BANNED) if (text.includes(w)) v.push(`${k}: 금지 표현 "${w}"`);
    const noLink = text.replaceAll(LINK, "");
    if (/https?:|www\.|[a-z0-9-]+\.(com|net|app|kr|co|io|me|ly|shop)\b|coupang|쿠팡/i.test(noLink)) {
      v.push(`${k}: URL·도메인·쇼핑몰 이름을 직접 썼음 (링크는 ${LINK} 로만)`);
    }
    const links = text.split(LINK).length - 1;
    const wantLinks = LINK_FIELDS.includes(k) ? 1 : 0;
    if (links !== wantLinks) v.push(`${k}: ${LINK} 는 ${wantLinks}번이어야 하는데 ${links}번`);
    if (k !== "youtube.title" && !text.includes(dateNeedle)) v.push(`${k}: "${dateNeedle}" 문구가 없음`);

    const amounts = [...noLink.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/g)].map((m) => Number(m[1].replaceAll(",", "")));
    const hint = /\d+(?:\.\d+)?\s*만\s*원|\d+\s*만원대|\d+\s*천\s*원/.test(noLink);
    if (PRICE_FIELDS.includes(k)) {
      if (!noLink.includes(priceText)) v.push(`${k}: 정답 가격 "${formatWon(p.price)}" 이 없음`);
      if (amounts.some((a) => a !== p.price) || hint) v.push(`${k}: 실제 가격(${formatWon(p.price)}) 말고 다른 금액이 있음`);
    } else if (amounts.length || hint || noLink.includes(priceText)) {
      v.push(`${k}: 가격·금액을 쓰면 안 되는 필드 (정답은 threads.reply·x.reply 에서만)`);
    }
  }
  if (chars(d.youtube.title) > 40) v.push(`youtube.title: ${chars(d.youtube.title)}자 (40자 이내)`);
  for (const k of ["x.body", "x.reply"] as const) {
    const n = xWeightedLength(fields(d)[k]);
    if (n > 280) v.push(`${k}: X 가중 글자수 ${n} (280 이하, 한글은 2로 셈)`);
  }
  for (const k of ["threads.body", "threads.reply"] as const) {
    if (chars(fields(d)[k]) > 500) v.push(`${k}: ${chars(fields(d)[k])}자 (500자 제한)`);
  }
  for (const k of ["youtube.description", "instagram.caption", "tiktok.caption"] as const) {
    if (chars(fields(d)[k]) > 2200) v.push(`${k}: ${chars(fields(d)[k])}자 (2200자 제한)`);
  }
  const tags = (k: string, list: string[], min: number, max: number) => {
    if (!Array.isArray(list) || list.length < min || list.length > max) v.push(`${k}: 해시태그 ${list?.length ?? 0}개 (${min}~${max}개)`);
    else for (const t of list) if (!/^#?[^\s#]+$/.test(t)) v.push(`${k}: 해시태그 형식 "${t}"`);
  };
  tags("instagram.hashtags", d.instagram.hashtags, 3, 15);
  tags("tiktok.hashtags", d.tiktok.hashtags, 3, 8);
  return v;
}

// ---------- 생성 ----------

async function generate(client: Anthropic, system: string, user: string, p: Product, dateText: string) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  let last: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // 안전 분류기가 거절하면 서버가 권장 모델로 다시 시도
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system,
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error(`모델이 거절했어요 (${res.stop_details?.category ?? "분류 없음"})`);
    if (res.stop_reason === "max_tokens") throw new Error("응답이 max_tokens 에서 잘렸어요");
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let draft: Draft;
    try {
      draft = JSON.parse(text);
    } catch {
      throw new Error(`JSON 파싱 실패:\n${text.slice(0, 500)}`);
    }
    last = validate(draft, p, dateText);
    if (last.length === 0) return { draft, attempts: attempt, model: res.model };
    console.warn(`  · ${attempt}차 결과 규칙 위반 ${last.length}건 → 다시 쓰게 함\n    - ${last.join("\n    - ")}`);
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: `다음 규칙을 어겼어. 전부 고쳐서 JSON 전체를 다시 써줘 (나머지 규칙도 계속 지킬 것):\n- ${last.join("\n- ")}`,
    });
  }
  throw new Error(`${MAX_ATTEMPTS}번 시도해도 규칙 위반이 남아 파일을 만들지 않았어요:\n- ${last.join("\n- ")}`);
}

function normalizeTags(list: string[]): string[] {
  return [...new Set(list.map((t) => `#${t.trim().replace(/^#+/, "")}`))];
}

async function main() {
  const { ids, opts } = parseArgs(process.argv.slice(2), [], ["force", "dry-run"]);
  if (ids.length === 0) fail("상품 id를 적어주세요. 예: npm run captions -- p007 p012");
  const products = ids.map((id) => getProduct(id) ?? fail(`상품 id "${id}" 가 data/products.json 에 없어요`));
  if (!existsSync(VOICE_FILE)) fail(`${relative(process.cwd(), VOICE_FILE)} 가 없어요 (톤 가이드)`);
  const voice = readFileSync(VOICE_FILE, "utf8").trim();
  const site = siteUrl();
  const ymd = localYmd();
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = opts["dry-run"]
    ? null
    : new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  mkdirSync(QUEUE_DIR, { recursive: true });

  let failed = 0;
  for (const p of products) {
    const id = `${p.id}-${ymd}`;
    const file = join(QUEUE_DIR, `${id}.json`);
    const rel = relative(process.cwd(), file);
    if (existsSync(file)) {
      const status = (JSON.parse(readFileSync(file, "utf8")) as Partial<QueueItem>).status;
      if (status !== "draft") {
        console.error(`✖ ${rel} 는 이미 ${status} 상태라 덮어쓰지 않아요`);
        failed++;
        continue;
      }
      if (!opts.force) {
        console.error(`✖ ${rel} 이 이미 있어요 (다시 만들려면 --force)`);
        failed++;
        continue;
      }
    }
    const warnings: string[] = [];
    const stale = staleWarning(p);
    if (stale) {
      console.warn(`⚠ ${stale}`);
      warnings.push(stale);
    }

    const dateText = formatCheckedDate(p.price_checked_at);
    const recent = readQueue()
      .flatMap((q) => ("item" in q && q.item.id !== id ? [q.item] : []))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, RECENT_COUNT)
      .map(captionTexts);
    const system = systemPrompt(dateText, voice);
    const user = userPrompt(p, dateText, recent);
    if (!client) {
      console.log(`===== ${p.id} system =====\n${system}\n\n===== ${p.id} user =====\n${user}\n`);
      continue;
    }

    try {
      console.log(`… ${p.id} ${p.name} 생성 중 (최근 캡션 ${recent.length}개 참고)`);
      const { draft, attempts, model } = await generate(client, system, user, p, dateText);
      const link = (s: Platform) => utmLink(site, s, id);
      const fill = (s: Platform, text: string) => text.replaceAll(LINK, link(s));
      const item: QueueItem = {
        id,
        product_id: p.id,
        product_name: p.name,
        status: "draft",
        created_at: new Date().toISOString(),
        model,
        youtube: { title: draft.youtube.title, description: fill("youtube", draft.youtube.description), link: link("youtube") },
        instagram: { caption: draft.instagram.caption, hashtags: normalizeTags(draft.instagram.hashtags), link: link("instagram") },
        tiktok: { caption: draft.tiktok.caption, hashtags: normalizeTags(draft.tiktok.hashtags), link: link("tiktok") },
        threads: { body: draft.threads.body, reply: fill("threads", draft.threads.reply), link: link("threads") },
        x: { body: draft.x.body, reply: fill("x", draft.x.reply), link: link("x") },
        checks: { price: p.price, price_checked_at: p.price_checked_at },
        warnings,
      };
      writeFileSync(file, `${JSON.stringify(item, null, 2)}\n`);
      console.log(`✔ ${rel}  (status: draft, ${attempts}번째 시도에서 규칙 통과, ${PLATFORMS.length}개 플랫폼)`);
    } catch (e) {
      failed++;
      if (e instanceof Anthropic.AuthenticationError) {
        console.error("✖ Anthropic 인증 실패 — .env.local 에 ANTHROPIC_API_KEY=... 를 넣어주세요 (코드에 키를 적지 말 것)");
        break;
      }
      if (e instanceof Anthropic.BadRequestError && e.message.includes("anthropic-workspace-id")) {
        console.error(
          "✖ 이 API 키는 워크스페이스에 묶여 있지 않아요 — .env.local 에 ANTHROPIC_WORKSPACE_ID=wrkspc_... 를 추가하거나 " +
            "Console에서 워크스페이스용 키를 새로 만들어 쓰세요",
        );
        break;
      }
      if (e instanceof Anthropic.RateLimitError) console.error(`✖ ${p.id}: 요청 한도 초과 — 잠시 후 다시`);
      else if (e instanceof Anthropic.APIError) console.error(`✖ ${p.id}: API 오류 ${e.status}: ${e.message}`);
      else console.error(`✖ ${p.id}: ${(e as Error).message}`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  if (e instanceof Anthropic.AnthropicError && /API key|apiKey|authentication/i.test(e.message)) {
    fail("Anthropic 키가 없어요 — .env.local 에 ANTHROPIC_API_KEY=... 를 넣어주세요 (.env.example 참고)");
  }
  throw e;
});
