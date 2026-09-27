/**
 * data/products.csv 를 검증하고 게임 풀(data/products.json)을 만든다.
 *
 *   npm run build:products                 # data/products.csv → data/products.json
 *   npm run build:products -- other.csv    # 다른 CSV로 빌드
 *
 * 오류가 하나라도 있으면 exit 1 (JSON 안 씀).
 * 비활성(active=false)·가격 확인 14일 초과 상품은 풀에서 제외.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PARTNER_LINK_HOST, PRICE_STALE_DAYS } from "../lib/config";
import type { Product } from "../lib/types";

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
] as const;

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

function todayLocal(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
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

  const today = todayLocal();
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
    if (!/^\d+$/.test(priceRaw) || !Number.isSafeInteger(price) || price <= 0 || price > 999_999_999)
      err(`price 는 양의 정수(원)여야 함 "${priceRaw}"`);

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
    const checked = parseYmd(checkedAt);
    let isStale = false;
    if (!checked) err(`price_checked_at 형식 오류 "${checkedAt}" (YYYY-MM-DD)`);
    else {
      const days = Math.round((today.getTime() - checked.getTime()) / 86_400_000);
      if (days < 0) err(`price_checked_at 이 미래 날짜 "${checkedAt}"`);
      else if (days > PRICE_STALE_DAYS) {
        isStale = true;
        warnings.push(`${where}: 가격 확인 ${days}일 경과 (${checkedAt}) → 풀에서 제외. 가격 재확인 필요`);
      }
    }

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
