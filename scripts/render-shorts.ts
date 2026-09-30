/**
 * /dev/shorts 를 헤드리스 Chromium으로 한 프레임씩 찍어 쇼츠 mp4를 만든다.
 *
 *   npm run dev                                   # 먼저 다른 터미널에서 (/dev/shorts 는 dev 서버에서만 열림)
 *   npm run render:shorts -- p007                 # → out/shorts/p007-reveal-YYYYMMDD.mp4
 *   npm run render:shorts -- p007 p012 p019
 *   npm run render:shorts -- p007 --hook "이거 얼마?" --outro "맞혀보세요"   # 이번 실행 전체에 적용
 *
 * 출력: 1080×1920, 30fps, H.264(yuv420p, BT.709) + AAC 48kHz 스테레오 효과음.
 * dev 서버 주소는 SHORTS_BASE_URL (기본 http://localhost:3000). 처음 한 번: npx playwright install chromium --only-shell
 *
 * 방식: scripts/shorts/capture-runtime.js 가 페이지의 시계(performance.now·타이머·rAF·CSS/Web 애니메이션)를
 * 가상 시간으로 바꾼다. "60Hz 틱 2번 진행 → 스크린샷 1장"을 반복하므로 캡처가 아무리 느려도 영상 속 스핀은
 * 60Hz 폰에서 도는 게임과 같은 타이밍이고 프레임이 빠지지 않는다. 효과음은 lib/sfx.ts 가 같은 가상 시각에
 * OfflineAudioContext 로 예약한 것을 그대로 렌더해 WAV로 받고, ffmpeg로 영상과 합친다.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { chromium, type Browser, type Page } from "playwright";
import { getProduct } from "../lib/products";
import { fail, loadEnvLocal, localYmd, parseArgs, staleWarning } from "./lib/promo";

loadEnvLocal();

const FPS = 30;
/** 영상 1프레임 = 60Hz 틱 2번 (게임이 60Hz 화면에서 도는 것과 같은 물리 스텝) */
const TICKS_PER_FRAME = 2;
const STAGE = { width: 540, height: 960, deviceScaleFactor: 2 }; // → 1080×1920
const MAX_SECONDS = 60;
const RUNTIME = resolve("scripts/shorts/capture-runtime.js");
const OUT_DIR = resolve("out/shorts");

type ShortsState = {
  ready: boolean;
  error: string | null;
  phase: string;
  spinStartMs: number | null;
  spinEndMs: number | null;
  durationMs: number | null;
};
type AudioResult = { base64: string; peak: number; gain: number; sources: number[] };

const { ids, opts } = parseArgs(process.argv.slice(2), ["hook", "outro", "format"]);
const format = typeof opts.format === "string" ? opts.format : "reveal";
const base = (process.env.SHORTS_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (ids.length === 0) fail("상품 id를 적어주세요. 예: npm run render:shorts -- p007 p012");
if (!ffmpegPath) fail("ffmpeg-static 바이너리를 찾지 못했어요 (npm install 을 다시 해보세요)");
const FFMPEG = ffmpegPath;

function run(args: string[]): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? ok(err) : ko(new Error(`ffmpeg 실패 (${code}):\n${err.slice(-2000)}`))));
  });
}

async function checkServer() {
  try {
    const res = await fetch(`${base}/dev/shorts`, { signal: AbortSignal.timeout(120_000) });
    if (res.status === 404) fail(`${base} 는 /dev/shorts 가 404예요 — 프로덕션 서버 말고 \`npm run dev\` 서버여야 해요`);
    if (!res.ok) fail(`${base}/dev/shorts 응답 ${res.status}`);
  } catch (e) {
    fail(`${base} 에 연결하지 못했어요 — 다른 터미널에서 \`npm run dev\` 를 먼저 실행하세요 (다른 포트면 SHORTS_BASE_URL). ${(e as Error).message}`);
  }
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    try {
      return await chromium.launch({ channel: "chrome" }); // 설치된 Chrome으로 대체
    } catch {
      fail("Chromium을 찾지 못했어요. 한 번만 실행: npx playwright install chromium --only-shell");
    }
  }
}

