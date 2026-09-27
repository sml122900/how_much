import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, APP_SUBCOPY, ROUND_SIZE, TOLERANCE_PCT } from "@/lib/config";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = {
  title: `${APP_NAME} 소개`,
  description: APP_SUBCOPY,
};

// 초안입니다. 실제 게재 전에 직접 검토해주세요 — README "5. 소개·개인정보 처리방침" 참고.
export default function AboutPage() {
  return (
    <article className="flex flex-1 flex-col gap-6 py-4 text-[15px] leading-relaxed text-gray-700">
      <h1 className="text-2xl font-black text-gray-900">{APP_NAME} 소개</h1>
      <p>
        {APP_NAME}은 상품 사진과 한 줄 설명만 보고 실제 가격을 맞혀보는 간단한 웹 게임입니다.
        정답을 맞히는 재미와 함께, 가끔은 생각보다 훨씬 싼 상품을 발견하는 즐거움을 드리는 것이 목표입니다.
      </p>

      <section>
        <h2 className="text-lg font-bold text-gray-900">어떻게 하나요</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>사진과 설명을 보고 숫자 드럼을 굴려 예상 가격을 맞춥니다.</li>
          <li>
            실제 가격과 {TOLERANCE_PCT}% 이내면 정답이고, 가까울수록 높은 점수를 받습니다. 예상이 실제 가격보다
            높았다면(즉, 상품이 생각보다 쌌다면) 구매 링크가 열립니다.
          </li>
          <li>한 판은 {ROUND_SIZE}문제이고, 연속 정답 스트릭에 따라 칭호와 보너스 라운드 같은 보상을 드립니다.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">가격 정보</h2>
        <p className="mt-2">
          공개되는 가격은 회원가입이나 특정 카드, 쿠폰 없이 누구나 로그인 없이 볼 수 있는 기본 판매가를
          기준으로 합니다. 다만 쇼핑몰 특성상 가격은 수시로 바뀔 수 있어, 화면에 표시되는 "가격 확인" 날짜
          기준의 정보이며 실제 결제 시점의 가격과 다를 수 있습니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">제휴 안내</h2>
        <p className="mt-2">{COPY.buy} 버튼과 일부 링크는 쿠팡 파트너스 활동을 통해 연결되며, 이를 통해 발생하는 수수료를 제공받습니다.</p>
      </section>

      <p className="text-sm text-gray-400">
        수집하는 정보에 대한 자세한 내용은{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보 처리방침
        </Link>
        을 확인해주세요.
      </p>
    </article>
  );
}
