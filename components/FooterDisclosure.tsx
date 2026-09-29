"use client";

import { Disclosure } from "./Disclosure";
import { useFooterVisibility } from "./FooterVisibility";

/** 링크가 있는 화면(공개/결과)이 켠 HideFooterDisclosure 신호가 있으면 푸터의 고지 문구를 숨긴다 */
export function FooterDisclosure() {
  const { hideDisclosure } = useFooterVisibility();
  if (hideDisclosure) return null;
  return <Disclosure />;
}
