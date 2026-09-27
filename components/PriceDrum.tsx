"use client";

import { useEffect, useRef, useState } from "react";
import { loop, play, tickSound, vibrate, type LoopHandle } from "@/lib/sfx";

export type DrumMode = "input" | "spin" | "reveal";

// 십만·만·천·백·십 5칸 + 고정 "0"
const COLS = 5;
const PLACE_LABELS = ["십만", "만", "천", "백", "십"];
const ROW_H = 44;
const VIEW_H = ROW_H * 3;
/** 0~9 스트립 반복 수. 가운데 벌을 기준으로 위아래가 항상 채워져 끊김 없이 순환 */
const REPEAT = 3;

// 입력: 스프링(살짝 오버슛) + 관성
const SPRING_K = 260;
const SPRING_C = 24;
const INERTIA_S = 0.12;
const MAX_FLING = 15;

// 공개 타임라인 (ms). 제출 → 마지막 정지 = LOCK + SPIN + (n−1)·GAP + LAND ≤ 1,490ms
const LOCK_MS = 150;
const SPIN_MS = 500;
const STOP_GAP_MS = 180;
const LAND_MS = 120;
const SPIN_SPEED = 30; // 칸/초

const mod10 = (x: number) => ((x % 10) + 10) % 10;

export function valueToDigits(value: number): number[] {
  const n = Math.floor(value / 10);
  return Array.from({ length: COLS }, (_, i) => Math.floor(n / 10 ** (COLS - 1 - i)) % 10);
}

function digitsToValue(digits: number[]): number {
  return digits.reduce((acc, d) => acc * 10 + d, 0) * 10;
}

type Col = {
  p: number; // 연속 위치 (정수 = 숫자 정렬). 표시 숫자 = mod10(round(p))
  v: number; // 칸/초
  kind: "idle" | "drag" | "spring" | "spin" | "land";
  target: number;
  spinFrom: number;
  landAt: number;
  landFrom: number;
  digit: number;
  shown: number;
  blurred: boolean;
};

type Drag = { i: number; y0: number; p0: number; t0: number; moved: number; samples: { t: number; p: number }[] };

