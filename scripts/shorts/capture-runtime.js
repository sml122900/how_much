// scripts/render-shorts.ts 가 Playwright addInitScript 로 /dev/shorts?capture=1 페이지에 주입한다.
// (tsx가 TS 함수를 변환하면 페이지 안에서 깨질 수 있어 일부러 순수 JS 파일로 둔다)
//
// 1) 가상 시계 — activate() 이후 performance.now / setTimeout / setInterval / requestAnimationFrame 을
//    가상 시간으로 바꾼다. step() 한 번에 60Hz 한 틱(1000/60ms)씩 진행 → 게임 코드(PriceDrum 물리·타임라인)가
//    60Hz 폰에서 도는 것과 똑같이 계산되고, 스크린샷이 아무리 느려도 프레임이 빠지거나 늘어지지 않는다.
//    CSS 애니메이션·트랜지션·Web Animations 는 전부 멈춰두고 매 틱 currentTime 을 가상 시각으로 맞춘다.
// 2) 오디오 — AudioContext 를 OfflineAudioContext 로 바꿔치기하고 currentTime 을 가상 시각으로 돌려준다.
//    lib/sfx.ts 가 평소처럼 play()/스핀 엔진을 스케줄하면 그대로 오프라인 그래프에 쌓이고, 마지막에
//    renderAudio() 로 한 번에 렌더한다 → 게임과 같은 Web Audio 코드·같은 타이밍의 효과음 트랙.
(() => {
  if (!/[?&]capture=1(&|$)/.test(location.search)) return;

  const SAMPLE_RATE = 48000;
  const MAX_AUDIO_SEC = 90;
  const PEAK_LIMIT = 10 ** (-1 / 20); // -1 dBFS

  const real = {
    now: performance.now.bind(performance),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
  };

  const s = {
    active: false,
    base: 0,
    ticks: 0,
    elapsed: 0,
    timers: new Map(), // id → { due, fn, args, interval }
    nextTimerId: 1e9, // 실제 타이머 id(작은 정수)와 겹치지 않게
    rafs: new Map(),
    nextRafId: 1e9,
    animStart: new WeakMap(),
    audio: null,
    decode: { started: 0, done: 0, failed: 0 },
    sources: [], // 재생이 예약된 오디오 소스 시각(초) — 리포트용
  };

  // ---------- 시계 ----------

  performance.now = () => (s.active ? s.base + s.elapsed : real.now());

  window.setTimeout = (fn, delay, ...args) => {
    if (!s.active) return real.setTimeout(fn, delay, ...args);
    const id = s.nextTimerId++;
    s.timers.set(id, { due: s.elapsed + Math.max(0, Number(delay) || 0), fn, args, interval: null });
    return id;
  };
  window.setInterval = (fn, delay, ...args) => {
    if (!s.active) return real.setInterval(fn, delay, ...args);
    const id = s.nextTimerId++;
    const interval = Math.max(1, Number(delay) || 0);
    s.timers.set(id, { due: s.elapsed + interval, fn, args, interval });
    return id;
  };
  window.clearTimeout = (id) => {
    if (!s.timers.delete(id)) real.clearTimeout(id);
  };
  window.clearInterval = (id) => {
    if (!s.timers.delete(id)) real.clearInterval(id);
  };
  window.requestAnimationFrame = (cb) => {
    if (!s.active) return real.raf(cb);
    const id = s.nextRafId++;
    s.rafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (!s.rafs.delete(id)) real.caf(id);
  };

  function runTimersUntil(target) {
    for (;;) {
      let nextId = null;
      let next = null;
      for (const [id, t] of s.timers) {
        if (t.due > target + 1e-6) continue;
        if (!next || t.due < next.due - 1e-6 || (Math.abs(t.due - next.due) <= 1e-6 && id < nextId)) {
          next = t;
          nextId = id;
        }
      }
      if (!next) return;
      s.elapsed = Math.max(s.elapsed, next.due);
      if (next.interval !== null) next.due += next.interval;
      else s.timers.delete(nextId);
      try {
        if (typeof next.fn === "function") next.fn(...next.args);
      } catch (e) {
        console.error(e);
      }
    }
  }

  function runFrame() {
    const cbs = [...s.rafs.values()];
    s.rafs.clear();
    const ts = s.base + s.elapsed;
    for (const cb of cbs) {
      try {
        cb(ts);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /** React(스케줄러는 MessageChannel)가 렌더·커밋·effect 까지 끝낼 때까지 실제 매크로태스크를 몇 번 흘려보낸다 */
  function macrotask() {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    });
  }
  async function flush() {
    for (let i = 0; i < 6; i++) await macrotask();
    await new Promise((resolve) => real.setTimeout(resolve, 0));
  }

  function syncAnimations() {
    for (const a of document.getAnimations()) {
      let start = s.animStart.get(a);
      if (start === undefined) {
        start = s.elapsed;
        s.animStart.set(a, start);
      }
      if (a.playState !== "paused") a.pause();
      a.currentTime = s.elapsed - start;
    }
  }

  // ---------- 오디오 ----------

  class CaptureAudioContext extends OfflineAudioContext {
    constructor() {
      super(2, SAMPLE_RATE * MAX_AUDIO_SEC, SAMPLE_RATE);
      s.audio = this;
    }
    get currentTime() {
      return s.active ? s.elapsed / 1000 : 0;
    }
    resume() {
      return Promise.resolve();
    }
    decodeAudioData(data, ...rest) {
      s.decode.started++;
      const p = super.decodeAudioData(data, ...rest);
      p.then(
        () => s.decode.done++,
        () => s.decode.failed++,
      );
      return p;
    }
    createBufferSource() {
      const src = super.createBufferSource();
      const start = src.start.bind(src);
      src.start = (when = 0, ...rest) => {
        if (s.active) s.sources.push(Math.round(when * 1000) / 1000);
        return start(when, ...rest);
      };
      return src;
    }
  }
  window.AudioContext = CaptureAudioContext;
  window.webkitAudioContext = CaptureAudioContext;

  function wavBase64(buffer, frames) {
    const ch = Math.min(2, buffer.numberOfChannels);
    const data = [buffer.getChannelData(0), buffer.getChannelData(ch - 1)];
    const bytes = new Uint8Array(44 + frames * 4);
    const view = new DataView(bytes.buffer);
    const str = (o, t) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF");
    view.setUint32(4, 36 + frames * 4, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 2, true); // stereo
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, frames * 4, true);
    // 효과음이 겹치는 순간(마지막 정지 + boom) 합이 1.0을 넘어 클리핑되므로, 넘으면 트랙 전체를
    // 같은 비율로 낮춰 피크를 -1 dBFS에 맞춘다 (선형 게인이라 소리 모양·타이밍은 그대로)
    let peak = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(data[c][i]));
    const gain = peak > PEAK_LIMIT ? PEAK_LIMIT / peak : 1;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < 2; c++) {
        view.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, data[c][i] * gain)) * 0x7fff, true);
      }
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin), peak, gain };
  }

  // ---------- 렌더러용 API ----------

  window.__cap = {
    decode: s.decode,
    activate() {
      // 정수 기준점: (base + 1500) - base 가 정확히 1500이 되도록 (단계 경계에서 부동소수 오차 방지)
      s.base = Math.ceil(real.now());
      s.ticks = 0;
      s.elapsed = 0;
      s.active = true;
    },
    now() {
      return s.elapsed;
    },
    /** 60Hz 틱 n번 진행. 매 틱: 타이머 → rAF → React flush → 애니메이션 시각 맞춤 */
    async step(n) {
      for (let i = 0; i < n; i++) {
        s.ticks++;
        const target = (s.ticks * 1000) / 60;
        runTimersUntil(target);
        s.elapsed = target;
        runFrame();
        await flush();
        syncAnimations();
      }
    },
    async settle() {
      await flush();
      syncAnimations();
    },
    async renderAudio(durationMs) {
      if (!s.audio) return null;
      const frames = Math.min(SAMPLE_RATE * MAX_AUDIO_SEC, Math.round((durationMs / 1000) * SAMPLE_RATE));
      const buffer = await s.audio.startRendering();
      return { ...wavBase64(buffer, frames), sources: s.sources };
    },
  };
})();
