"use client";

import { useEffect, useState } from "react";
import {
  APP_NAME,
  APP_SUBCOPY,
  AUTO_ADVANCE_MS,
  GUESS_MAX_DIGITS,
  MAX_POINTS,
  ROUND_SIZE,
  SITE_URL,
  TOLERANCE_PCT,
} from "@/lib/config";
import {
  buildShareText,
  cheaperPct,
  evaluateGuess,
  formatCheckedDate,
  formatWon,
  maxStreak,
  pickRound,
  resultLine,
} from "@/lib/game";
import { logEvent } from "@/lib/log";
import { PRODUCTS } from "@/lib/products";
import { addSeen, getBestStreak, getSeen, setBestStreak } from "@/lib/storage";
import type { GuessResult, Product } from "@/lib/types";
import { Disclosure } from "./Disclosure";
import { PartnerLink } from "./PartnerLink";
import { ProductImage } from "./ProductImage";

type Phase = "start" | "question" | "reveal" | "result";

const primaryBtn =
  "flex h-14 w-full items-center justify-center rounded-2xl bg-gray-900 text-lg font-bold text-white transition active:scale-[0.98] disabled:bg-gray-300";
const ctaBtn =
  "flex h-16 w-full items-center justify-center rounded-2xl bg-blue-600 text-xl font-extrabold text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.98]";
const secondaryBtn =
  "flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold text-gray-500 transition active:bg-gray-100";

export function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [round, setRound] = useState<Product[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const product = round[idx];
  const last = results[results.length - 1];

  function start() {
    const picked = pickRound(PRODUCTS, ROUND_SIZE, { seen: getSeen() });
    if (picked.length === 0) return;
    addSeen(picked.map((p) => p.id));
    setRound(picked);
    setIdx(0);
    setResults([]);
    setStreak(0);
    setBest(getBestStreak());
    setPhase("question");
  }

  function submit(guess: number) {
    if (!product || !(guess > 0)) return;
    const r = evaluateGuess(product, guess);
    const nextStreak = r.hit ? streak + 1 : 0;
    setStreak(nextStreak);
    if (nextStreak > best) {
      setBest(nextStreak);
      setBestStreak(nextStreak);
    }
    setResults((prev) => [...prev, r]);
    setPhase("reveal");
    logEvent({ type: "guess", product_id: product.id, guess });
  }

  function next() {
    if (idx + 1 >= round.length) {
      setPhase("result");
    } else {
      setIdx(idx + 1);
      setPhase("question");
    }
  }

  // CHEAPER 아니면 잠깐 보여주고 자동으로 다음
  useEffect(() => {
    if (phase !== "reveal" || !last || last.cheaper) return;
    const t = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase, idx]);

  if (phase === "start" || !product) return <StartScreen onStart={start} disabled={PRODUCTS.length === 0} />;

  if (phase === "question")
    return (
      <QuestionScreen
        key={product.id}
        product={product}
        index={idx}
        total={round.length}
        streak={streak}
        onSubmit={submit}
      />
    );

  if (phase === "reveal" && last)
    return <RevealScreen result={last} index={idx} total={round.length} streak={streak} onNext={next} />;

  return <ResultScreen results={results} best={best} onRetry={start} />;
}

// ---------------------------------------------------------------------------

function StartScreen({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-10">
      <div className="text-center">
        <div className="text-6xl">🎯</div>
        <h1 className="mt-4 text-5xl font-black tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 text-lg text-gray-500">{APP_SUBCOPY}</p>
      </div>
      <ol className="space-y-3 rounded-2xl bg-gray-50 p-5 text-[15px] leading-relaxed text-gray-700">
        <li>
          <b className="mr-2 text-gray-900">1</b>사진과 한 줄 설명을 보고 가격을 예상해요
        </li>
        <li>
          <b className="mr-2 text-gray-900">2</b>실제 가격과 {TOLERANCE_PCT}% 이내면 정답, 가까울수록 고득점
        </li>
        <li>
          <b className="mr-2 text-gray-900">3</b>한 판 {ROUND_SIZE}문제, 연속 정답으로 기록을 세워요
        </li>
      </ol>
      <button type="button" className={primaryBtn} onClick={onStart} disabled={disabled}>
        {disabled ? "준비 중인 상품이 없어요" : "시작"}
      </button>
    </div>
  );
}

function ProgressBar({ index, total, streak }: { index: number; total: number; streak: number }) {
  return (
    <div className="mb-4 flex items-center justify-between text-sm font-semibold">
      <span className="text-gray-500">
        <span className="text-gray-900">{index + 1}</span>/{total}
      </span>
      <span className={streak > 0 ? "text-orange-500" : "text-gray-400"}>🔥 연속 {streak}</span>
    </div>
  );
}

function QuestionScreen({
  product,
  index,
  total,
  streak,
  onSubmit,
}: {
  product: Product;
  index: number;
  total: number;
  streak: number;
  onSubmit: (guess: number) => void;
}) {
  const [digits, setDigits] = useState("");
  const value = Number(digits);
  const display = digits ? value.toLocaleString("ko-KR") : "";

  return (
    <div className="flex flex-col">
      <ProgressBar index={index} total={total} streak={streak} />
      <ProductImage src={product.image_url} alt={product.name} priority />
      <h2 className="mt-4 text-xl font-bold leading-snug">{product.name}</h2>
      <p className="mt-1 text-[15px] text-gray-500">{product.description}</p>

      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value > 0) onSubmit(value);
        }}
      >
        <label className="flex h-16 items-center rounded-2xl border-2 border-gray-200 px-4 focus-within:border-gray-900">
          <input
            aria-label="예상 가격 (원)"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="예상 가격"
            className="min-w-0 flex-1 bg-transparent text-right text-2xl font-bold outline-none placeholder:text-left placeholder:text-lg placeholder:font-medium placeholder:text-gray-300"
            value={display}
            onChange={(e) =>
              setDigits(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, GUESS_MAX_DIGITS))
            }
          />
          <span className="ml-2 text-xl font-bold text-gray-500">원</span>
        </label>
        <button type="submit" className={primaryBtn} disabled={!(value > 0)}>
          제출
        </button>
      </form>
    </div>
  );
}

