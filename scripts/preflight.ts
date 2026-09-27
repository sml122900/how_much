/**
 * 배포 전 점검. 문제를 먼저 다 나열하고, 하나라도 실패하면 빌드는 돌리지 않고 exit 1.
 *
 *   npm run preflight
 *
 * data/products.csv 를 다시 빌드하지는 않는다 — 먼저 `npm run build:products` 를 실행해뒀다고 가정한다.
 * Supabase 연결은 다루지 않는다 (그건 `npm run verify:supabase`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BONUS_ROUND_SIZE } from "../lib/config";
import { freshPool, hardPool } from "../lib/products";

try {
  process.loadEnvFile(".env.local");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}

/** README "최소 20개 이상 권장" 과 맞춤 — 미달이어도 실패는 아니고 경고만 */
const MAIN_POOL_WARN_MIN = 20;
const HARD_POOL_WARN_MIN = BONUS_ROUND_SIZE;

const PRIVACY_EMAIL_PLACEHOLDER = "[문의 이메일 주소를 여기에 적어주세요]";

type Result = { name: string; status: "ok" | "warn" | "fail"; detail: string };
const results: Result[] = [];
const ok = (name: string, detail: string) => results.push({ name, status: "ok", detail });
const warn = (name: string, detail: string) => results.push({ name, status: "warn", detail });
const fail = (name: string, detail: string) => results.push({ name, status: "fail", detail });

function checkProductPool() {
  const main = freshPool();
  const hard = hardPool();

  if (main.length < MAIN_POOL_WARN_MIN) {
    warn("상품 풀 (전체)", `${main.length}개 — ${MAIN_POOL_WARN_MIN}개 미만이면 같은 상품이 자주 반복돼요`);
  } else {
    ok("상품 풀 (전체)", `${main.length}개`);
  }

  if (hard.length < HARD_POOL_WARN_MIN) {
    warn("상품 풀 (하드)", `${hard.length}개 — ${HARD_POOL_WARN_MIN}개 미만이면 보너스 라운드가 열리지 않아요`);
  } else {
    ok("상품 풀 (하드)", `${hard.length}개`);
  }

  const placeholders = main.filter((p) => /PLACEHOLDER/i.test(p.partner_url));
  if (placeholders.length > 0) {
    fail(
      "제휴 링크",
      `placeholder 링크가 ${placeholders.length}개 남아 있음: ${placeholders.map((p) => p.id).join(", ")}`,
    );
  } else {
    ok("제휴 링크", "placeholder 없음");
  }
}

function checkSiteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    fail("NEXT_PUBLIC_SITE_URL", "설정되어 있지 않음 — 공유 텍스트에 접속 도메인이 아니라 잘못된 URL이 들어갈 수 있음");
    return;
  }
  ok("NEXT_PUBLIC_SITE_URL", url);
}

function checkPrivacyPage() {
  let text: string;
  try {
    text = readFileSync(resolve("app/privacy/page.tsx"), "utf8");
  } catch {
    fail("개인정보 처리방침", "app/privacy/page.tsx 를 찾을 수 없음");
    return;
  }
  if (text.includes(PRIVACY_EMAIL_PLACEHOLDER)) {
    fail("개인정보 처리방침", "문의 이메일 자리표시자가 아직 남아 있음 — app/privacy/page.tsx 에서 실제 주소로 바꿀 것");
    return;
  }
  ok("개인정보 처리방침", "이메일 자리표시자 없음");
}

function checkAds() {
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
  if (!enabled) {
    ok("광고", "NEXT_PUBLIC_ADS_ENABLED 가 꺼져 있음 (기본값)");
    return;
  }
  const missing = ["NEXT_PUBLIC_ADSENSE_CLIENT", "NEXT_PUBLIC_AD_SLOT_START", "NEXT_PUBLIC_AD_SLOT_RESULT"].filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    fail("광고", `ADS_ENABLED=true 인데 비어 있음: ${missing.join(", ")}`);
    return;
  }
  ok("광고", "ADS_ENABLED=true, 클라이언트·슬롯 ID 모두 설정됨");
}

function printReport() {
  console.log("");
  console.table(
    results.map((r) => ({
      항목: r.name,
      결과: { ok: "✔ 통과", warn: "⚠ 경고", fail: "✖ 실패" }[r.status],
      설명: r.detail,
    })),
  );
}

function main() {
  checkProductPool();
  checkSiteUrl();
  checkPrivacyPage();
  checkAds();
  printReport();

  const failed = results.filter((r) => r.status === "fail");
  if (failed.length > 0) {
    console.error(`\n✖ ${failed.length}개 항목 실패. 위 내용을 고친 뒤 다시 실행하세요. (빌드는 실행하지 않았습니다)`);
    process.exit(1);
  }

  console.log("\n✔ 사전 점검 통과. npm run build 를 실행합니다...\n");
  try {
    execFileSync("npm", ["run", "build"], { stdio: "inherit", shell: true });
  } catch {
    console.error("\n✖ npm run build 가 실패했습니다. 위 로그를 확인하세요.");
    process.exit(1);
  }
  console.log("\n✔ 빌드까지 통과했습니다. 배포해도 됩니다.");
}

main();
