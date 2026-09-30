# CLAUDE.md

새 세션 시작 시 먼저 읽을 것:

1. **`STATUS.md`** — 최근 작업, 진행 중/보류 항목, 상품 풀 현황 등 "지금 상황"
2. **`README.md`** — 아키텍처, 커맨드, CSV 큐레이션 규칙, 배포 체크리스트

작업 지침:

- `data/products.json`은 직접 고치지 않는다. 항상 `data/products.csv` → `npm run build:products` 로 생성.
- `lib/config.ts`의 `DISCLOSURE`(쿠팡 파트너스 고지 문구)는 수정·축약 금지.
- 큰 작업(기능 추가/변경, 배포)을 끝내면 **`STATUS.md`를 갱신**한다 — 완료 항목 추가, 해소된 보류 항목 제거.
