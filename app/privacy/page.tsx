import type { Metadata } from "next";
import { ADS_ENABLED, APP_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: `${APP_NAME} 개인정보 처리방침`,
};

// 초안입니다. 실제 게재 전에 직접 검토해주세요 (특히 문의처, 사업자 정보) —
// README "5. 소개·개인정보 처리방침" 참고.
export default function PrivacyPage() {
  return (
    <article className="flex flex-1 flex-col gap-6 py-4 text-[15px] leading-relaxed text-gray-700">
      <h1 className="text-2xl font-black text-gray-900">개인정보 처리방침</h1>
      <p className="text-sm text-gray-400">시행일: 2026년 9월 28일</p>

      <section>
        <h2 className="text-lg font-bold text-gray-900">1. 수집하는 정보</h2>
        <p className="mt-2">
          {APP_NAME}은 회원가입이나 로그인을 요구하지 않습니다. 서비스 이용 과정에서 다음 정보를 수집합니다.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>익명 세션 식별자(session_id): 브라우저에 무작위로 생성되어 저장되는 값으로, 특정 개인을 식별하지 않습니다.</li>
          <li>제출한 예상 가격, 정답 여부, 오차율: 게임 진행과 통계 집계를 위해 저장합니다.</li>
          <li>구매 링크 클릭 여부와 위치(클릭 로그): 어떤 화면의 링크가 클릭되었는지만 기록하며, 클릭 후 쇼핑몰에서의 행동은 수집하지 않습니다.</li>
          <li>브라우저 localStorage: 세션 식별자, 최고 연속 기록, 최근 출제된 상품 목록, 음소거 설정 등 게임 진행에 필요한 값을 기기에만 저장합니다.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">2. 이용 목적</h2>
        <p className="mt-2">
          게임 진행(점수·스트릭 계산), 서비스 품질 개선을 위한 통계 분석, 부정확한 상품 데이터 발견을 위한
          용도로만 사용합니다. 수집한 정보를 광고 목적으로 제3자에게 판매하지 않습니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">3. 보관 및 처리</h2>
        <p className="mt-2">
          이벤트 로그는 Supabase(데이터베이스 인프라)에 저장되며, 서버에서만 접근할 수 있도록 접근 제어가
          되어 있습니다. localStorage에 저장된 값은 이용자의 기기에만 남고, 다른 이용자나 저희 서버로 자동
          전송되지 않습니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">4. 쿠키·광고</h2>
        {ADS_ENABLED ? (
          <p className="mt-2">이 서비스는 현재 광고를 게재하고 있습니다.</p>
        ) : (
          <p className="mt-2">
            이 서비스는 현재 광고를 게재하지 않습니다. 아래 조항은 향후 광고가 도입될 경우를 대비해 미리
            안내드리는 내용입니다.
          </p>
        )}
        <p className="mt-2">
          광고가 게재되는 경우, Google AdSense 등 제3자 광고 서비스가 쿠키를 사용해 이용자의 이전 방문
          기록을 바탕으로 광고를 게재할 수 있습니다. 이용자는 Google 광고 설정(adssettings.google.com)에서
          맞춤 광고를 원치 않으면 비활성화할 수 있습니다. 연속 정답 등 게임 내 보상으로 광고가 일정 시간
          제거될 수 있으나, 이는 광고 노출 여부에만 영향을 주며 수집하는 정보의 종류를 바꾸지 않습니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">5. 아동의 개인정보</h2>
        <p className="mt-2">
          이 서비스는 회원가입이나 개인 식별 정보 입력을 받지 않으며, 만 14세 미만 아동을 포함해 누구의
          개인정보도 의도적으로 수집하지 않습니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900">6. 문의</h2>
        <p className="mt-2">개인정보 처리방침에 대한 문의는 [문의 이메일 주소를 여기에 적어주세요]로 연락해주세요.</p>
      </section>
    </article>
  );
}