export function PriceDrum({
  mode,
  value,
  onChange,
  target,
  reducedMotion,
  onSpinEnd,
  gold = false,
}: {
  mode: DrumMode;
  value: number;
  onChange?: (value: number) => void;
  /** 실제가. mode가 'spin'이 되면 이 값으로 스핀·정지 */
  target?: number;
  reducedMotion: boolean;
  onSpinEnd?: () => void;
  /** 보너스 라운드 강조색 (골드 계열) */
  gold?: boolean;
}) {
  const [folded, setFolded] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const punches = useRef<(HTMLDivElement | null)[]>([]);
  const viewports = useRef<(HTMLDivElement | null)[]>([]);
  const cols = useRef<Col[]>(
    Array.from({ length: COLS }, () => ({
      p: 0,
      v: 0,
      kind: "idle",
      target: 0,
      spinFrom: 0,
      landAt: 0,
      landFrom: 0,
      digit: 0,
      shown: 0,
      blurred: false,
    })),
  );
  const raf = useRef(0);
  const lastFrame = useRef(0);
  const drag = useRef<Drag | null>(null);
  const emitted = useRef(value);
  const spinLoop = useRef<LoopHandle | null>(null);
  const lastCol = useRef(COLS - 1);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;

  // ---------- 렌더 (transform만) ----------

  function paint(i: number) {
    const c = cols.current[i];
    const el = strips.current[i];
    if (el) el.style.transform = `translate3d(0, ${(VIEW_H - ROW_H) / 2 - (10 + mod10(c.p)) * ROW_H}px, 0)`;
    const shown = Math.round(c.p);
    if (shown !== c.shown) {
      c.shown = shown;
      if (modeRef.current === "input") {
        tickSound();
        vibrate(8);
        emit();
      }
    }
  }

  function emit() {
    const v = digitsToValue(cols.current.map((c) => mod10(Math.round(c.p))));
    if (v !== emitted.current) {
      emitted.current = v;
      onChangeRef.current?.(v);
    }
  }

  // ---------- 물리 루프 ----------

  function frame(now: number) {
    const dt = Math.min(0.032, (now - lastFrame.current) / 1000);
    lastFrame.current = now;
    let active = false;

    cols.current.forEach((c, i) => {
      switch (c.kind) {
        case "spring": {
          for (let t = dt; t > 0; t -= 0.004) {
            const h = Math.min(t, 0.004);
            c.v += (-SPRING_K * (c.p - c.target) - SPRING_C * c.v) * h;
            c.p += c.v * h;
          }
          if (Math.abs(c.p - c.target) < 0.002 && Math.abs(c.v) < 0.02) {
            c.p = c.target;
            c.v = 0;
            c.kind = "idle";
          } else active = true;
          break;
        }
        case "spin": {
          active = true;
          if (now < c.spinFrom) break;
          if (!c.blurred) {
            c.blurred = true;
            strips.current[i]?.classList.add("drum-blur");
          }
          c.p += SPIN_SPEED * dt;
          if (now >= c.landAt) {
            // 최소 1칸은 더 굴러서 목표 숫자에 착지
            const base = Math.ceil(c.p + 1);
            c.target = base + mod10(c.digit - base);
            c.landFrom = c.p;
            c.landAt = now;
            c.kind = "land";
          }
          break;
        }
        case "land": {
          const t = Math.min(1, (now - c.landAt) / LAND_MS);
          c.p = c.landFrom + (c.target - c.landFrom) * (1 - (1 - t) ** 3);
          if (t >= 1) {
            c.p = c.target;
            c.kind = "idle";
            paint(i);
            onLand(i);
          } else active = true;
          break;
        }
      }
      paint(i);
    });

    raf.current = active ? requestAnimationFrame(frame) : 0;
  }

  function kick() {
    if (raf.current) return;
    lastFrame.current = performance.now();
    raf.current = requestAnimationFrame(frame);
  }

  function springTo(i: number, targetPos: number, v = 0) {
    const c = cols.current[i];
    c.kind = "spring";
    c.target = targetPos;
    c.v = v;
    kick();
  }

  function step(i: number, delta: number) {
    if (modeRef.current !== "input") return;
    const c = cols.current[i];
    const from = c.kind === "spring" ? c.target : Math.round(c.p);
    springTo(i, from + delta);
  }

  // ---------- 정지 연출 ----------

  function onLand(i: number) {
    const isLast = i === lastCol.current;
    strips.current[i]?.classList.remove("drum-blur");
    punches.current[i]?.animate(
      [{ transform: `scale(${isLast ? 1.55 : 1.35})` }, { transform: "scale(1)" }],
      { duration: 120, easing: "ease-out" },
    );
    rootRef.current?.closest("main")?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(-2px)" },
        { transform: "translateX(1px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 80 },
    );
    play("stop", { gain: isLast ? 1 : 0.8 });
    if (isLast) {
      play("boom", { rate: 0.55 });
      spinLoop.current?.stop();
      spinLoop.current = null;
      onSpinEndRef.current?.();
    }
  }

  function startSpin(price: number) {
    const now = performance.now();
    const digits = valueToDigits(price);
    const lead = Math.max(0, digits.findIndex((d) => d > 0));
    lastCol.current = COLS - 1;

    // 1. 예상가로 고정 + 번쩍 + 잠금음. 앞자리 0 컬럼은 이때 접는다
    cols.current.forEach((c, i) => {
      c.p = Math.round(c.p);
      c.v = 0;
      c.kind = "idle";
      c.shown = c.p;
      c.digit = digits[i];
      paint(i);
    });
    setFolded(lead);
    flashRef.current?.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: LOCK_MS, easing: "ease-out" });
    play("lock");

    if (reducedMotion) {
      // 스핀·펀치·흔들림 없이 페이드 공개
      setTimeout(() => {
        cols.current.forEach((c, i) => {
          c.p = c.digit;
          c.shown = c.p;
          paint(i);
        });
        rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
        play("stop");
        onSpinEndRef.current?.();
      }, LOCK_MS);
      return;
    }

    // 2. 스핀 → 3. 왼쪽부터 180ms 간격으로 정지
    cols.current.forEach((c, i) => {
      if (i < lead) return;
      c.kind = "spin";
      c.blurred = false;
      c.spinFrom = now + LOCK_MS;
      c.landAt = now + LOCK_MS + SPIN_MS + (i - lead) * STOP_GAP_MS;
    });
    setTimeout(() => {
      if (modeRef.current === "spin") spinLoop.current = loop("spin", { gain: 0.7, rate: 1.4 });
    }, LOCK_MS);
    kick();
  }

  // ---------- 효과 ----------

  useEffect(() => {
    cols.current.forEach((_, i) => paint(i));
    return () => {
      cancelAnimationFrame(raf.current);
      spinLoop.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 바깥(직접 입력)에서 값이 바뀌면 드럼을 그 값으로 굴린다
  useEffect(() => {
    if (value === emitted.current || mode !== "input") return;
    emitted.current = value;
    const digits = valueToDigits(value);
    cols.current.forEach((c, i) => {
      const r = Math.round(c.p);
      springTo(i, r + ((digits[i] - mod10(r) + 15) % 10) - 5);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (mode === "spin" && target !== undefined) startSpin(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 휠: passive 리스너로는 스크롤을 막을 수 없어 직접 등록
  useEffect(() => {
    const cleanups = viewports.current.map((el, i) => {
      if (!el) return () => {};
      let acc = 0;
      const onWheel = (e: WheelEvent) => {
        if (modeRef.current !== "input") return;
        e.preventDefault();
        acc += e.deltaY;
        while (Math.abs(acc) >= 40) {
          step(i, Math.sign(acc));
          acc -= Math.sign(acc) * 40;
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    });
    return () => cleanups.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 포인터 ----------

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, i: number) {
    if (modeRef.current !== "input" || drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = cols.current[i];
    c.kind = "drag";
    c.v = 0;
    const t = performance.now();
    drag.current = { i, y0: e.clientY, p0: c.p, t0: t, moved: 0, samples: [{ t, p: c.p }] };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>, i: number) {
    const d = drag.current;
    if (!d || d.i !== i) return;
    const c = cols.current[i];
    c.p = d.p0 + (d.y0 - e.clientY) / ROW_H;
    d.moved = Math.max(d.moved, Math.abs(e.clientY - d.y0));
    const t = performance.now();
    d.samples.push({ t, p: c.p });
    while (d.samples.length > 2 && t - d.samples[0].t > 100) d.samples.shift();
    paint(i);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>, i: number) {
    const d = drag.current;
    if (!d || d.i !== i) return;
    drag.current = null;
    const c = cols.current[i];

    if (d.moved < 6 && performance.now() - d.t0 < 300) {
      // 탭: 위 칸이면 −1, 아래 칸이면 +1
      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
      const delta = y < ROW_H ? -1 : y > ROW_H * 2 ? 1 : 0;
      springTo(i, Math.round(c.p) + delta);
      return;
    }

    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    const v = dt > 0 ? (last.p - first.p) / dt : 0;
    const projected = Math.round(c.p + v * INERTIA_S);
    const targetPos = Math.max(c.p - MAX_FLING, Math.min(c.p + MAX_FLING, projected));
    springTo(i, Math.round(targetPos), v);
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === "ArrowUp") step(i, 1);
    else if (e.key === "ArrowDown") step(i, -1);
    else return;
    e.preventDefault();
  }

  const digitsNow = valueToDigits(value);
  const interactive = mode === "input";

  return (
    <div ref={rootRef} className="relative mx-auto flex select-none items-center justify-center">
      {Array.from({ length: COLS }, (_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={`transition-[width,opacity] duration-150 ease-out ${i < folded ? "overflow-hidden" : "overflow-visible"}`}
            style={{ width: i < folded ? 0 : 46, opacity: i < folded ? 0 : 1 }}
          >
            <div ref={(el) => void (punches.current[i] = el)} className="origin-center">
              <div
                ref={(el) => void (viewports.current[i] = el)}
                role="spinbutton"
                aria-label={`${PLACE_LABELS[i]} 자리`}
                aria-valuemin={0}
                aria-valuemax={9}
                aria-valuenow={digitsNow[i]}
                aria-disabled={!interactive}
                tabIndex={interactive && i >= folded ? 0 : -1}
                className={`drum-view relative mx-0.5 overflow-hidden rounded-xl outline-none focus-visible:ring-2 ${
                  gold ? "bg-amber-100 focus-visible:ring-amber-500" : "bg-gray-100 focus-visible:ring-gray-900"
                } ${interactive ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
                style={{ height: VIEW_H }}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={(e) => onPointerMove(e, i)}
                onPointerUp={(e) => onPointerUp(e, i)}
                onPointerCancel={(e) => onPointerUp(e, i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 rounded-lg shadow-sm ${gold ? "bg-amber-50" : "bg-white"}`}
                  style={{ top: ROW_H, height: ROW_H }}
                />
                <div ref={(el) => void (strips.current[i] = el)} className="relative will-change-transform">
                  {Array.from({ length: 10 * REPEAT }, (_, k) => (
                    <div
                      key={k}
                      className={`flex items-center justify-center text-[32px] font-black tabular-nums ${gold ? "text-amber-900" : "text-gray-900"}`}
                      style={{ height: ROW_H }}
                    >
                      {k % 10}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {i === 2 && (
            <span
              className={`w-2 self-end pb-11 text-2xl font-black transition-opacity duration-150 ${gold ? "text-amber-400" : "text-gray-400"}`}
              style={{ opacity: folded > 2 ? 0 : 1, width: folded > 2 ? 0 : undefined }}
            >
              ,
            </span>
          )}
        </div>
      ))}
      <div className={`relative mx-0.5 w-[46px] rounded-xl ${gold ? "bg-amber-100" : "bg-gray-100"}`} style={{ height: VIEW_H }} aria-hidden>
        <div
          className={`absolute inset-x-0 flex items-center justify-center rounded-lg text-[32px] font-black tabular-nums shadow-sm ${
            gold ? "bg-amber-50 text-amber-400" : "bg-white text-gray-400"
          }`}
          style={{ top: ROW_H, height: ROW_H }}
        >
          0
        </div>
      </div>
      <span className={`ml-1.5 text-2xl font-bold ${gold ? "text-amber-600" : "text-gray-500"}`}>원</span>
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl opacity-0 ${
          gold ? "bg-amber-300/50 ring-4 ring-amber-400" : "bg-amber-200/50 ring-4 ring-amber-300"
        }`}
        ref={flashRef}
      />
    </div>
  );
}
