import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAX_PRICE } from "@/lib/config";
import { evaluateGuess } from "@/lib/game";
import { getProduct } from "@/lib/products";
import type { ClickSource, RewardType, RoundType } from "@/lib/types";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLICK_SOURCES: readonly ClickSource[] = ["reveal", "reveal_gray", "result", "result_rest"];
const ROUND_TYPES: readonly RoundType[] = ["main", "bonus"];
const REWARD_TYPES: readonly RewardType[] = ["title", "bonus_unlock", "ad_free"];

let client: SupabaseClient | null | undefined;

/** env 없으면 null → 로깅 no-op */
function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

const noContent = () => new Response(null, { status: 204 });
const bad = () => new Response(null, { status: 400 });

async function insert(table: string, row: Record<string, unknown>) {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from(table).insert(row);
  if (error) console.error(`[log] ${table} insert failed:`, error.message);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad();
  }

  const sessionId = body.session_id;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return bad();

  if (body.type === "milestone") {
    const streak = body.streak;
    const reward = body.reward;
    if (typeof streak !== "number" || !Number.isInteger(streak) || streak <= 0) return bad();
    if (!REWARD_TYPES.includes(reward as RewardType)) return bad();
    await insert("milestones", { session_id: sessionId, streak, reward });
    return noContent();
  }

  const product = typeof body.product_id === "string" ? getProduct(body.product_id) : undefined;
  if (!product) return bad();

  if (body.type === "guess") {
    const guess = body.guess;
    const roundType = body.round_type;
    if (typeof guess !== "number" || !Number.isInteger(guess) || guess <= 0 || guess > MAX_PRICE) return bad();
    if (!ROUND_TYPES.includes(roundType as RoundType)) return bad();
    // 가격·판정은 서버의 상품 데이터로 다시 계산
    const r = evaluateGuess(product, guess);
    await insert("guesses", {
      session_id: sessionId,
      product_id: product.id,
      guess,
      price: product.price,
      is_hit: r.hit,
      is_cheaper: r.cheaper,
      error_pct: Math.round(r.errorPct * 100) / 100,
      round_type: roundType,
    });
    return noContent();
  }

  if (body.type === "click") {
    if (!CLICK_SOURCES.includes(body.source as ClickSource)) return bad();
    await insert("clicks", { session_id: sessionId, product_id: product.id, source: body.source });
    return noContent();
  }

  return bad();
}
