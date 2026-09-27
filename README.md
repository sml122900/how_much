# 눈대중 — 가격 맞히기

상품 사진과 한 줄 설명을 보고 가격을 맞히는 10문제 게임. Next.js 15 (App Router) + TypeScript + Tailwind v4.

```bash
npm install
npm run build:products   # data/products.csv → data/products.json
npm run dev              # http://localhost:3000
```

게임 규칙 상수(허용 오차, 문제 수, 자동 넘김 시간 등)는 전부 `lib/config.ts` 에 있다.

## 1. 상품 CSV 채우기

`data/products.csv` 를 편집한 뒤 `npm run build:products` 로 검증하고 `data/products.json` 을 만든다.
**JSON은 직접 고치지 말고 항상 CSV → 스크립트로 생성**한다. (JSON은 커밋해야 배포에 반영된다)

| 컬럼 | 규칙 |
| --- | --- |
| `id` | `p001` 형식, 중복 불가 |
| `name` | 상품명 |
| `description` | 한 줄, 40자 이내 |
| `image_url` | `https://*.coupangcdn.com/...` 또는 `https://ads-partners.coupang.com/...` 만 |
| `price` | 정수(원), 콤마 없이 |
| `category` | 예: `생활·주방` |
| `partner_url` | 파트너스 센터에서 만든 `https://link.coupang.com/...` 링크만 (다른 도메인이면 빌드 실패) |
| `sub_id` | `id` 와 똑같이 (파트너스 리포트에서 상품별 전환 추적). 링크 생성 시 채널/Sub ID에도 같은 값을 넣는다 |
| `price_checked_at` | 가격을 확인한 날짜 `YYYY-MM-DD` |
| `active` | `true` / `false` |

순서:

1. 파트너스 센터에서 상품 링크 생성 (Sub ID = 상품 id)
2. 상품 페이지의 현재 가격·대표 이미지 URL을 CSV 행에 입력, `price_checked_at` 을 오늘로
3. `npm run build:products` — 오류가 있으면 행 번호와 이유를 출력하고 JSON을 갱신하지 않는다
4. `data/products.csv`, `data/products.json` 커밋 & 배포

- 스크립트 실행 시점 기준 `price_checked_at` 이 **14일 넘은 상품은 경고 후 게임 풀에서 제외**된다. 2주마다 가격을 재확인하고 날짜를 갱신한 뒤 다시 빌드·배포할 것.
- 들어 있는 샘플 3행(p001~p003)은 placeholder다. `partner_url` 에 `PLACEHOLDER` 가 들어 있으면 빌드 시 경고가 뜬다. 실제 링크로 교체하거나 행을 지운다.
- 다른 CSV로 빌드: `npm run build:products -- path/to/file.csv`
- 풀이 10개 미만이면 한 판이 풀 크기만큼으로 줄어든다. 실제 운영은 최소 20개 이상 권장 (최근 본 50개를 우선 회피하므로 많을수록 좋다).

## 2. Supabase (이벤트 로그, 선택)

env가 없으면 `/api/log` 는 204만 반환하고 아무것도 저장하지 않는다. 앱은 그대로 동작한다.

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/20260927000000_init_event_logs.sql` 실행
   (또는 Supabase CLI: `supabase link` → `supabase db push`)
   - `guesses`, `clicks` 테이블 생성, RLS 활성화, anon 정책 없음 → 클라이언트에서 직접 접근 불가
3. env 설정 (`.env.local` 또는 Vercel 프로젝트 설정):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # 서버 전용. NEXT_PUBLIC_ 붙이지 말 것
NEXT_PUBLIC_SITE_URL=https://...     # 공유 문구에 들어갈 URL (없으면 접속 도메인)
```

서버는 가격·정답 여부·오차를 클라이언트 값이 아니라 `products.json` 기준으로 다시 계산해 저장한다.

유용한 쿼리:

```sql
-- 상품별 CHEAPER 비율과 클릭 수
select g.product_id,
       count(*) as plays,
       avg(g.is_cheaper::int) as cheaper_rate,
       (select count(*) from clicks c where c.product_id = g.product_id) as clicks
from guesses g group by g.product_id order by plays desc;
```

## 3. 배포 (Vercel)

1. GitHub에 push → Vercel에서 Import (Framework: Next.js, 설정 기본값)
2. Environment Variables에 위 3개 입력 (Production/Preview)
3. Deploy. 커스텀 도메인을 붙이면 `NEXT_PUBLIC_SITE_URL` 도 그 도메인으로 바꾸고 재배포
4. 상품 갱신은 CSV 수정 → `npm run build:products` → 커밋·push (자동 재배포)

## 쿠팡 파트너스 준수 사항

- 고지 문구는 `lib/config.ts` 의 `DISCLOSURE` 한 곳에서 관리하며 모든 화면 푸터 + 모든 구매 CTA 바로 아래에 노출된다. **문구 수정·축약 금지.**
- 앱 이름·도메인·메타 태그에 "쿠팡"을 브랜드처럼 쓰지 않는다. CTA 라벨(`쿠팡에서 보기`)처럼 링크 목적지 설명만 허용.
- 링크 클릭은 점수·보상과 무관하다. 클릭은 `clicks` 로그만 남긴다.
- 외부 링크는 새 탭 + `rel="sponsored noopener"`.

## 구조

```
app/page.tsx               게임 (단일 페이지 상태 전환: 시작 → 문제 → 공개 → 결과)
app/api/log/route.ts       이벤트 로그 insert (service role)
app/opengraph-image.tsx    정적 OG 이미지 (빌드 시 생성)
components/Game.tsx        화면 4종
lib/config.ts              상수
lib/game.ts                채점·선택(seed 주입 가능)·공유 문구
lib/storage.ts             localStorage (session_id, best streak, seen)
scripts/build-products.ts  CSV 검증 → products.json
supabase/migrations/       SQL
```
