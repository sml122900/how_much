# how_much — 가격 맞히기

상품 사진과 한 줄 설명을 보고 숫자 드럼을 굴려 가격을 맞히는 10문제 게임.
Next.js 15 (App Router) + TypeScript + Tailwind v4.

```bash
npm install
npm run build:products   # data/products.csv → data/products.json
npm run dev              # http://localhost:3000
```

- 게임 규칙 상수(허용 오차, 문제 수, 자동 넘김 시간, 스트릭 마일스톤 등): `lib/config.ts`
- 화면 문구("정답!", "생각보다 N% 싸요", "실제가는 더 비쌌어요", 버튼 문구 등): `lib/copy.ts`

## 판정과 공개 연출

점수 축과 구매 축은 독립이다.

- **HIT**: `|예상 − 실제| / 실제 ≤ 15%` → 점수·스트릭 기준
- **CHEAPER**: `예상 > 실제` → 구매 CTA 기준

| 케이스 | 연출 | 구매 링크 | 진행 |
|---|---|---|---|
| HIT + CHEAPER | 폭죽 크게 + 팡파레, "정답! 생각보다 N% 싸요" | 큰 [구매하기] | 자동 넘김 없음 |
| HIT만 | 폭죽 중간, "정답!" | 회색 [그래도 구매할래요] | 2.5초 후 자동 |
| CHEAPER만 | 코인 소리, "생각보다 N% 싸요" | 큰 [구매하기] | 자동 넘김 없음 |
| MISS | 둔탁한 소리, "실제가는 더 비쌌어요" | 회색 [그래도 구매할래요] | 2.5초 후 자동 |

회색 링크를 누르면 자동 넘김이 취소된다. 링크 클릭은 점수·보상과 무관하다.

## 1. 상품 CSV 채우기

`data/products.csv` 를 편집한 뒤 `npm run build:products` 로 검증하고 `data/products.json` 을 만든다.
**JSON은 직접 고치지 말고 항상 CSV → 스크립트로 생성**한다. (JSON도 커밋해야 배포에 반영된다)

| 컬럼 | 규칙 |
| --- | --- |
| `id` | `p001` 형식, 중복 불가 |
| `name` | 상품명 |
| `description` | 한 줄, 40자 이내 |
| `image_url` | `https://*.coupangcdn.com/...` 또는 `https://ads-partners.coupang.com/...` 만 |
| `price` | 정수(원), 콤마 없이. **10원 단위(일의 자리 0)**, 최대 999,990원 |
| `category` | 예: `생활·주방` |
| `partner_url` | 파트너스 센터에서 만든 `https://link.coupang.com/...` 링크만 |
| `sub_id` | `id` 와 똑같이 (파트너스 리포트 상품별 전환 추적). 링크 생성 시 Sub ID에도 같은 값 |
| `price_checked_at` | 가격을 확인한 날짜 `YYYY-MM-DD` |
| `active` | `true` / `false` |
| `price_basis` | 항상 `listed` — 비회원이 로그인 없이 보는 기본 판매가 |
| `options` | `single`(단일 옵션) / `default`(다중 옵션이면 링크가 그 옵션으로 열리고 그 옵션 가격을 적음) |
| `shipping` | `rocket_free` / `rocket_threshold` / `seller_free` / `seller_paid` |

`shipping` 이 `rocket_threshold`(로켓배송 19,800원 미만 → 비회원 배송비) 또는 `seller_paid` 이면
공개 화면 실제가 아래에 "배송비 별도일 수 있음", 나머지는 "무료배송"이 표시된다.

### 큐레이션 체크리스트 (구매 정직성)

목표: 공개된 가격은 **회원가입·특정 카드·쿠폰 다운로드 없이 누구나 그 가격으로 사는 가격**.

- [ ] 가격 확인은 **로그아웃 상태**(시크릿 창)에서 한다
- [ ] 와우 회원가·카드 즉시할인가·쿠폰 적용가를 적지 않는다 (`price_basis=listed`)
- [ ] **타임딜·골드박스·와우 전용 상품은 넣지 않는다** (가격이 곧 바뀌거나 비회원이 못 삼)
- [ ] 다중 옵션 상품은 링크가 그 옵션으로 열리는지 확인하고 그 옵션 가격을 적는다 (`options=default`)
- [ ] 배송 조건을 확인해 `shipping` 을 정확히 적는다
- [ ] 가격의 일의 자리가 0이 아닌 상품(예: 12,345원)은 드럼으로 맞힐 수 없으니 제외한다
- [ ] `price_checked_at` 을 확인한 날로 적는다

### 순서

1. 파트너스 센터에서 상품 링크 생성 (Sub ID = 상품 id)
2. 로그아웃 상태로 상품 페이지의 기본 판매가·대표 이미지 URL·배송 조건을 CSV에 입력
3. `npm run build:products` — 오류가 있으면 행 번호와 이유를 출력하고 JSON을 갱신하지 않는다
4. `data/products.csv`, `data/products.json` 커밋 & 배포

- `price_checked_at` 이 **14일 넘은 상품은 빌드 시 경고 후 풀에서 제외**되고, **런타임에서도 접속 시점 날짜로 다시 걸러진다**.
  재빌드를 안 해도 오래된 상품은 자동으로 빠지지만, 풀이 비지 않도록 2주마다 가격을 재확인해 날짜를 갱신할 것.
- 샘플 3행(p001~p003)은 placeholder다. `partner_url` 에 `PLACEHOLDER` 가 있으면 빌드 시 경고가 뜬다.
- 다른 CSV로 빌드: `npm run build:products -- path/to/file.csv`
- 풀이 10개 미만이면 한 판이 풀 크기만큼으로 줄어든다. 최소 20개 이상 권장.

