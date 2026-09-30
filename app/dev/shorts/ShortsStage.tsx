"use client";

// 쇼츠 녹화 프레임. 9:16, 540×960 CSS px — 렌더러는 deviceScaleFactor 2로 찍어 1080×1920이 된다.
// 구매 버튼·파트너스 링크·대가성 문구는 넣지 않는다 (영상에는 사이트 주소만).
//
// format=reveal: 인트로 1.5s → 3·2·1 카운트다운(각 0.7s) → 공개 스핀(게임과 같은 PriceDrum, 전부 0에서 시작)
// → 확정 후 1.5s 유지 → 마지막 카드 2s.
// 타이밍은 전부 performance.now()/requestAnimationFrame 기준이라 게임 코드를 그대로 쓴다. 렌더러는 여기에
// 가상 시계를 주입해 실시간과 같은 타임라인을 한 프레임씩 재현한다 (scripts/shorts/capture-runtime.js).
//
// 레이아웃은 쇼츠·릴스·틱톡 UI가 덮는 영역(위 ~8%, 아래 ~22%)을 피해 핵심 요소를 y 72~740 안에 둔다.

import { useEffect, useRef, useState } from "react";
import { PriceDrum, type DrumMode } from "@/components/PriceDrum";
import { ProductImage } from "@/components/ProductImage";
import { COPY } from "@/lib/copy";
import { formatCheckedDate } from "@/lib/game";
import { installAudioUnlock, play } from "@/lib/sfx";
import type { Product } from "@/lib/types";
import { useReducedMotion } from "@/lib/useReducedMotion";

const STAGE_W = 540;
const STAGE_H = 960;

const INTRO_MS = 1500;
const COUNT_FROM = 3;
const COUNT_STEP_MS = 700;
const SPIN_AT_MS = INTRO_MS + COUNT_FROM * COUNT_STEP_MS;
const HOLD_MS = 1500;
const OUTRO_MS = 2000;

type Phase = "ready" | "intro" | "countdown" | "spin" | "hold" | "outro" | "done";

/** 렌더러가 window.__shorts.state 로 읽는다. 시각은 start() 기준 ms */
type ShortsState = {
  ready: boolean;
  error: string | null;
  phase: Phase;
  spinStartMs: number | null;
  spinEndMs: number | null;
  /** 영상 전체 길이 — 스핀이 끝나야 정해진다 */
  durationMs: number | null;
};

declare global {
  interface Window {
    __shorts?: { state: ShortsState; start: () => void };
  }
}

