"use client";

// 구매 링크가 있는 화면(공개 화면, 결과 화면)은 그 화면 자체에 고지 문구를 두므로
// 푸터의 고지 문구는 중복이라 숨긴다. 서비스 소개/개인정보 처리방침 링크는 항상 그대로 둔다.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { hideDisclosure: boolean; setHideDisclosure: (v: boolean) => void };
const FooterVisibilityContext = createContext<Ctx | null>(null);

export function FooterVisibilityProvider({ children }: { children: ReactNode }) {
  const [hideDisclosure, setHideDisclosure] = useState(false);
  return (
    <FooterVisibilityContext.Provider value={{ hideDisclosure, setHideDisclosure }}>
      {children}
    </FooterVisibilityContext.Provider>
  );
}

export function useFooterVisibility(): Ctx {
  const ctx = useContext(FooterVisibilityContext);
  if (!ctx) throw new Error("useFooterVisibility는 FooterVisibilityProvider 안에서만 쓸 수 있다");
  return ctx;
}

/**
 * 이 컴포넌트가 마운트돼 있는 동안 푸터의 고지 문구를 숨기고, 언마운트되면 자동으로 되돌린다.
 * 화면 자체에 고지 문구(<Disclosure/>)를 이미 두고 있는 화면(공개 화면 Verdict, 결과 화면)에서
 * 렌더한다. 아무것도 그리지 않는다.
 */
export function HideFooterDisclosure() {
  const { setHideDisclosure } = useFooterVisibility();
  useEffect(() => {
    setHideDisclosure(true);
    return () => setHideDisclosure(false);
  }, [setHideDisclosure]);
  return null;
}
