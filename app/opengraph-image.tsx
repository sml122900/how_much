import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { APP_NAME, APP_SUBCOPY } from "@/lib/config";

export const alt = `${APP_NAME} — ${APP_SUBCOPY}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// 기본 폰트엔 한글이 없어 Pretendard를 동봉해 쓴다. 못 읽으면 한글 없이 렌더
async function loadFont(): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "assets/fonts/Pretendard-Black.otf"));
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const font = await loadFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          fontFamily: font ? "Pretendard" : "sans-serif",
        }}
      >
        <div style={{ fontSize: 140 }}>🎯</div>
        <div style={{ fontSize: 150, fontWeight: 900, color: "#111827", letterSpacing: -4 }}>
          {font ? APP_NAME : "NUNDAEJUNG"}
        </div>
        <div style={{ fontSize: 52, color: "#6b7280", marginTop: 12 }}>
          {font ? APP_SUBCOPY : "Guess the price"}
        </div>
        <div style={{ display: "flex", marginTop: 48, fontSize: 56 }}>🟩🟩🟥🟩🟩🟩🟥🟩🟩🟥</div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "Pretendard", data: font, weight: 900, style: "normal" }] : undefined,
    },
  );
}
