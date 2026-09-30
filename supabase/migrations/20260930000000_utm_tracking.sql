-- 홍보 채널 유입 추적: 첫 방문 URL의 utm_source / utm_campaign (UTM 없이 들어오면 null = 직접 방문)
-- 값 형식 검증은 /api/log 에서 한다 (lib/utm.ts, 영숫자·_.~- 100자 이내). 여기선 길이만 한 번 더 막는다.

alter table public.guesses add column if not exists utm_source   text check (char_length(utm_source) <= 100);
alter table public.guesses add column if not exists utm_campaign text check (char_length(utm_campaign) <= 100);
alter table public.clicks  add column if not exists utm_source   text check (char_length(utm_source) <= 100);
alter table public.clicks  add column if not exists utm_campaign text check (char_length(utm_campaign) <= 100);

create index if not exists guesses_utm_source_idx on public.guesses (utm_source) where utm_source is not null;
create index if not exists clicks_utm_source_idx  on public.clicks  (utm_source) where utm_source is not null;
