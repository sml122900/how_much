"use client";

import { logEvent } from "@/lib/log";
import type { ClickSource } from "@/lib/types";

/** 외부 제휴 링크. 클릭은 로그만 남기고 점수·보상과는 무관 */
export function PartnerLink({
  href,
  productId,
  source,
  className,
  children,
  onClick,
}: {
  href: string;
  productId: string;
  source: ClickSource;
  className: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener"
      className={className}
      onClick={() => {
        onClick?.();
        logEvent({ type: "click", product_id: productId, source });
      }}
    >
      {children}
    </a>
  );
}
