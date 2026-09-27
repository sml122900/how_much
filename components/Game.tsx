"use client";

import confetti from "canvas-confetti";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_NAME,
  APP_SUBCOPY,
  AUTO_ADVANCE_MS,
  MAX_POINTS,
  MAX_PRICE,
  PRICE_UNIT,
  ROUND_SIZE,
  SITE_URL,
  STREAK_MILESTONES,
  TOLERANCE_PCT,
} from "@/lib/config";
import { COPY } from "@/lib/copy";
import {
  buildShareText,
  cheaperPct,
  evaluateGuess,
  formatCheckedDate,
  formatWon,
  maxStreak,
  outcomeOf,
  pickRound,
  resultLine,
} from "@/lib/game";
import { logEvent } from "@/lib/log";
import { freshPool } from "@/lib/products";
import { installAudioUnlock, play } from "@/lib/sfx";
import { addSeen, getBestStreak, getSeen, setBestStreak } from "@/lib/storage";
import type { GuessResult, Outcome, Product } from "@/lib/types";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Disclosure } from "./Disclosure";
import { MuteToggle } from "./MuteToggle";
import { PartnerLink } from "./PartnerLink";
import { type DrumMode, PriceDrum } from "./PriceDrum";
import { ProductImage } from "./ProductImage";

type Phase = "start" | "play" | "result";

const primaryBtn =
  "flex h-14 w-full items-center justify-center rounded-2xl bg-gray-900 text-lg font-bold text-white transition active:scale-[0.98] disabled:bg-gray-300";
const ctaBtn =
  "flex h-16 w-full items-center justify-center rounded-2xl bg-blue-600 text-xl font-extrabold text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.98]";
const secondaryBtn =
  "flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold text-gray-500 transition active:bg-gray-100";
const grayLink = "text-sm text-gray-400 underline underline-offset-2";

