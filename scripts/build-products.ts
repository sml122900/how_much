/**
 * data/products.csv 를 검증하고 게임 풀(data/products.json)을 만든다.
 *
 *   npm run build:products                 # data/products.csv → data/products.json
 *   npm run build:products -- other.csv    # 다른 CSV로 빌드
 *
 * 오류가 하나라도 있으면 exit 1 (JSON 안 씀).
 * 비활성(active=false)·가격 확인 14일 초과 상품은 풀에서 제외.
 * (런타임에서도 lib/products.ts freshPool() 이 같은 기준으로 한 번 더 거른다)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_PRICE, PARTNER_LINK_HOST, PRICE_STALE_DAYS, PRICE_UNIT } from "../lib/config";
import { daysSince } from "../lib/freshness";
import { SHIPPING_TYPES, TIERS, type Product, type Shipping, type Tier } from "../lib/types";

const COLUMNS = [
  "id",
  "name",
  "description",
  "image_url",
  "price",
  "category",
  "partner_url",
  "sub_id",
  "price_checked_at",
  "active",
  "price_basis",
  "options",
  "shipping",
  "tier",
] as const;

const OPTIONS = ["single", "default"];
const DESCRIPTION_MAX = 40;
// next.config.ts images.remotePatterns 와 맞춰야 함
const IMAGE_HOST_OK = (h: string) => h.endsWith(".coupangcdn.com") || h === "ads-partners.coupang.com";

const inPath = resolve(process.argv[2] ?? "data/products.csv");
const outPath = resolve("data/products.json");

/** RFC 4180 수준의 최소 CSV 파서 (따옴표, 이스케이프된 따옴표, 필드 내 콤마/줄바꿈) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function main() {
  const rows = parseCsv(readFileSync(inPath, "utf8"));
  const [header, ...body] = rows;
  const errors: string[] = [];
  const warnings: string[] = [];

  const headerNorm = header.map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !headerNorm.includes(c));
  if (missing.length) {
    console.error(`✖ 헤더에 컬럼이 없습니다: ${missing.join(", ")}`);
    process.exit(1);
  }
  const col = (r: string[], name: (typeof COLUMNS)[number]) => (r[headerNorm.indexOf(name)] ?? "").trim();

  const ids = new Set<string>();
  const pool: Product[] = [];
  let inactive = 0;
  let stale = 0;

  body.forEach((r, i) => {
    const line = i + 2;
    const id = col(r, "id");
    const where = `${line}행(${id || "id 없음"})`;
    const err = (msg: string) => errors.push(`${where}: ${msg}`);

    if (!/^p\d{3,}$/.test(id)) err(`id 형식 오류 "${id}" (예: p001)`);
    else if (ids.has(id)) err(`id 중복 "${id}"`);
    ids.add(id);

    const name = col(r, "name");
    if (!name) err("name 비어 있음");

    const description = col(r, "description");
    if (!description) err("description 비어 있음");
    else if ([...description].length > DESCRIPTION_MAX)
      err(`description ${[...description].length}자 (최대 ${DESCRIPTION_MAX}자)`);

    const imageUrl = col(r, "image_url");
    try {
      const u = new URL(imageUrl);
      if (u.protocol !== "https:" || !IMAGE_HOST_OK(u.hostname))
        err(`image_url 호스트 불허 "${u.hostname}" (*.coupangcdn.com, ads-partners.coupang.com 만)`);
    } catch {
      err(`image_url 이 올바른 URL이 아님 "${imageUrl}"`);
    }

    const priceRaw = col(r, "price");
    const price = Number(priceRaw);
    if (!/^\d+$/.test(priceRaw) || !Number.isSafeInteger(price) || price <= 0 || price > MAX_PRICE)
      err(`price 는 1~${MAX_PRICE.toLocaleString("ko-KR")} 사이 정수(원)여야 함 "${priceRaw}"`);
    else if (price % PRICE_UNIT !== 0)
      err(`price 가 ${PRICE_UNIT}원 단위가 아님 "${priceRaw}" — 일의 자리가 있는 상품은 큐레이션에서 제외`);

    const category = col(r, "category");
    if (!category) err("category 비어 있음");

    const partnerUrl = col(r, "partner_url");
    try {
      const u = new URL(partnerUrl);
      if (u.protocol !== "https:" || u.hostname !== PARTNER_LINK_HOST)
        err(`partner_url 도메인 불허 "${u.hostname}" (${PARTNER_LINK_HOST} 만)`);
      if (/PLACEHOLDER/i.test(partnerUrl)) warnings.push(`${where}: partner_url 이 아직 placeholder 입니다`);
    } catch {
      err(`partner_url 이 올바른 URL이 아님 "${partnerUrl}"`);
    }

    const subId = col(r, "sub_id");
    if (subId !== id) err(`sub_id "${subId}" 는 id "${id}" 와 같아야 함`);

    const checkedAt = col(r, "price_checked_at");
    const days = daysSince(checkedAt);
    let isStale = false;
    if (days === null) err(`price_checked_at 형식 오류 "${checkedAt}" (YYYY-MM-DD)`);
    else if (days < 0) err(`price_checked_at 이 미래 날짜 "${checkedAt}"`);
    else if (days > PRICE_STALE_DAYS) {
      isStale = true;
      warnings.push(`${where}: 가격 확인 ${days}일 경과 (${checkedAt}) → 풀에서 제외. 가격 재확인 필요`);
    }

    // 구매 정직성: 비회원 기본 판매가만, 옵션 가격 일치, 배송 조건 명시
    const priceBasis = col(r, "price_basis");
    if (priceBasis !== "listed")
      err(`price_basis 는 "listed" 여야 함 "${priceBasis}" (와우 회원가·카드 즉시할인·쿠폰가 금지)`);
    const options = col(r, "options");
    if (!OPTIONS.includes(options)) err(`options 는 single/default 중 하나 "${options}"`);
    const shipping = col(r, "shipping") as Shipping;
    if (!SHIPPING_TYPES.includes(shipping)) err(`shipping 은 ${SHIPPING_TYPES.join("/")} 중 하나 "${shipping}"`);

    // 비우면 normal (보너스 라운드용 hard 풀은 명시적으로 표시한 상품만)
    const tierRaw = col(r, "tier").toLowerCase();
    const tier = (tierRaw === "" ? "normal" : tierRaw) as Tier;
    if (!TIERS.includes(tier)) err(`tier 는 비우거나 normal/hard 중 하나 "${col(r, "tier")}"`);

    const activeRaw = col(r, "active").toLowerCase();
    if (activeRaw !== "true" && activeRaw !== "false") err(`active 는 true/false "${col(r, "active")}"`);

    if (activeRaw !== "true") {
      inactive++;
      return;
    }
    if (isStale) {
      stale++;
      return;
    }
    pool.push({
      id,
      name,
      description,
      image_url: imageUrl,
      price,
      category,
      partner_url: partnerUrl,
      price_checked_at: checkedAt,
      shipping,
      tier,
    });
  });

  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✖ ${e}`);
    console.error(`\n빌드 실패: 오류 ${errors.length}건. ${outPath} 는 갱신되지 않았습니다.`);
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(pool, null, 2) + "\n");
  console.log(
    `✔ ${body.length}개 중 ${pool.length}개를 게임 풀로 저장 (비활성 ${inactive}, 가격 오래됨 ${stale}) → ${outPath}`,
  );
  if (pool.length === 0) console.warn("⚠ 게임 풀이 비어 있습니다. 게임을 시작할 수 없습니다.");
}

main();
