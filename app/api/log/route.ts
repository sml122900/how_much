import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateGuess } from "@/lib/game";
import { getProduct } from "@/lib/products";
import { GUESS_MAX_DIGITS } from "@/lib/config";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUESS_MAX = 10 ** GUESS_MAX_DIGITS - 1;

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

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad();
  }

  const sessionId = body.session_id;
  const product = typeof body.product_id === "string" ? getProduct(body.product_id) : undefined;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId) || !product) return bad();

  const db = supabase();

  if (body.type === "guess") {
    const guess = body.guess;
    if (typeof guess !== "number" || !Number.isInteger(guess) || guess <= 0 || guess > GUESS_MAX) return bad();
    if (!db) return noContent();
    // 가격·판정은 서버의 상품 데이터로 다시 계산
    const r = evaluateGuess(product, guess);
    const { error } = await db.from("guesses").insert({
      session_id: sessionId,
      product_id: product.id,
      guess,
      price: product.price,
      is_hit: r.hit,
      is_cheaper: r.cheaper,
      error_pct: Math.round(r.errorPct * 100) / 100,
    });
    if (error) console.error("[log] guesses insert failed:", error.message);
    return noContent();
  }

  if (body.type === "click") {
    if (body.source !== "reveal" && body.source !== "result") return bad();
    if (!db) return noContent();
    const { error } = await db.from("clicks").insert({
      session_id: sessionId,
      product_id: product.id,
      source: body.source,
    });
    if (error) console.error("[log] clicks insert failed:", error.message);
    return noContent();
  }

  return bad();
}