export function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [round, setRound] = useState<Product[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const product = round[idx];

  // 풀은 "지금" 날짜 기준 — 하이드레이션 이후에 계산
  useEffect(() => {
    setPoolSize(freshPool().length);
    return installAudioUnlock();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  function start() {
    const picked = pickRound(freshPool(), ROUND_SIZE, { seen: getSeen() });
    if (picked.length === 0) return;
    addSeen(picked.map((p) => p.id));
    setRound(picked);
    setIdx(0);
    setResults([]);
    setStreak(0);
    setBest(getBestStreak());
    setPhase("play");
  }

  // 공개가 끝난 순간에 점수·스트릭 반영
  const onRevealed = useCallback(
    (r: GuessResult) => {
      setResults((prev) => [...prev, r]);
      const next = r.hit ? streak + 1 : 0;
      setStreak(next);
      if (next > best) {
        setBest(next);
        setBestStreak(next);
      }
      if ((STREAK_MILESTONES as readonly number[]).includes(next)) {
        showToast(COPY.milestone(next));
        logEvent({ type: "milestone", streak: next });
      }
    },
    [streak, best, showToast],
  );

  const next = useCallback(() => {
    if (idx + 1 >= round.length) setPhase("result");
    else setIdx(idx + 1);
  }, [idx, round.length]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase, idx]);

  return (
    <>
      <div className="mb-2 flex h-9 items-center justify-between text-sm font-semibold">
        {phase === "play" && product ? (
          <span className="text-gray-500">
            <span className="text-gray-900">{idx + 1}</span>/{round.length}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {phase === "play" && (
            <span className={streak > 0 ? "text-orange-500" : "text-gray-400"}>🔥 연속 {streak}</span>
          )}
          <MuteToggle />
        </div>
      </div>

      {phase === "start" && <StartScreen onStart={start} disabled={poolSize === 0} />}
      {phase === "play" && product && (
        <PlayScreen
          key={`${product.id}-${idx}`}
          product={product}
          isLast={idx + 1 >= round.length}
          onRevealed={onRevealed}
          onNext={next}
        />
      )}
      {phase === "result" && <ResultScreen results={results} best={best} onRetry={start} />}

      {toast && (
        <div
          key={toast.id}
          role="status"
          className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-5 py-3 text-sm font-bold text-white shadow-lg"
        >
          {toast.text}
        </div>
      )}
    </>
  );
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
          <b className="mr-2 text-gray-900">1</b>사진과 설명을 보고 숫자 드럼을 굴려 가격을 맞혀요
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

// ---------------------------------------------------------------------------

function celebrate(outcome: Outcome, reducedMotion: boolean) {
  // 폭죽은 앱의 reduced-motion 판정을 따른다 (소리는 음소거 토글만 따름)
  const burst = (opts: confetti.Options) => !reducedMotion && confetti({ zIndex: 40, ...opts });
  switch (outcome) {
    case "hit_cheaper":
      play("fanfare");
      play("cheer", { delay: 0.18 });
      burst({ particleCount: 150, spread: 100, startVelocity: 45, origin: { y: 0.55 } });
      setTimeout(() => {
        burst({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
        burst({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
      }, 160);
      break;
    case "hit":
      play("cheer");
      burst({ particleCount: 60, spread: 70, scalar: 0.9, origin: { y: 0.55 } });
      break;
    case "cheaper":
      play("coin");
      play("coin", { delay: 0.09, rate: 1.25 });
      break;
    case "miss":
      play("thud", { rate: 0.8 });
      break;
  }
}

const REVEAL_TIMER = "reveal: 제출→마지막 정지";

function PlayScreen({
  product,
  isLast,
  onRevealed,
  onNext,
}: {
  product: Product;
  isLast: boolean;
  onRevealed: (r: GuessResult) => void;
  onNext: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<DrumMode>("input");
  const [value, setValue] = useState(0);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [direct, setDirect] = useState(false);
  const [directText, setDirectText] = useState("");
  const [autoCancelled, setAutoCancelled] = useState(false);
  const resultRef = useRef<GuessResult | null>(null);

  const outcome = result ? outcomeOf(result) : null;
  const autoAdvance = outcome === "hit" || outcome === "miss";

  function submit() {
    if (stage !== "input" || value <= 0) return;
    console.time(REVEAL_TIMER);
    const r = evaluateGuess(product, value);
    resultRef.current = r;
    setResult(r);
    setStage("spin");
    logEvent({ type: "guess", product_id: product.id, guess: value });
  }

  const onSpinEnd = useCallback(() => {
    console.timeEnd(REVEAL_TIMER);
    setStage("reveal");
    const r = resultRef.current!;
    onRevealed(r);
    celebrate(outcomeOf(r), reducedMotion);
  }, [onRevealed, reducedMotion]);

  useEffect(() => {
    if (stage !== "reveal" || !autoAdvance || autoCancelled) return;
    const t = setTimeout(onNext, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [stage, autoAdvance, autoCancelled, onNext]);

  return (
    <div className="flex flex-col">
      <div className="mx-auto" style={{ width: "min(100%, max(96px, calc(100dvh - 520px)))" }}>
        <ProductImage src={product.image_url} alt={product.name} priority sizes="(max-width: 448px) 60vw, 280px" />
      </div>
      <h2 className="mt-3 text-center text-lg font-bold leading-snug">{product.name}</h2>
      {stage === "input" && <p className="mt-0.5 text-center text-sm text-gray-500">{product.description}</p>}

      <div className="mt-2 flex h-11 items-end justify-center">
        {stage === "input" ? (
          <p className="text-[34px] font-black leading-none tabular-nums" aria-live="polite">
            {formatWon(value)}
          </p>
        ) : (
          <p className="text-sm font-semibold text-gray-500">
            내 예상 <span className="tabular-nums text-gray-700">{formatWon(result?.guess ?? value)}</span>
            <span className="mx-1.5 text-gray-300">→</span>실제 가격
          </p>
        )}
      </div>

      <div className="mt-2">
        <PriceDrum
          mode={stage}
          value={value}
          onChange={setValue}
          target={product.price}
          reducedMotion={reducedMotion}
          onSpinEnd={onSpinEnd}
        />
      </div>

      {stage === "input" && (
        <form
          className="mt-3 flex flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button type="submit" className={primaryBtn} disabled={value <= 0}>
            제출
          </button>
          <button
            type="button"
            className="mx-auto mt-1.5 py-1 text-xs text-gray-400 underline underline-offset-2"
            aria-expanded={direct}
            onClick={() => setDirect(!direct)}
          >
            직접 입력
          </button>
          {direct && (
            <label className="mt-1 flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-gray-900">
              <input
                aria-label="예상 가격 직접 입력 (원)"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                placeholder="예: 24900"
                className="min-w-0 flex-1 bg-transparent text-right text-lg font-bold outline-none placeholder:font-normal placeholder:text-gray-300"
                value={directText}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 6);
                  setDirectText(raw);
                  setValue(Math.min(MAX_PRICE, Math.floor(Number(raw || 0) / PRICE_UNIT) * PRICE_UNIT));
                }}
              />
              <span className="text-sm text-gray-500">원 · 10원 단위</span>
            </label>
          )}
        </form>
      )}

      {stage === "reveal" && result && outcome && (
        <Verdict
          result={result}
          outcome={outcome}
          isLast={isLast}
          autoCancelled={autoCancelled}
          onCancelAuto={() => setAutoCancelled(true)}
          onNext={onNext}
        />
      )}
    </div>
  );
}

function Verdict({
  result,
  outcome,
  isLast,
  autoCancelled,
  onCancelAuto,
  onNext,
}: {
  result: GuessResult;
  outcome: Outcome;
  isLast: boolean;
  autoCancelled: boolean;
  onCancelAuto: () => void;
  onNext: () => void;
}) {
  const { product, guess, errorPct, points } = result;
  const pct = cheaperPct(guess, product.price);
  const headline = {
    hit_cheaper: `${COPY.hit} ${COPY.cheaper(pct)}`,
    hit: COPY.hit,
    cheaper: COPY.cheaper(pct),
    miss: COPY.pricier,
  }[outcome];
  const headlineColor = {
    hit_cheaper: "text-blue-600",
    hit: "text-green-600",
    cheaper: "text-blue-600",
    miss: "text-gray-600",
  }[outcome];
  const bigCta = outcome === "hit_cheaper" || outcome === "cheaper";
  const shippingNote =
    product.shipping === "rocket_threshold" || product.shipping === "seller_paid" ? COPY.shippingMaybe : COPY.shippingFree;
  const nextLabel = isLast ? "결과 보기" : "다음";

  return (
    <div className="mt-2 flex flex-col">
      <p className="text-center text-xs text-gray-400">
        {shippingNote} · 가격 확인: {formatCheckedDate(product.price_checked_at)}
      </p>
      <p className={`mt-3 text-center text-2xl font-black ${headlineColor}`}>{headline}</p>
      <p className="mt-1 text-center text-sm text-gray-500">
        오차 {errorPct.toFixed(1)}% · <b className="text-gray-900">+{points}점</b>
      </p>

      {bigCta ? (
        <div className="mt-4 flex flex-col gap-2">
          <PartnerLink href={product.partner_url} productId={product.id} source="reveal" className={ctaBtn}>
            {COPY.buy}
          </PartnerLink>
          <Disclosure />
          <button type="button" className={`${secondaryBtn} mt-1`} onClick={onNext}>
            {nextLabel} →
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center">
          <button type="button" className={primaryBtn} onClick={onNext}>
            {nextLabel}
          </button>
          <PartnerLink
            href={product.partner_url}
            productId={product.id}
            source="reveal_gray"
            className={`${grayLink} mt-2 py-1`}
            onClick={onCancelAuto}
          >
            {COPY.buyAnyway}
          </PartnerLink>
          <Disclosure />
          {/* 자동 넘김 남은 시간: 화면 하단 고정 얇은 바 */}
          {!autoCancelled && (
            <div className="fixed inset-x-0 bottom-0 z-30 h-1 bg-gray-100" aria-hidden>
              <div
                className="h-full origin-left bg-gray-500"
                style={{ animation: `nd-countdown ${AUTO_ADVANCE_MS}ms linear forwards` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

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
  const rest = results.filter((r) => !r.cheaper);

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
      <div className="pt-2 text-center">
        <p className="text-sm font-semibold text-gray-500">이번 판 점수</p>
        <p className="mt-1 text-6xl font-black tracking-tight">
          {score}
          <span className="text-2xl font-bold text-gray-400">/{results.length * MAX_POINTS}</span>
        </p>
        <p className="mt-5 whitespace-nowrap text-[22px] tracking-wide">{resultLine(results)}</p>
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
                  <p className="text-xs text-blue-600">예상보다 {cheaperPct(guess, product.price)}% 저렴</p>
                </div>
                <PartnerLink
                  href={product.partner_url}
                  productId={product.id}
                  source="result"
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white active:scale-[0.97]"
                >
                  {COPY.buy}
                </PartnerLink>
              </li>
            ))}
          </ul>
          <Disclosure className="mt-3" />
        </section>
      )}

      {rest.length > 0 && (
        <details className="group mt-6">
          <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-sm font-semibold text-gray-500">
            이번 판 나머지 상품 ({rest.length})
            <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-gray-100">
            {rest.map(({ product }) => (
              <li key={product.id} className="flex items-center gap-3 py-2">
                <div className="w-10 shrink-0">
                  <ProductImage src={product.image_url} alt={product.name} sizes="40px" className="rounded-lg" />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-gray-700">{product.name}</p>
                <span className="text-sm font-semibold tabular-nums text-gray-700">{formatWon(product.price)}</span>
                <PartnerLink
                  href={product.partner_url}
                  productId={product.id}
                  source="result_rest"
                  className="shrink-0 text-xs text-gray-400 underline underline-offset-2"
                >
                  {COPY.viewAtStore}
                </PartnerLink>
              </li>
            ))}
          </ul>
          <Disclosure className="mt-2" />
        </details>
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