function RevealScreen({
  result,
  index,
  total,
  streak,
  onNext,
}: {
  result: GuessResult;
  index: number;
  total: number;
  streak: number;
  onNext: () => void;
}) {
  const { product, guess, errorPct, hit, cheaper, points } = result;
  const isLast = index + 1 >= total;

  return (
    <div className="flex flex-col">
      <ProgressBar index={index} total={total} streak={streak} />
      {cheaper && (
        <div className="mx-auto mb-4 w-36">
          <ProductImage src={product.image_url} alt={product.name} sizes="144px" />
        </div>
      )}
      <h2 className="text-lg font-bold leading-snug">{product.name}</h2>

      <div className="mt-4 rounded-2xl bg-gray-50 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-500">내 예상</span>
          <span className="text-lg font-semibold text-gray-500">{formatWon(guess)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-sm text-gray-500">실제 가격</span>
          <span className="text-3xl font-black">{formatWon(product.price)}</span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
          <span className={`font-bold ${hit ? "text-green-600" : "text-red-500"}`}>
            {hit ? "🟩 정답" : "🟥 아쉬워요"} · 오차 {errorPct.toFixed(1)}%
          </span>
          <span className="font-bold">+{points}점</span>
        </div>
      </div>
      <p className="mt-2 text-right text-xs text-gray-400">가격 확인: {formatCheckedDate(product.price_checked_at)}</p>

      {cheaper ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-center text-2xl font-black text-blue-600">
            생각보다 {cheaperPct(guess, product.price)}% 싸요!
          </p>
          <PartnerLink
            href={product.partner_url}
            productId={product.id}
            source="reveal"
            className={`${ctaBtn} mt-2`}
          />
          <Disclosure />
          <button type="button" className={`${secondaryBtn} mt-2`} onClick={onNext}>
            {isLast ? "결과 보기" : "다음 문제"} →
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <div className="h-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-gray-400"
              style={{ animation: `nd-progress ${AUTO_ADVANCE_MS}ms linear forwards` }}
            />
          </div>
          <button type="button" className={primaryBtn} onClick={onNext}>
            {isLast ? "결과 보기" : "다음"}
          </button>
          <style>{`@keyframes nd-progress { from { width: 0 } to { width: 100% } }`}</style>
        </div>
      )}
    </div>
  );
}

function ResultScreen({
  results,
  best,
  onRetry,
}: {
  results: GuessResult[];
  best: number;
  onRetry: () => void;
}) {
  const [toast, setToast] = useState("");
  const score = results.reduce((s, r) => s + r.points, 0);
  const hits = results.filter((r) => r.hit).length;
  const deals = results.filter((r) => r.cheaper);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  async function share() {
    const url = SITE_URL || window.location.origin;
    const text = buildShareText(APP_NAME, results, url);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast("결과를 복사했어요");
    } catch {
      setToast("복사하지 못했어요");
    }
  }

  return (
    <div className="flex flex-col">
      <div className="pt-4 text-center">
        <p className="text-sm font-semibold text-gray-500">이번 판 점수</p>
        <p className="mt-1 text-6xl font-black tracking-tight">
          {score}
          <span className="text-2xl font-bold text-gray-400">/{results.length * MAX_POINTS}</span>
        </p>
        <p className="mt-5 text-2xl tracking-widest">{resultLine(results)}</p>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="정답" value={`${hits}/${results.length}`} />
        <Stat label="이번 판 연속" value={String(maxStreak(results))} />
        <Stat label="최고 연속" value={String(best)} />
      </dl>

      <div className="mt-6 flex flex-col gap-2">
        <button type="button" className={primaryBtn} onClick={share}>
          공유하기
        </button>
        <button type="button" className={secondaryBtn} onClick={onRetry}>
          다시 하기
        </button>
      </div>

      {deals.length > 0 && (
        <section className="mt-8">
          <h3 className="text-lg font-bold">이번 판 이득 목록</h3>
          <p className="mt-1 text-sm text-gray-500">생각보다 쌌던 상품이에요</p>
          <ul className="mt-4 flex flex-col gap-3">
            {deals.map(({ product, guess }) => (
              <li key={product.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3">
                <div className="w-20 shrink-0">
                  <ProductImage src={product.image_url} alt={product.name} sizes="80px" className="rounded-xl" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{product.name}</p>
                  <p className="mt-0.5 text-lg font-black">{formatWon(product.price)}</p>
                  <p className="text-xs text-blue-600">
                    예상보다 {cheaperPct(guess, product.price)}% 저렴
                  </p>
                </div>
                <PartnerLink
                  href={product.partner_url}
                  productId={product.id}
                  source="result"
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white active:scale-[0.97]"
                />
              </li>
            ))}
          </ul>
          <Disclosure className="mt-3" />
        </section>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 text-xl font-black">{value}</dd>
    </div>
  );
}
