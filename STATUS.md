# STATUS — 현재 작업 현황

이 파일은 "지금 상황"만 담는다. 아키텍처·커맨드·큐레이션 규칙은 `README.md`, Claude 작업 지침은 `CLAUDE.md` 참고.
**큰 작업을 끝낼 때마다 이 파일을 갱신할 것** (완료 항목은 "최근 작업"으로, 새 보류 항목은 "보류/검토 필요"로).

최종 갱신: 2026-09-30 (홍보 자동화 1단계)

## 최근 작업 (완료)

- **2026-09-30 홍보 자동화 1단계 — 쇼츠 렌더러 + 캡션 생성기 + UTM 추적** (README "6. 홍보 자동화")
  - `/dev/shorts?id=…&format=reveal` 9:16 녹화 화면(dev 전용) + `npm run render:shorts -- <id…>` → `out/shorts/{id}-reveal-YYYYMMDD.mp4`
    (1080×1920·30fps·H.264 + AAC 효과음). 가상 시계로 프레임 단위 캡처 → 프레임 드랍 없음, 스핀 실측 게임 2.25s vs 영상 2.23s
  - `npm run captions -- <id…>` → `content/queue/{id}-YYYYMMDD.json` (claude-opus-5-5, 규칙은 코드로 재검사), `npm run queue` 표
  - UTM: sessionStorage 저장 → `guesses`·`clicks` 에 `utm_source`·`utm_campaign`. 마이그레이션 `20260930000000_utm_tracking.sql`
    **Supabase에 적용 완료(2026-09-30)**. 로컬 한 판 플레이로 기록 확인 후 테스트 행 삭제
  - p007·p012 로 영상 2개·캡션 draft 2개 생성해 확인 (캡션 draft 는 커밋됨, 영상은 `out/` 이라 gitignore)
  - README 드럼 공개 타임라인 수치를 현재 순차 스핀 실측값으로 정정 (4자리 1.83s / 5자리 2.25s / 6자리 2.67s)
- **2026-09-30 hard 상품 강점 한 줄 + 별점 노출 (A안)** — commit `0b66c46`, `main`에 push 완료
  - CSV에 `selling_point`/`rating`/`review_count` 선택 컬럼 추가 (`scripts/build-products.ts` 검증: 가격 힌트 단어·1인칭 후기 표현 금지, rating·review_count는 둘 다 있거나 둘 다 없어야 함)
  - 문제 화면: `tier=hard` + `selling_point` 있는 상품만 "특징" 박스 자동 표시 (normal은 항상 숨김)
  - 공개 화면: rating 있으면 판정 공통으로 별점·리뷰 수 표시. MISS/HIT만 + selling_point 있을 때 "비싼 데는 이유가 있어요" 박스 + 보조 버튼 스타일 + 자동 넘김 2.5s→4s
  - `build:products`/`preflight` 통과, iPhone SE(375×667) 레이아웃 스크롤 없음 실측 확인
- 실제 상품 23개 등록 + 개인정보 처리방침 문의 이메일 채움 (`6fe353a`)
- 공개 스핀 연출 전면 재작업 — 슬롯머신 느낌, 자리별 순차 정지 (`f6e8498`, `7bdb071`, `ac13e01`)
- 대가성 문구 중복 정리 — 링크 있는 화면은 푸터 문구 숨김 (`22fdc79`)

## 진행 중 / 다음 할 일

- **`content/voice.md` 톤 가이드 직접 수정** (지금은 초안)
- `content/queue/p007-20260930.json`, `p012-20260930.json` draft 검토 → `approved` → 게시 후 `posted`
- 3주 차: SNS 자동 게시 (이번 단계에선 만들지 않음)

## 보류 / 검토 필요

- `app/privacy/page.tsx`: 문의 이메일은 채워졌으나 **사업자 정보**는 아직 직접 검토 필요 (README "5. 소개·개인정보 처리방침" 참고)
- 애드센스 미승인 상태 — `ADS_ENABLED` 기본 OFF, 승인 전 절대 켜지 말 것
- `selling_point`/`rating`/`review_count`: 기능은 배포됐지만 **실제 23개 상품에는 아직 값이 비어 있음** (큐레이션은 별도 작업, README 큐레이션 체크리스트 참고)

## 상품 풀 현황

- 총 23개, 전부 `active=true`
- `tier=hard` 6개 (`p018`~`p023`) — 보너스 라운드 조건(5개 이상) 충족
