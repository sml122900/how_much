"use client";

import { useEffect } from "react";
import { captureUtm } from "@/lib/utm";

/** 첫 방문 URL의 utm_* 를 sessionStorage 에 저장한다 (lib/utm.ts). 아무것도 그리지 않는다 */
export function UtmCapture() {
  useEffect(() => captureUtm(window.location.search), []);
  return null;
}