export function ShortsStage({
  product,
  error,
  hook,
  outro,
  siteHost,
  capture,
}: {
  product: Product | null;
  error: string | null;
  hook: string;
  outro: string;
  siteHost: string;
  /** 렌더러가 찍는 중 — 미리보기용 재생 버튼을 숨긴다 */
  capture: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(COUNT_FROM);
  const [run, setRun] = useState(0);
  const [fit, setFit] = useState(1);
  const t0 = useRef(0);
  const spinEnd = useRef<number | null>(null);
  const state = useRef<ShortsState>({
    ready: false,
    error,
    phase: "ready",
    spinStartMs: null,
    spinEndMs: null,
    durationMs: null,
  });

  function start() {
    const s = state.current;
    if (!product || (s.phase !== "ready" && s.phase !== "done")) return;
    Object.assign(s, { phase: "intro", spinStartMs: null, spinEndMs: null, durationMs: null });
    t0.current = performance.now();
    spinEnd.current = null;
    setCount(COUNT_FROM);
    setPhase("intro");
    setRun((n) => n + 1);
  }

  useEffect(() => {
    window.__shorts = { state: state.current, start };
    state.current.ready = !!product;
    const unlock = installAudioUnlock();
    const onResize = () => setFit(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      unlock();
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 타임라인: 매 프레임 경과 시간으로 단계를 정한다 (setTimeout 체인이 아니라서 오차가 쌓이지 않음)
  useEffect(() => {
    if (run === 0) return;
    const s = state.current;
    let raf = 0;
    let lastCount = 0;
    const tick = () => {
      const t = performance.now() - t0.current;
      let next: Phase;
      if (t < INTRO_MS) next = "intro";
      else if (t < SPIN_AT_MS) {
        next = "countdown";
        const n = COUNT_FROM - Math.floor((t - INTRO_MS) / COUNT_STEP_MS);
        if (n !== lastCount) {
          lastCount = n;
          setCount(n);
          play("tick", { gain: 1, rate: n === 1 ? 1.35 : 1 });
        }
      } else if (spinEnd.current === null) {
        next = "spin";
        if (s.spinStartMs === null) s.spinStartMs = t;
      } else if (t < spinEnd.current + HOLD_MS) next = "hold";
      else if (t < spinEnd.current + HOLD_MS + OUTRO_MS) next = "outro";
      else next = "done";

      s.phase = next;
      setPhase(next);
      if (next === "done") s.durationMs = spinEnd.current! + HOLD_MS + OUTRO_MS;
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  const afterIntro = phase !== "ready" && phase !== "intro";
  const drumMode: DrumMode = phase === "ready" || phase === "intro" || phase === "countdown" ? "reveal" : "spin";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-neutral-800">
      <style>{STAGE_CSS}</style>
      <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${fit})`, flexShrink: 0 }}>
        {/* PriceDrum이 정지할 때 closest("main")을 흔든다 → 이 프레임만 흔들리게 main으로 둔다 */}
        <main className="relative h-full w-full overflow-hidden bg-white text-gray-900">
          {product ? (
            <>
              <p className="absolute inset-x-10 top-[78px] text-center text-[42px] font-black leading-tight tracking-tight">
                <span className="shorts-marker">{hook}</span>
              </p>

              <div
                className="shorts-move absolute left-1/2 -translate-x-1/2"
                style={afterIntro ? { top: 160, width: 290, height: 290 } : { top: 160, width: 400, height: 400 }}
              >
                <ProductImage src={product.image_url} alt={product.name} priority sizes="400px" />
                {phase === "countdown" && (
                  <div
                    key={count}
                    className="shorts-pop absolute inset-0 flex items-center justify-center rounded-2xl bg-black/25 text-[150px] font-black text-white tabular-nums [text-shadow:0_4px_24px_rgba(0,0,0,0.45)]"
                  >
                    {count}
                  </div>
                )}
              </div>

              <h1
                className="shorts-move absolute inset-x-10 truncate text-center text-[26px] font-bold leading-tight"
                style={{ top: afterIntro ? 464 : 578 }}
              >
                {product.name}
              </h1>

              <div
                className="shorts-drum absolute inset-x-0 top-[522px] transition-opacity duration-300"
                style={{ opacity: afterIntro ? 1 : 0 }}
              >
                <div style={{ transform: "scale(1.3)", transformOrigin: "top center" }}>
                  <PriceDrum
                    key={run}
                    mode={drumMode}
                    value={0}
                    target={product.price}
                    reducedMotion={reducedMotion}
                    onSpinEnd={() => {
                      spinEnd.current = performance.now() - t0.current;
                      state.current.spinEndMs = spinEnd.current;
                    }}
                  />
                </div>
              </div>

              {(phase === "outro" || phase === "done") && (
                <div className="shorts-fade absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 px-10 pb-24 text-white">
                  <p className="whitespace-pre-line text-center text-[40px] font-black leading-snug tracking-tight">
                    {outro}
                  </p>
                  <p className="mt-10 rounded-full bg-amber-400 px-7 py-3.5 text-[28px] font-black tracking-tight text-gray-900">
                    {siteHost}
                  </p>
                </div>
              )}

              <p className="absolute inset-x-0 bottom-[222px] z-20 text-center text-[15px] font-medium text-gray-400">
                {COPY.shortsPriceBasis(formatCheckedDate(product.price_checked_at))}
              </p>
            </>
          ) : (
            <p className="p-10 text-lg font-bold text-red-600">{error}</p>
          )}
        </main>
      </div>

      {!capture && product && (phase === "ready" || phase === "done") && (
        <button
          type="button"
          className="fixed left-4 top-4 z-[110] rounded-full bg-white px-5 py-2.5 text-sm font-bold text-gray-900 shadow-lg"
          onClick={start}
        >
          ▶ {phase === "done" ? "다시 재생" : "재생"}
        </button>
      )}
    </div>
  );
}

const STAGE_CSS = `
.shorts-marker {
  background: linear-gradient(transparent 58%, #fcd34d 58%, #fcd34d 92%, transparent 92%);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 4px;
}
.shorts-move {
  transition: top 320ms cubic-bezier(0.2, 0.8, 0.2, 1), width 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.shorts-pop {
  animation: shorts-pop 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
@keyframes shorts-pop {
  from { transform: scale(1.7); opacity: 0; }
  45% { opacity: 1; }
  to { transform: scale(1); opacity: 1; }
}
.shorts-fade {
  animation: shorts-fade 280ms ease-out both;
}
@keyframes shorts-fade {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
/* 게임 화면용 안내("탭하면 바로 공개", "N자리 확정")는 영상에선 뺀다 */
.shorts-drum p { display: none; }
`;
