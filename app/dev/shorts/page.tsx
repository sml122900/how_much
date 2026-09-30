import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/config";
import { COPY } from "@/lib/copy";
import { getProduct } from "@/lib/products";
import { ShortsStage } from "./ShortsStage";

const SHORTS_FORMATS = ["reveal"] as const;

// 쇼츠 녹화용 9:16 프레임. 프로덕션 빌드에서는 404, `next dev`에서만 연다.
//   /dev/shorts?id=p007&format=reveal[&hook=...][&outro=...]
// scripts/render-shorts.ts 가 여기에 &capture=1 을 붙여 한 프레임씩 찍는다.
export default async function DevShortsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  // 쿼리에서 줄바꿈은 %0A 또는 문자 그대로의 "\n" 둘 다 받는다
  const text = (v: string | undefined) => v?.replace(/\\n/g, "\n").trim() || undefined;

  const id = one("id") ?? "";
  const format = one("format") ?? "reveal";
  const product = getProduct(id);
  const error = !product
    ? `상품 id "${id}" 가 data/products.json 에 없어요`
    : !(SHORTS_FORMATS as readonly string[]).includes(format)
      ? `format "${format}" 은 없어요 (가능: ${SHORTS_FORMATS.join(", ")})`
      : !SITE_URL
        ? "NEXT_PUBLIC_SITE_URL 이 비어 있어요 (마지막 카드에 사이트 주소가 들어가야 함)"
        : null;

  return (
    <ShortsStage
      product={error ? null : product!}
      error={error}
      hook={text(one("hook")) ?? COPY.shortsHook}
      outro={text(one("outro")) ?? COPY.shortsOutro}
      siteHost={SITE_URL ? new URL(SITE_URL).host : ""}
      capture={one("capture") === "1"}
    />
  );
}