/** lib/sfx.ts 가 mp3 9개를 fetch→decode 하는 걸 기다린다 (개수를 몰라도 되게 "변화 없이 잠잠해질 때까지") */
async function waitForSfx(page: Page) {
  let last = "";
  let stableSince = Date.now();
  const deadline = Date.now() + 30_000;
  for (;;) {
    const d = (await page.evaluate("({ ...window.__cap.decode })")) as { started: number; done: number; failed: number };
    if (d.failed > 0) throw new Error(`효과음 ${d.failed}개 디코딩 실패`);
    const key = JSON.stringify(d);
    if (key !== last) {
      last = key;
      stableSince = Date.now();
    } else if (d.started > 0 && d.done === d.started && Date.now() - stableSince > 800) return d.done;
    if (Date.now() > deadline) throw new Error(`효과음 로딩 시간 초과 (${key})`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function probe(file: string) {
  const log = await run(["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const pick = (re: RegExp) => re.exec(log)?.[1];
  const frames = [...log.matchAll(/frame=\s*(\d+)/g)].pop()?.[1];
  return {
    duration: pick(/Duration: ([\d:.]+)/),
    video: pick(/Video: ([^\n]+)/)?.trim(),
    audio: pick(/Audio: ([^\n]+)/)?.trim(),
    frames: frames ? Number(frames) : null,
    meanDb: pick(/mean_volume: ([-\d.]+) dB/),
    maxDb: pick(/max_volume: ([-\d.]+) dB/),
  };
}

async function renderOne(browser: Browser, id: string) {
  const product = getProduct(id);
  if (!product) throw new Error(`상품 id "${id}" 가 data/products.json 에 없어요`);
  const stale = staleWarning(product);
  if (stale) console.warn(`⚠ ${stale}`);

  const outFile = resolve(OUT_DIR, `${id}-${format}-${localYmd()}.mp4`);
  const tmpVideo = outFile.replace(/\.mp4$/, ".video.tmp.mp4");
  const tmpAudio = outFile.replace(/\.mp4$/, ".audio.tmp.wav");

  const url = new URL(`${base}/dev/shorts`);
  url.searchParams.set("id", id);
  url.searchParams.set("format", format);
  if (typeof opts.hook === "string") url.searchParams.set("hook", opts.hook);
  if (typeof opts.outro === "string") url.searchParams.set("outro", opts.outro);
  url.searchParams.set("capture", "1");

  const context = await browser.newContext({
    viewport: { width: STAGE.width, height: STAGE.height },
    deviceScaleFactor: STAGE.deviceScaleFactor,
    reducedMotion: "no-preference",
    locale: "ko-KR",
  });
  try {
    await context.addInitScript({ path: RUNTIME });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`  [page] ${e.message}`));
    page.on("console", (m) => m.type() === "error" && console.error(`  [page] ${m.text()}`));

    await page.goto(url.href, { waitUntil: "load", timeout: 120_000 });
    // Next dev 인디케이터(좌하단 N 배지) 숨김
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForFunction("window.__shorts && (window.__shorts.state.ready || window.__shorts.state.error)", null, {
      timeout: 60_000,
    });
    const pageError = await page.evaluate("window.__shorts.state.error");
    if (pageError) throw new Error(String(pageError));
    await page.evaluate("document.fonts.ready.then(() => true)");
    await page.waitForFunction("[...document.images].every((i) => i.complete)", null, { timeout: 30_000 });
    if (await page.evaluate("[...document.images].some((i) => !i.naturalWidth)")) {
      throw new Error("상품 이미지를 불러오지 못했어요 (image_url 확인)");
    }
    // 첫 사용자 제스처를 흉내 내 lib/sfx 가 (가짜) AudioContext를 만들고 효과음을 디코딩하게 한다
    await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown'))");
    const sfxCount = await waitForSfx(page);

    await page.evaluate("window.__cap.activate()");
    await page.evaluate("window.__shorts.start()");
    await page.evaluate("window.__cap.settle()");

    mkdirSync(OUT_DIR, { recursive: true });
    const ff = spawn(
      FFMPEG,
      [
        ...["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "pipe:0"],
        ...["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"],
        ...["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-r", String(FPS)],
        ...["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"],
        tmpVideo,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let ffErr = "";
    ff.stderr.on("data", (d) => (ffErr += d));
    const ffClosed = once(ff, "close");

    let frames = 0;
    let state: ShortsState;
    const t0 = Date.now();
    for (;;) {
      if (frames > 0) await page.evaluate(`window.__cap.step(${TICKS_PER_FRAME})`);
      const png = await page.screenshot({ type: "png" });
      if (!ff.stdin.write(png)) await once(ff.stdin, "drain");
      frames++;
      state = (await page.evaluate("window.__shorts.state")) as ShortsState;
      if (state.durationMs !== null && (frames * 1000) / FPS >= state.durationMs) break;
      if (frames > FPS * MAX_SECONDS) throw new Error(`${MAX_SECONDS}초를 넘었어요 — 스핀이 끝나지 않은 것 같아요`);
      if (frames % FPS === 0) process.stdout.write(`\r  ${id}: ${frames / FPS}초 분량 캡처 (${state.phase})   `);
    }
    process.stdout.write("\r");
    ff.stdin.end();
    const [code] = await ffClosed;
    if (code !== 0) throw new Error(`ffmpeg(영상) 실패:\n${ffErr}`);

    const videoMs = (frames * 1000) / FPS;
    const audio = (await page.evaluate(`window.__cap.renderAudio(${videoMs})`)) as AudioResult | null;
    if (!audio) throw new Error("효과음 트랙을 만들지 못했어요 (AudioContext 없음)");
    writeFileSync(tmpAudio, Buffer.from(audio.base64, "base64"));
    await run([
      ...["-y", "-loglevel", "error", "-i", tmpVideo, "-i", tmpAudio, "-map", "0:v:0", "-map", "1:a:0"],
      ...["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outFile],
    ]);

    const info = await probe(outFile);
    const sec = (ms: number | null) => (ms === null ? "?" : (ms / 1000).toFixed(3));
    const db = (x: number) => (20 * Math.log10(x || 1e-9)).toFixed(1);
    console.log(`✔ ${relative(process.cwd(), outFile)}  (캡처 ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
    console.log(`   영상  ${info.video}`);
    console.log(`   소리  ${info.audio}`);
    console.log(`   길이  ${info.duration} · ${info.frames}프레임 (캡처 ${frames}프레임)`);
    console.log(
      `   스핀  ${sec(state.spinStartMs)}s 시작 → ${sec(state.spinEndMs)}s 마지막 정지 ` +
        `(${sec(state.spinEndMs! - state.spinStartMs!)}s, 60Hz 기준 게임과 동일 타임라인)`,
    );
    console.log(
      `   효과음 파일 ${sfxCount}개 로드 · 재생 이벤트 ${audio.sources.length}개 · ` +
        `원본 피크 ${db(audio.peak)} dBFS → ${db(audio.gain)} dB 정규화 · 결과 평균 ${info.meanDb} dB / 최대 ${info.maxDb} dB`,
    );
    return outFile;
  } finally {
    await context.close();
    rmSync(tmpVideo, { force: true });
    rmSync(tmpAudio, { force: true });
  }
}

async function main() {
  for (const id of ids) if (!getProduct(id)) fail(`상품 id "${id}" 가 data/products.json 에 없어요`);
  await checkServer();
  const browser = await launch();
  let failed = 0;
  try {
    for (const id of ids) {
      try {
        await renderOne(browser, id);
      } catch (e) {
        failed++;
        console.error(`✖ ${id}: ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exit(1);
}

main();
