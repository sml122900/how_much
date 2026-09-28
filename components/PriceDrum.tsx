"use client";

import { useEffect, useRef, useState } from "react";
import { play, startSpinEngine, tickSound, vibrate, type SpinEngineHandle } from "@/lib/sfx";

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

// 공개 정착("철컥" 잠금) 전용 스프링 — 오버슛이 작아서(0.2칸) 이 상수로도 100ms 안팎에 정착됨
const REVEAL_SPRING_K = 7500;
const REVEAL_SPRING_C = 123;
// 빨리감기 때는 더 빳빳하게 (탭→마지막 정지 300ms 예산 안에 들어와야 함)
const FF_SPRING_K = 40000;
const FF_SPRING_C = 280;

// ---------- 공개 타임라인 (ms). 한 자리씩 순차로: 윈드업 → 촤라락(풀스피드) → 감속 → 철컥 정착.
// 다음 자리는 이전 자리의 감속이 끝나 정착(펀치)이 시작되는 그 순간 바로 돌기 시작 — 죽은 시간 없이
// 정착 스프링(~100ms)과 겹친다. 마지막 자리만 감속 뒤에 애태우기가 더 붙는다. ----------
/** 레버를 당기는 느낌으로 살짝 역방향으로 당겼다 놓는 구간. 끝나자마자 곧바로 풀스피드로 전환 */
const WINDUP_MS = 50;
const WINDUP_PULLBACK_CELLS = 0.3;
/** 풀스피드 순항 속도 (완료조건: 45칸/초 이상) */
const FULL_SPEED_CPS = 46;
/** 촤라락 구간 지속시간 (스펙은 "약 280ms" — 5자리 기준 2.5초 예산에 맞추려 250ms로 소폭 조정) */
const CRUISE_MS = 250;
/** 감속 구간 지속시간 (스펙 "약 150ms" → 120ms로 소폭 조정, 이유는 위와 동일) */
const DECEL_MS = 120;
/** 감속 구간에서 다루는 칸 수 */
const DECEL_TAIL_CELLS = 8;
/** 철컥 잠금 전 살짝 지나치는 정도 */
const LOCK_OVERSHOOT_CELLS = 0.2;
const DECEL_EASE_POWER = 4;
/** 마지막 자리만: 마지막 3칸을 칸당 이 시간으로 기어가며 애태움 (스펙 "약 160ms" → 총 예산 때문에 140ms) */
const TEASE_CELLS = 3;
const TEASE_CELL_MS = 140;
/** 빨리감기: 탭 후 남은 자리들이 이 간격으로 순차 정지 */
const FF_STAGGER_MS = 45;

const mod10 = (x: number) => ((x % 10) + 10) % 10;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function valueToDigits(value: number): number[] {
  const n = Math.floor(value / 10);
  return Array.from({ length: COLS }, (_, i) => Math.floor(n / 10 ** (COLS - 1 - i)) % 10);
}

function digitsToValue(digits: number[]): number {
  return digits.reduce((acc, d) => acc * 10 + d, 0) * 10;
}

type Kind = "idle" | "drag" | "spring" | "windup" | "cruise" | "decel" | "tease";

type Col = {
  p: number; // 연속 위치 (정수 = 숫자 정렬). 표시 숫자 = mod10(round(p))
  v: number; // 스프링 단계 속도(칸/초)
  kind: Kind;
  target: number; // 목표 자리(정확한 숫자와 일치하는 셀)
  springK: number;
  springC: number;
  springActiveAt: number; // 이 시각 전에는 spring 적분을 시작하지 않음 (빨리감기 스태거용)
  digit: number;
  shown: number;
  revealing: boolean; // spring 정착 시 onLand를 불러야 하는 공개 연출 중인지
  landed: boolean; // 잠금 표시용
  pending: boolean; // 아직 자기 차례가 안 와서 "?"로 대기 중인지 (순차 스핀)
  speed: number; // 이번 프레임 순간 속도(칸/초) — 모션 블러 계산용
  // windup
  windupFrom: number;
  windupBaseP: number;
  // cruise
  cruiseFrom: number;
  cruiseDur: number;
  cruiseStartP: number;
  // decel (꼬리 감속, 오버슛 지점까지)
  decelFrom: number;
  decelDur: number;
  decelStartP: number;
  decelDistance: number;
  // tease (마지막 자리 전용, 3칸을 한 칸씩)
  teaseFrom: number;
  teaseStep: number;
  teaseStepFrom: number;
};

