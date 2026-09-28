// Web Audio 효과음. 파일은 assets/sfx (Kenney CC0, 출처는 README).
// 첫 사용자 제스처에서 AudioContext를 만들고 unlock한다. 음소거면 소스를 아예 만들지 않는다.
import boom from "@/assets/sfx/boom.mp3";
import cheer from "@/assets/sfx/cheer.mp3";
import coin from "@/assets/sfx/coin.mp3";
import fanfare from "@/assets/sfx/fanfare.mp3";
import lock from "@/assets/sfx/lock.mp3";
import spin from "@/assets/sfx/spin.mp3";
import stop from "@/assets/sfx/stop.mp3";
import thud from "@/assets/sfx/thud.mp3";
import tick from "@/assets/sfx/tick.mp3";
import { STORAGE_KEYS } from "./config";

const SOURCES = { boom, cheer, coin, fanfare, lock, spin, stop, thud, tick };
export type SfxName = keyof typeof SOURCES;

type PlayOptions = { rate?: number; gain?: number; delay?: number };
export type LoopHandle = { stop: () => void };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
const loops = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>();
let muted = readMuted();
let lastTick = 0;

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEYS.muted) === "1";
  } catch {
    return false;
  }
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  for (const [name, url] of Object.entries(SOURCES) as [SfxName, string][]) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .then((buf) => buffers.set(name, buf))
      .catch(() => {});
  }
  return ctx;
}

function unlock() {
  const c = ensureContext();
  if (!c) return;
  if (c.state !== "running") c.resume().catch(() => {});
  // iOS: 제스처 안에서 무음 버퍼를 한 번 재생해야 풀린다
  const s = c.createBufferSource();
  s.buffer = c.createBuffer(1, 1, 22050);
  s.connect(c.destination);
  s.start(0);
}

/** 첫 제스처에서 unlock. 반환값은 리스너 해제 함수 */
export function installAudioUnlock(): () => void {
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const handler = () => {
    unlock();
    if (ctx?.state === "running") events.forEach((e) => window.removeEventListener(e, handler, true));
  };
  events.forEach((e) => window.addEventListener(e, handler, true));
  return () => events.forEach((e) => window.removeEventListener(e, handler, true));
}

function source(name: SfxName, { rate = 1, gain = 1 }: PlayOptions) {
  if (muted || !ctx || !master) return null;
  const buf = buffers.get(name);
  if (!buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  return { src, gain: g };
}

export function play(name: SfxName, opts: PlayOptions = {}) {
  const node = source(name, opts);
  node?.src.start(ctx!.currentTime + (opts.delay ?? 0));
}

/** 드럼 틱. 빠르게 굴려도 소리가 뭉개지지 않게 간격 제한. rate로 음높이 조절(애태우기 구간에서 점점 올림) */
export function tickSound(rate = 1) {
  const now = performance.now();
  if (now - lastTick < 28) return;
  lastTick = now;
  play("tick", { gain: 0.6, rate });
}

// ---------- 스핀 엔진: 합성 노이즈 루프, 속도에 실시간 연동 ----------
// assets/sfx 에 있는 루프 소스는 회전 속도에 맞춰 실시간으로 피치/볼륨을 바꾸기 어려워서(길이가 고정된
// 샘플이라 재생 위치별 음색이 다름), Web Audio로 화이트노이즈 + 대역통과 필터를 직접 만들어 쓴다.
// 필터 중심 주파수를 속도에 연동해 "빠를수록 쐐애액 하고 높아지는" 효과를 낸다.
export type SpinEngineHandle = {
  /** cellsPerSec: 지금 돌고 있는 자리들의 평균 속도. activeCols: 아직 안 멈춘 자리 수 */
  update: (cellsPerSec: number, activeCols: number) => void;
  stop: () => void;
};

function makeNoiseBuffer(c: AudioContext): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function startSpinEngine(): SpinEngineHandle {
  const c = ensureContext();
  if (!c || !master || muted) return { update: () => {}, stop: () => {} };

  const src = c.createBufferSource();
  src.buffer = makeNoiseBuffer(c);
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.value = 130;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();

  let stopped = false;
  return {
    update(cellsPerSec, activeCols) {
      if (stopped || !ctx) return;
      const speedNorm = Math.max(0, Math.min(1, cellsPerSec / 46));
      const t = ctx.currentTime;
      filter.frequency.setTargetAtTime(130 + speedNorm * 1100, t, 0.025);
      // 한 번에 한 자리씩만 도는 구조라 activeCols는 거의 항상 0~1 — 순수 speedNorm으로
      // "그 자리가 돌 때만 커졌다 꺼지는" 느낌을 낸다 (기존보다 체감 볼륨을 키움)
      const vol = activeCols > 0 ? 0.22 + speedNorm * 0.45 : 0;
      gain.gain.setTargetAtTime(vol, t, 0.05);
    },
    stop() {
      if (stopped || !ctx) return;
      stopped = true;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      src.stop(ctx.currentTime + 0.15);
    },
  };
}

export function loop(name: SfxName, opts: PlayOptions = {}): LoopHandle {
  const node = source(name, opts);
  if (!node) return { stop: () => {} };
  node.src.loop = true;
  node.src.start();
  loops.add(node);
  return {
    stop: () => {
      if (!loops.delete(node) || !ctx) return;
      node.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      node.src.stop(ctx.currentTime + 0.1);
    },
  };
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(STORAGE_KEYS.muted, m ? "1" : "0");
  } catch {
    // noop
  }
  if (master) master.gain.value = m ? 0 : 1;
  if (m) {
    for (const node of loops) node.src.stop();
    loops.clear();
  }
}

export function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // noop
  }
}