## 2. Supabase (이벤트 로그, 선택)

env가 없으면 `/api/log` 는 204만 반환하고 아무것도 저장하지 않는다. 앱은 그대로 동작한다.

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/` 의 파일을 **이름 순서대로** 실행 (또는 `supabase link` → `supabase db push`)
   - `guesses`, `clicks`(source: `reveal` / `reveal_gray` / `result` / `result_rest`), `milestones`
   - RLS 활성화, anon 정책 없음 → 클라이언트에서 직접 접근 불가
3. env 설정 (`.env.local` 또는 Vercel):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # 서버 전용. NEXT_PUBLIC_ 붙이지 말 것
NEXT_PUBLIC_SITE_URL=https://...     # 공유 문구에 들어갈 URL (없으면 접속 도메인)
```

서버는 가격·정답 여부·오차를 클라이언트 값이 아니라 `products.json` 기준으로 다시 계산해 저장한다.
`milestones` 는 연속 정답 3/5/10 도달 기록이다 (보상 시스템은 아직 없음 — 훅만).

## 3. 배포 (Vercel)

1. GitHub에 push → Vercel에서 Import (Framework: Next.js, 설정 기본값)
2. Environment Variables에 위 3개 입력
3. Deploy. 커스텀 도메인을 붙이면 `NEXT_PUBLIC_SITE_URL` 도 그 도메인으로 바꾸고 재배포
4. 상품 갱신은 CSV 수정 → `npm run build:products` → 커밋·push

## 입력 드럼 · 공개 연출

`components/PriceDrum.tsx` 하나가 입력(`input`)·스핀(`spin`)·공개(`reveal`)를 담당한다.

- 십만~십 5칸 + 고정 "0". 포인터 드래그(관성 + 스프링 스냅, 살짝 오버슛), 칸 탭(위 −1 / 아래 +1), 휠, 방향키
- 숫자가 넘어갈 때마다 틱 소리 + `navigator.vibrate(8)` (지원 브라우저)
- 드럼 아래 "직접 입력" → 숫자 입력칸 (10원 단위로 내림)
- 공개 타임라인: 잠금 150ms → 스핀 500ms → 왼쪽부터 180ms 간격 정지(120ms 착지).
  실제가 앞자리 0 칸은 스핀 전에 접는다. 제출 → 마지막 정지 = 4자리 가격 약 1.14초, 5자리 약 1.32초, 6자리 약 1.50초
- `prefers-reduced-motion` 이면 스핀·펀치·흔들림·폭죽 없이 페이드 공개 (소리는 음소거 토글만 따름)
- 우측 상단 🔊/🔇 음소거 토글 (localStorage `nd_muted`, 기본 ON). 음소거 시 오디오 소스를 아예 만들지 않는다

## 효과음 출처

`assets/sfx/*.mp3` — [Kenney](https://kenney.nl) CC0 1.0 (Public Domain). 원본 .ogg를 mp3(모노 64kbps)로 변환.
라이선스 원문: `assets/sfx/LICENSE-*.txt`

| 파일 | 원본 |
| --- | --- |
| `tick.mp3` | Interface Sounds — `tick_002.ogg` |
| `lock.mp3` | Interface Sounds — `switch_002.ogg` |
| `spin.mp3` | Casino Audio — `card-shuffle.ogg` (루프, 1.4배속) |
| `stop.mp3` | Casino Audio — `chip-lay-1.ogg` |
| `boom.mp3` | Interface Sounds — `bong_001.ogg` (0.55배속으로 낮게) |
| `fanfare.mp3` | Interface Sounds — `confirmation_004.ogg` |
| `cheer.mp3` | Interface Sounds — `confirmation_001.ogg` |
| `coin.mp3` | Casino Audio — `chips-collide-1.ogg` |
| `thud.mp3` | Interface Sounds — `drop_004.ogg` (0.8배속) |

폭죽: [canvas-confetti](https://github.com/catdad/canvas-confetti) (ISC). OG 이미지 폰트: Pretendard (OFL, `assets/fonts/`).

## 쿠팡 파트너스 준수 사항

- 고지 문구는 `lib/config.ts` 의 `DISCLOSURE` 한 곳에서 관리하며 모든 화면 푸터 + 모든 구매 링크 바로 아래에 노출된다. **문구 수정·축약 금지.**
- 앱 이름·도메인·메타 태그에 "쿠팡"을 브랜드처럼 쓰지 않는다. 링크 목적지 설명(`쿠팡에서 보기`)만 허용.
- 링크 클릭은 점수·보상과 무관하다. 클릭은 `clicks` 로그만 남긴다.
- 외부 링크는 새 탭 + `rel="sponsored noopener"`.

## 구조

```
app/page.tsx               게임 (단일 페이지: 시작 → 문제/공개 → 결과)
app/api/log/route.ts       이벤트 로그 insert (service role)
app/opengraph-image.tsx    정적 OG 이미지
components/Game.tsx        화면·판정 연출
components/PriceDrum.tsx   숫자 드럼 (입력·스핀·공개)
lib/config.ts              상수
lib/copy.ts                화면 문구
lib/game.ts                채점·판정 분기·선택(seed 주입 가능)·공유 문구
lib/freshness.ts           가격 확인일 14일 판정 (빌드 스크립트·런타임 공용)
lib/sfx.ts                 Web Audio 효과음·음소거
lib/storage.ts             localStorage (session_id, best streak, seen)
scripts/build-products.ts  CSV 검증 → products.json
supabase/migrations/       SQL
```