type Drag = { i: number; y0: number; p0: number; t0: number; moved: number; samples: { t: number; p: number }[] };

function newCol(): Col {
  return {
    p: 0,
    v: 0,
    kind: "idle",
    target: 0,
    springK: SPRING_K,
    springC: SPRING_C,
    springActiveAt: 0,
    digit: 0,
    shown: 0,
    revealing: false,
    landed: false,
    pending: false,
    speed: 0,
    windupFrom: 0,
    windupBaseP: 0,
    cruiseFrom: 0,
    cruiseDur: 0,
    cruiseStartP: 0,
    decelFrom: 0,
    decelDur: 0,
    decelStartP: 0,
    decelDistance: 0,
    teaseFrom: 0,
    teaseStep: 0,
    teaseStepFrom: 0,
  };
}

export function PriceDrum({
  mode,
  value,
  onChange,
  target,
  reducedMotion,
  onSpinEnd,
  gold = false,
  speedScale = 1,
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
  /** /dev/spin 확인용 재생 속도 (1 = 정상, 0.5 = 절반 속도...). 기본 1 */
  speedScale?: number;
}) {
  const [folded, setFolded] = useState(0);
  const [lockedCount, setLockedCount] = useState(0);
  /** cols.current[i].pending 변화를 화면에 반영하기 위한 강제 리렌더 트리거 (값 자체는 안 씀) */
  const [, setRenderTick] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [hint, setHint] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const chaseRef = useRef<HTMLDivElement>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const punches = useRef<(HTMLDivElement | null)[]>([]);
  const viewports = useRef<(HTMLDivElement | null)[]>([]);
  const cols = useRef<Col[]>(Array.from({ length: COLS }, newCol));
  const raf = useRef(0);
  const lastFrame = useRef(0);
  /** /dev/spin 배속 확인용 시뮬레이션 시계 — 실제 시간을 speedScale만큼 늘려서 모든 타이밍이 균일하게 느려지게 함 */
  const simClock = useRef(0);
  const speedScaleRef = useRef(speedScale);
  speedScaleRef.current = speedScale;
  const drag = useRef<Drag | null>(null);
  const emitted = useRef(value);
  const spinEngine = useRef<SpinEngineHandle | null>(null);
  const lastCol = useRef(COLS - 1);
  const fastForwarded = useRef(false);
  const firstEver = useRef(true);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;

  // ---------- 렌더 (transform + 속도 연동 모션 블러만) ----------

  function paint(i: number) {
    const c = cols.current[i];
    const el = strips.current[i];
    if (el) {
      const blur = clamp(c.speed / FULL_SPEED_CPS, 0, 1);
      const scaleY = 1 + blur * 0.15;
      el.style.transform = `translate3d(0, ${(VIEW_H - ROW_H) / 2 - (10 + mod10(c.p)) * ROW_H}px, 0) scaleY(${scaleY})`;
      el.style.filter = blur > 0.02 ? `blur(${(blur * 3).toFixed(2)}px)` : "";
    }
    const shown = Math.round(c.p);
    if (shown !== c.shown) {
      c.shown = shown;
      if (modeRef.current === "input") {
        tickSound();
        vibrate(8);
        emit();
      } else if (c.kind === "decel") {
        // 감속 구간 전체가 "마지막 몇 자리" — 느려질수록 틱 간격도 자연히 벌어진다
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

  // ---------- 물리/타임라인 루프 ----------

  function frame() {
    // rAF 콜백에 넘어오는 timestamp 인자는 환경에 따라 실제 벽시계와 어긋날 수 있어(예: 일부
    // 헤드리스/오프스크린 렌더링에서 명목상 고정 간격으로 찍혀 실제 경과 시간과 안 맞는 경우가
    // 있었다) 직접 performance.now()를 읽어 실제 경과 시간을 쓴다.
    // 스케줄용 시계는 짧은 프레임 드랍(수십ms) 정도는 클램프 없이 그대로 흘려보내
    // windup/cruise/decel/tease 타이밍이 늘어지지 않게 한다. 다만 탭 전환·백그라운드 등으로
    // rAF가 아주 오래 끊겼다 돌아온 경우(드묾)까지 그대로 반영하면 타임라인이 한 프레임에
    // 통째로 점프해버리니 100ms로는 여전히 상한을 둔다. 스프링 적분(세부 스텝)은 별도로 더 짧게 클램프.
    const wallNow = performance.now();
    const rawDt = Math.min(0.1, Math.max(0, (wallNow - lastFrame.current) / 1000));
    lastFrame.current = wallNow;
    simClock.current += rawDt * 1000 * speedScaleRef.current;
    const now = simClock.current;
    const dt = Math.min(0.032, rawDt) * speedScaleRef.current;
    let active = false;
    let totalSpeed = 0;
    let activeCols = 0;
    let pendingChanged = false;

    cols.current.forEach((c, i) => {
      // 순차 스핀: 대기(물음표) 중인 자리가 예정된 시각이 되면 이번 프레임에서 바로 윈드업 시작
      if (c.kind === "idle" && c.pending && now >= c.windupFrom) {
        c.kind = "windup";
        c.pending = false;
        pendingChanged = true;
      }
      switch (c.kind) {
        case "spring": {
          if (now < c.springActiveAt) {
            active = true;
            break;
          }
          for (let t = dt; t > 0; t -= 0.004) {
            const h = Math.min(t, 0.004);
            c.v += (-c.springK * (c.p - c.target) - c.springC * c.v) * h;
            c.p += c.v * h;
          }
          c.speed = Math.abs(c.v);
          if (Math.abs(c.p - c.target) < 0.001 && Math.abs(c.v) < 0.02) {
            c.p = c.target;
            c.v = 0;
            c.speed = 0;
            c.kind = "idle";
            paint(i);
            if (c.revealing) {
              c.revealing = false;
              onLand(i);
            }
          } else active = true;
          break;
        }
        case "windup": {
          active = true;
          const u = clamp((now - c.windupFrom) / WINDUP_MS, 0, 1);
          // 0→살짝 뒤로(사인 절반)→0 으로 복귀, 레버를 당겼다 놓는 느낌
          c.p = c.windupBaseP - WINDUP_PULLBACK_CELLS * Math.sin(Math.PI * u);
          c.speed = (WINDUP_PULLBACK_CELLS * Math.PI * Math.cos(Math.PI * u) * 1000) / WINDUP_MS;
          if (u >= 1) {
            c.p = c.windupBaseP;
            c.kind = "cruise";
          }
          break;
        }
        case "cruise": {
          active = true;
          totalSpeed += FULL_SPEED_CPS;
          activeCols++;
          const el = Math.min(now - c.cruiseFrom, c.cruiseDur) / 1000;
          c.p = c.cruiseStartP + FULL_SPEED_CPS * el;
          c.speed = FULL_SPEED_CPS;
          if (now - c.cruiseFrom >= c.cruiseDur) {
            c.kind = "decel";
            c.decelFrom = c.cruiseFrom + c.cruiseDur;
            c.decelStartP = c.p;
          }
          break;
        }
        case "decel": {
          active = true;
          const u = clamp((now - c.decelFrom) / c.decelDur, 0, 1);
          const eased = 1 - (1 - u) ** DECEL_EASE_POWER;
          c.p = c.decelStartP + c.decelDistance * eased;
          const inst = (c.decelDistance * DECEL_EASE_POWER * (1 - u) ** (DECEL_EASE_POWER - 1)) / (c.decelDur / 1000);
          c.speed = Math.max(0, inst);
          totalSpeed += c.speed;
          activeCols++;
          if (u >= 1) {
            if (i === lastCol.current) {
              c.kind = "tease";
              c.teaseFrom = now;
              c.teaseStep = 0;
              c.teaseStepFrom = now;
            } else {
              c.kind = "spring";
              c.springActiveAt = 0;
              c.springK = REVEAL_SPRING_K;
              c.springC = REVEAL_SPRING_C;
            }
          }
          break;
        }
        case "tease": {
          active = true;
          activeCols++;
          const stepU = clamp((now - c.teaseStepFrom) / TEASE_CELL_MS, 0, 1);
          const stepStart = c.target - TEASE_CELLS + c.teaseStep;
          // 마지막 칸만 살짝 지나쳐서(overshoot) 정착 스프링이 되튕길 여지를 남긴다
          const stepEnd = c.teaseStep === TEASE_CELLS - 1 ? c.target + LOCK_OVERSHOOT_CELLS : stepStart + 1;
          const eased = 1 - (1 - stepU) ** 2;
          c.p = stepStart + (stepEnd - stepStart) * eased;
          c.speed = (stepEnd - stepStart) / (TEASE_CELL_MS / 1000);
          totalSpeed += c.speed;
          if (stepU >= 1) {
            play("tick", { gain: 0.75, rate: 1 + c.teaseStep * 0.18 });
            vibrate(10);
            c.teaseStep++;
            c.teaseStepFrom = now;
            if (c.teaseStep >= TEASE_CELLS) {
              c.kind = "spring";
              c.springActiveAt = 0;
              c.springK = REVEAL_SPRING_K;
              c.springC = REVEAL_SPRING_C;
            }
          }
          break;
        }
      }
      paint(i);
    });

    spinEngine.current?.update(activeCols > 0 ? totalSpeed / activeCols : 0, activeCols);
    if (pendingChanged) setRenderTick((n) => n + 1);
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
    c.springActiveAt = 0;
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
    setLockedCount((n) => n + 1);
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
    vibrate(15);
    chaseRef.current?.animate([{ filter: "brightness(2.2)" }, { filter: "brightness(1)" }], {
      duration: 150,
      easing: "ease-out",
    });
    if (isLast) {
      play("boom", { rate: 0.55 });
      spinEngine.current?.stop();
      spinEngine.current = null;
      setSpinning(false);
      onSpinEndRef.current?.();
    }
  }

  /** 스핀 도중 탭 → 남은 자리 전부 짧게 순차 정지 (간격 60ms) */
  function fastForward() {
    if (fastForwarded.current) return;
    fastForwarded.current = true;
    const now = simClock.current;
    let k = 0;
    let any = false;
    cols.current.forEach((c, i) => {
      // 이미 잠긴(kind idle이면서 대기 중도 아닌) 자리만 건너뛴다 — 아직 제 차례가 안 와서
      // "?"로 대기 중인 자리도 빨리감기 대상이다
      if (i < folded || (c.kind === "idle" && !c.pending)) return;
      // 남은 자리는 오버슛 없이 목표 숫자로 바로(빳빳한 스프링으로) 정착 — 순서대로 스태거를 두고 시작
      const delay = k * FF_STAGGER_MS;
      k++;
      any = true;
      c.pending = false;
      c.kind = "spring";
      c.springActiveAt = now + delay;
      c.springK = FF_SPRING_K;
      c.springC = FF_SPRING_C;
      c.revealing = true;
    });
    if (any) setRenderTick((n) => n + 1);
    setHint(false);
    kick();
  }

  function startSpin(price: number) {
    const now = simClock.current;
    const digits = valueToDigits(price);
    const lead = Math.max(0, digits.findIndex((d) => d > 0));
    lastCol.current = COLS - 1;
    fastForwarded.current = false;
    setLockedCount(0);

    cols.current.forEach((c, i) => {
      c.p = Math.round(c.p);
      c.v = 0;
      c.kind = "idle";
      c.shown = c.p;
      c.digit = digits[i];
      c.speed = 0;
      c.landed = false;
      c.pending = i >= lead; // 자기 차례가 오기 전까지는 "?"로 대기
      paint(i);
    });
    setFolded(lead);
    flashRef.current?.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 150, easing: "ease-out" });
    play("lock");

    if (reducedMotion) {
      setTimeout(() => {
        cols.current.forEach((c, i) => {
          c.p = c.digit;
          c.shown = c.p;
          paint(i);
        });
        rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
        play("stop");
        onSpinEndRef.current?.();
      }, 150);
      return;
    }

    setSpinning(true);
    if (firstEver.current) {
      firstEver.current = false;
      setHint(true);
      setTimeout(() => setHint(false), 1500);
    }

    // 한 자리씩 순차로: 자리 j(0=가장 먼저 도는 자리)의 윈드업 시작 시각은 바로 앞 자리의
    // 윈드업+촤라락+감속이 끝나는(=정착이 시작되는) 바로 그 시점 — 정착 스프링(~100ms)과 자연히 겹친다
    const cruiseCells = (FULL_SPEED_CPS * CRUISE_MS) / 1000;
    const perColumnMs = WINDUP_MS + CRUISE_MS + DECEL_MS;
    cols.current.forEach((c, i) => {
      if (i < lead) return;
      const j = i - lead;
      const isLast = i === lastCol.current;
      const windupAt = now + j * perColumnMs;
      const startP = Math.round(c.p);

      c.kind = j === 0 ? "windup" : "idle";
      c.pending = j !== 0;
      c.windupFrom = windupAt;
      c.windupBaseP = startP;
      c.cruiseFrom = windupAt + WINDUP_MS;
      c.cruiseDur = CRUISE_MS;
      c.cruiseStartP = startP;
      c.decelDur = DECEL_MS;
      c.revealing = true;

      if (isLast) {
        // 마지막 자리: 감속은 애태우기 시작점(목표-3칸)까지만 — 여기서 이어받아 기어가므로 되돌아가는 점프가 없다
        const base = Math.ceil(startP + cruiseCells + DECEL_TAIL_CELLS - TEASE_CELLS);
        const finalPos = base + mod10(c.digit - base);
        c.target = finalPos;
        c.decelDistance = finalPos - TEASE_CELLS - startP - cruiseCells;
      } else {
        const base = Math.ceil(startP + cruiseCells + DECEL_TAIL_CELLS - LOCK_OVERSHOOT_CELLS);
        const finalPos = base + mod10(c.digit - base);
        c.target = finalPos;
        c.decelDistance = finalPos + LOCK_OVERSHOOT_CELLS - startP - cruiseCells;
      }
    });

    spinEngine.current = startSpinEngine();
    kick();
  }

  // ---------- 효과 ----------

  useEffect(() => {
    cols.current.forEach((_, i) => paint(i));
    return () => {
      cancelAnimationFrame(raf.current);
      spinEngine.current?.stop();
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
    // React Strict Mode(개발 모드)는 이 effect를 mount→cleanup→mount로 두 번 실행한다.
    // cleanup 없이 두면 첫 번째 startSpin이 만든 RAF 루프·스핀 엔진이 안 멈춘 채 두 번째
    // startSpin이 상태를 다시 초기화해버려 타이밍이 꼬인다 — 여기서 확실히 정리한다.
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      spinEngine.current?.stop();
      spinEngine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 스핀 중 화면 아무 곳이나 탭하면 빨리감기
  useEffect(() => {
    if (!spinning) return;
    const onTap = () => fastForward();
    window.addEventListener("pointerdown", onTap, { capture: true });
    return () => window.removeEventListener("pointerdown", onTap, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

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

  // ---------- 포인터 (입력 모드) ----------

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
    <div ref={rootRef} className="relative mx-auto select-none">
      {spinning && (
        <div ref={chaseRef} className={`chase-lights ${gold ? "chase-gold" : ""}`} aria-hidden>
          {Array.from({ length: 16 }, (_, k) => (
            <span
              key={k}
              style={{ animationDelay: `${(k / 16) * 0.8}s`, offsetDistance: `${(k / 16) * 100}%` } as React.CSSProperties}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-center">
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
                  className={`drum-view relative mx-0.5 overflow-hidden rounded-xl outline-none transition-shadow focus-visible:ring-2 ${
                    gold ? "bg-amber-100 focus-visible:ring-amber-500" : "bg-gray-100 focus-visible:ring-gray-900"
                  } ${interactive ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${
                    cols.current[i]?.kind === "idle" && !cols.current[i]?.pending && spinning && i >= folded
                      ? gold
                        ? "ring-2 ring-amber-400 brightness-105"
                        : "ring-2 ring-gray-900/70 brightness-105"
                      : ""
                  }`}
                  style={{ height: VIEW_H }}
                  onPointerDown={(e) => onPointerDown(e, i)}
                  onPointerMove={(e) => onPointerMove(e, i)}
                  onPointerUp={(e) => onPointerUp(e, i)}
                  onPointerCancel={(e) => onPointerUp(e, i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  <div className="drum-mask pointer-events-none absolute inset-0" />
                  <div
                    className={`payline pointer-events-none absolute inset-x-0 rounded-lg shadow-sm ${gold ? "bg-amber-50" : "bg-white"} ${spinning ? "payline-lit" : ""}`}
                    style={{ top: ROW_H, height: ROW_H }}
                  />
                  {spinning && cols.current[i]?.pending && i >= folded && (
                    <div
                      className={`pointer-events-none absolute inset-0 z-[4] flex items-center justify-center text-[32px] font-black opacity-30 ${gold ? "text-amber-700" : "text-gray-500"}`}
                      aria-hidden
                    >
                      ?
                    </div>
                  )}
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
      {hint && <p className="mt-1.5 text-center text-[11px] text-gray-400">탭하면 바로 공개</p>}
      {lockedCount > 0 && lockedCount < COLS - folded && (
        <p className="mt-1 text-center text-[11px] text-gray-400">{lockedCount}자리 확정</p>
      )}
    </div>
  );
}
