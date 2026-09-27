/**
 * Supabase 연결과 스키마를 확인한다. 배포 전, supabase/all_migrations.sql 을 실행한 뒤 돌린다.
 *
 *   npm run verify:supabase
 *
 * 확인하는 것:
 *   1) guesses / clicks / milestones 테이블과 필요한 컬럼(round_type, reward 포함)이 있는지
 *   2) 테이블마다 테스트 row 하나를 insert → select → delete 해서 실제로 쓰고 읽을 수 있는지
 *   3) (NEXT_PUBLIC_SUPABASE_ANON_KEY 가 있으면) anon key로는 insert가 막히는지 — RLS 검증
 *
 * 절대 키 값 자체를 콘솔에 출력하지 않는다. 실패하면 exit 1.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  // .env.local이 없으면 무시 — Vercel 등에서 이미 설정된 환경변수를 그대로 쓴다
}

// 테스트 row 식별용 고정 UUID (session_id 컬럼이 uuid 타입이라 문자열 그대로는 못 씀)
const VERIFY_SESSION_ID = "00000000-0000-0000-0000-000000009999";
const VERIFY_PRODUCT_ID = "verify-script";

type Row = { name: string; ok: boolean | "skip"; detail: string };
const rows: Row[] = [];
const record = (name: string, ok: boolean | "skip", detail: string) => {
  rows.push({ name, ok, detail });
};

function printReport() {
  console.log("");
  console.table(
    rows.map((r) => ({
      검사: r.name,
      결과: r.ok === "skip" ? "· 건너뜀" : r.ok ? "✔ 통과" : "✖ 실패",
      설명: r.detail,
    })),
  );
}

function failFast(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const TABLE_COLUMNS: Record<string, string[]> = {
  guesses: [
    "id",
    "session_id",
    "product_id",
    "guess",
    "price",
    "is_hit",
    "is_cheaper",
    "error_pct",
    "round_type",
    "created_at",
  ],
  clicks: ["id", "session_id", "product_id", "source", "created_at"],
  milestones: ["id", "session_id", "streak", "reward", "created_at"],
};

async function checkColumns(db: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await db.from(table).select(TABLE_COLUMNS[table].join(",")).limit(1);
  if (error) {
    record(`${table} 스키마`, false, error.message);
    return false;
  }
  record(`${table} 스키마`, true, `컬럼 ${TABLE_COLUMNS[table].length}개 확인`);
  return true;
}

function testRow(table: string): Record<string, unknown> {
  switch (table) {
    case "guesses":
      return {
        session_id: VERIFY_SESSION_ID,
        product_id: VERIFY_PRODUCT_ID,
        guess: 1000,
        price: 1000,
        is_hit: true,
        is_cheaper: false,
        error_pct: 0,
        round_type: "main",
      };
    case "clicks":
      return { session_id: VERIFY_SESSION_ID, product_id: VERIFY_PRODUCT_ID, source: "reveal" };
    case "milestones":
      return { session_id: VERIFY_SESSION_ID, streak: 1, reward: "title" };
    default:
      throw new Error(`알 수 없는 테이블: ${table}`);
  }
}

async function checkInsertSelectDelete(db: SupabaseClient, table: string): Promise<void> {
  const inserted = await db.from(table).insert(testRow(table)).select("id").single();
  if (inserted.error || !inserted.data) {
    record(`${table} insert→select→delete`, false, `insert 실패: ${inserted.error?.message}`);
    return;
  }
  const id = inserted.data.id as number;

  const selected = await db.from(table).select("id").eq("id", id).maybeSingle();
  if (selected.error || !selected.data) {
    record(`${table} insert→select→delete`, false, `select 실패: ${selected.error?.message}`);
    return;
  }

  const deleted = await db.from(table).delete().eq("id", id);
  if (deleted.error) {
    record(`${table} insert→select→delete`, false, `delete 실패: ${deleted.error.message}`);
    return;
  }

  record(`${table} insert→select→delete`, true, `id=${id} 로 왕복 확인 후 정리함`);
}

/** anon key로 insert 시도 — RLS가 제대로면 거부되어야 한다 */
async function checkAnonRejected(url: string, anonKey: string | undefined, admin: SupabaseClient): Promise<void> {
  if (!anonKey) {
    record("RLS(anon)", "skip", "NEXT_PUBLIC_SUPABASE_ANON_KEY 없음 — 건너뜀");
    return;
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.from("guesses").insert(testRow("guesses")).select("id").single();
  if (!error && data) {
    // 열려 있으면 안 되는 게 열려 있었다는 뜻 — 테스트 흔적은 service role로 지운다
    await admin.from("guesses").delete().eq("id", data.id as number);
    record("RLS(anon)", false, "anon key로 insert가 성공했습니다 — RLS 정책을 확인하세요");
    return;
  }
  record("RLS(anon)", true, "anon key insert가 거부됨 (정상)");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    failFast(
      [
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있지 않습니다.",
        ".env.local 에 두 값을 채우거나(.env.example 참고), 이미 배포된 환경이면 그 환경변수를 확인하세요.",
      ].join("\n  "),
    );
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 연결 자체가 되는지 먼저 가볍게 확인 (URL·키가 틀리면 여기서 바로 알 수 있게)
  const ping = await admin.from("guesses").select("id", { count: "exact", head: true });
  if (ping.error) {
    failFast(
      [
        `Supabase에 연결할 수 없습니다: ${ping.error.message}`,
        "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 올바른지, supabase/all_migrations.sql을 실행했는지 확인하세요.",
      ].join("\n  "),
    );
  }

  for (const table of Object.keys(TABLE_COLUMNS)) {
    const hasColumns = await checkColumns(admin, table);
    if (hasColumns) await checkInsertSelectDelete(admin, table);
  }

  await checkAnonRejected(url, anonKey, admin);

  printReport();

  const failed = rows.filter((r) => r.ok === false);
  if (failed.length > 0) {
    console.error(`\n✖ ${failed.length}개 검사 실패.`);
    process.exit(1);
  }
  console.log("\n✔ Supabase 연결·스키마 확인 완료.");
}

main().catch((e) => {
  console.error("✖ 예상치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
