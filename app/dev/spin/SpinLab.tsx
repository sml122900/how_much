"use client";

// 개발용 확인 페이지. 가격을 넣고 [스핀]으로 반복 재생하며 느낌을 확인한다.
// 판정·CTA·로그 없이 드럼 하나만 떼어서 본다.
import { useEffect, useState } from "react";
import { MuteToggle } from "@/components/MuteToggle";
import { PriceDrum, type DrumMode } from "@/components/PriceDrum";
import { MAX_PRICE, PRICE_UNIT } from "@/lib/config";
import { formatWon } from "@/lib/game";
import { installAudioUnlock } from "@/lib/sfx";
import { useReducedMotion } from "@/lib/useReducedMotion";

const PRESETS = [
  { label: "4자리", price: 9900 },
  { label: "5자리", price: 128900 },
  { label: "6자리(=5자리 상한)", price: 999990 },
];

export function SpinLab() {
  const reducedMotion = useReducedMotion();
  const [priceText, setPriceText] = useState("128900");
  const [mode, setMode] = useState<DrumMode>("input");
  const [gold, setGold] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [runId, setRunId] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [t0, setT0] = useState(0);

  useEffect(() => installAudioUnlock(), []);

  const price = Math.min(MAX_PRICE, Math.max(PRICE_UNIT, Math.floor(Number(priceText || 0) / PRICE_UNIT) * PRICE_UNIT));

  function spin() {
    // key를 바꿔 매번 새 PriceDrum 인스턴스로 시작 → mount 시점에 mode="spin"이라 바로 startSpin 실행됨
    setT0(performance.now());
    setMode("spin");
    setRunId((n) => n + 1);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 py-4">
      <div>
        <h1 className="text-xl font-black">/dev/spin</h1>
        <p className="text-sm text-gray-500">공개 스핀 연출만 따로 재생해보는 개발용 페이지. 프로덕션 빌드에는 없음.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-right tabular-nums"
          inputMode="numeric"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <span className="text-sm text-gray-500">→ {formatWon(price)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold"
            onClick={() => setPriceText(String(p.price))}
          >
            {p.label} · {formatWon(p.price)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={gold} onChange={(e) => setGold(e.target.checked)} />
          gold(보너스)
        </label>
        <div className="flex items-center gap-1">
          속도:
          {[1, 0.5, 0.25].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${speed === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {s}x
            </button>
          ))}
        </div>
        <MuteToggle />
      </div>

      <button type="button" className="h-12 rounded-2xl bg-gray-900 font-bold text-white" onClick={spin}>
        스핀 ({reducedMotion ? "reduced-motion" : "일반"})
      </button>

      {lastMs !== null && <p className="text-sm text-gray-500">제출 → 마지막 정지: {lastMs.toFixed(0)}ms</p>}

      <div className="flex justify-center py-6">
        <PriceDrum
          key={runId}
          mode={mode}
          value={price}
          target={price}
          reducedMotion={reducedMotion}
          gold={gold}
          speedScale={speed}
          onSpinEnd={() => setLastMs(performance.now() - t0)}
        />
      </div>
    </div>
  );
}
