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

// 공개 정착 전용 스프링 — 입력 드럼과 같은 반작용(오버슛 후 되튕김)이지만 훨씬 빳빳하게 조여서
// "마지막 100ms" 안에 딱 멎게 한다 (입력용 상수 그대로 쓰면 자리당 ~500ms씩 걸려 전체 타임라인이 늘어짐)
const REVEAL_SPRING_K = 6000;
const REVEAL_SPRING_C = 110;

// 공개 타임라인 (ms). LOCK 후 모든 자리가 동시에 굴러가기 시작해서, 자리마다 다른
// 길이만큼 감속하다 멈춘다 — 먼저 멈추는 자리는 짧고 빠르게, 나중 자리일수록 오래 돈다.
// 정지 순서(j=0이 최상위 유효 자리)별 롤 지속시간. 제출 → 마지막 정지 ≤ LOCK + 마지막 값 + 스프링 정착
const LOCK_MS = 150;
const ROLL_DURATIONS = [250, 350, 450, 550, 650] as const;
/** ease-out 지수. 4 이상이면 "cubic 이상" 요구를 만족하면서 막판 감속이 뚜렷해짐 */
const ROLL_EASE_POWER = 4;
/** 자리별 롤 거리 = 지속시간에 비례 (짧은 자리도 최소 이 칸 수는 굴러가게) */
const ROLL_CELLS_PER_MS = 0.024;
const ROLL_CELLS_MIN = 5;
/** 목표 숫자까지 이 칸 수 이내로 들어오면: 블러 해제 + 틱 사운드 시작 (마지막 몇 숫자만 또렷하게) */
const TICK_TAIL_CELLS = 3;

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
  v: number; // 칸/초 (스프링 단계에서만 씀)
  kind: "idle" | "drag" | "spring" | "roll";
  target: number;
  /** "spring" 단계에서 쓸 강성·감쇠 — 입력 드럼 해제(SPRING_K/C)와 공개 정착(REVEAL_SPRING_K/C)이 다름 */
  springK: number;
  springC: number;
  digit: number;
  shown: number;
  blurred: boolean;
  /** roll 시작 시각(performance.now 기준) */
  rollFrom: number;
  /** 이 자리의 롤 지속시간(ms) */
  rollDur: number;
  /** 롤 시작 위치 */
  rollStartP: number;
  /** 롤이 끝나는 시점까지 이동할 총 거리 (목표를 살짝 지나친 오버슛 지점까지) */
  rollDistance: number;
  /** roll→spring 이 공개 연출의 일부라서 정착 시 onLand를 불러야 하는지 (입력 드럼 반작용과 구분) */
  revealing: boolean;
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
      springK: SPRING_K,
      springC: SPRING_C,
      digit: 0,
      shown: 0,
      blurred: false,
      rollFrom: 0,
      rollDur: 0,
      rollStartP: 0,
      rollDistance: 0,
      revealing: false,
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
      } else if ((c.kind === "roll" || (c.kind === "spring" && c.revealing)) && Math.abs(c.target - c.p) <= TICK_TAIL_CELLS) {
        // 공개 연출 막판 몇 자리: 속도가 느려질수록 틱 사이 간격도 자연히 벌어진다
        tickSound();
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
            c.v += (-c.springK * (c.p - c.target) - c.springC * c.v) * h;
            c.p += c.v * h;
          }
          if (Math.abs(c.p - c.target) < 0.002 && Math.abs(c.v) < 0.02) {
            c.p = c.target;
            c.v = 0;
            c.kind = "idle";
            paint(i);
            if (c.revealing) {
              c.revealing = false;
              onLand(i);
            }
          } else active = true;
          break;
        }
        case "roll": {
          active = true;
          if (now < c.rollFrom) break;
          const u = Math.min(1, (now - c.rollFrom) / c.rollDur);
          const eased = 1 - (1 - u) ** ROLL_EASE_POWER; // 초반은 빠르게, 막판은 눈에 띄게 감속
          c.p = c.rollStartP + c.rollDistance * eased;
          // 목표(오버슛 전 정확한 숫자)까지 몇 칸 안 남으면 블러를 걷어 숫자가 읽히게 한다
          if (c.blurred && Math.abs(c.target - c.p) <= TICK_TAIL_CELLS) {
            c.blurred = false;
            strips.current[i]?.classList.remove("drum-blur");
          }
          if (u >= 1) {
            // 오버슛 지점에 도착 — 입력 드럼과 같은 반작용(스프링)으로, 다만 훨씬 빳빳하게 정착
            c.kind = "spring";
            c.v = 0;
            c.springK = REVEAL_SPRING_K;
            c.springC = REVEAL_SPRING_C;
          }
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
    c.springK = SPRING_K;
    c.springC = SPRING_C;
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

    // 2. 모든 자리가 동시에 구르기 시작 → 3. 자리마다 다른 길이로 감속하며 왼쪽부터 정지
    cols.current.forEach((c, i) => {
      if (i < lead) return;
      const j = i - lead;
      const dur = ROLL_DURATIONS[Math.min(j, ROLL_DURATIONS.length - 1)];
      const cells = Math.max(ROLL_CELLS_MIN, Math.round(dur * ROLL_CELLS_PER_MS));
      const overshoot = 1 + (j % 2); // 1~2칸 오버슛, 자리마다 번갈아 살짝 다르게
      const startP = Math.round(c.p);
      const base = Math.ceil(startP + cells); // 최소 cells칸은 굴러가게
      const finalPos = base + mod10(c.digit - base); // 목표 숫자와 일치하는 첫 칸

      c.kind = "roll";
      c.blurred = true;
      c.revealing = true;
      c.rollFrom = now + LOCK_MS;
      c.rollDur = dur;
      c.rollStartP = startP;
      c.rollDistance = finalPos + overshoot - startP;
      c.target = finalPos;
      strips.current[i]?.classList.add("drum-blur");
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
