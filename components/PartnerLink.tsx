"use client";

import { CTA_LABEL } from "@/lib/config";
import { logEvent } from "@/lib/log";

/** 외부 제휴 링크. 클릭은 로그만 남기고 점수와는 무관 */
export function PartnerLink({
  href,
  productId,
  source,
  className,
}: {
  href: string;
  productId: string;
  source: "reveal" | "result";
  className: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener"
      className={className}
      onClick={() => logEvent({ type: "click", product_id: productId, source })}
    >
      {CTA_LABEL}
    </a>
  );
}
