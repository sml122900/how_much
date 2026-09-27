"use client";

/**
 * 광고 슬롯 뼈대 (애드센스 승인 대비). 기본은 항상 아무것도 렌더하지 않는다.
 *
 * 배치 금지: 문제 화면, 드럼, 공개 화면, 구매 CTA·회색 링크 근처, 보너스 라운드 진행 중.
 * 이 컴포넌트는 시작 화면 하단(start_bottom)과 결과 화면 하단(result_bottom)에서만 쓴다.
 */
import { useEffect, useState } from "react";
import { AD_SLOTS, ADS_ENABLED, ADSENSE_CLIENT } from "@/lib/config";
import { COPY } from "@/lib/copy";
import { isAdFree } from "@/lib/entitlements";

type Placement = keyof typeof AD_SLOTS;

function loadAdsenseScript() {
  if (document.querySelector("script[data-adsbygoogle]")) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  s.crossOrigin = "anonymous";
  s.dataset.adsbygoogle = "1";
  document.head.appendChild(s);
}

export function AdSlot({ placement }: { placement: Placement }) {
  const slot = AD_SLOTS[placement];
  const eligible = ADS_ENABLED && !!slot;
  // localStorage(광고 제거) 확인은 하이드레이션 이후에 — 기본값은 "숨김"이라 SSR과 어긋나지 않는다
  const [adFree, setAdFree] = useState(true);

  useEffect(() => {
    if (!eligible) return;
    setAdFree(isAdFree());
  }, [eligible]);

  useEffect(() => {
    if (!eligible || adFree) return;
    loadAdsenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // 광고 스크립트 로딩 실패는 무시 — 게임 동작에 영향 없음
    }
  }, [eligible, adFree]);

  if (!eligible || adFree) return null;

  return (
    <div>
      <p className="mb-1 text-center text-[10px] text-gray-300">{COPY.adLabel}</p>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
