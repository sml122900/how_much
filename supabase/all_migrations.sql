-- how_much 전체 마이그레이션 (SQL Editor 붙여넣기용)
-- supabase/migrations/ 아래 4개 파일을 순서대로 이어붙인 것뿐, 새 로직 없음.
-- 실제 배포는 개별 파일을 순서대로 supabase db push 하는 걸 권장하고, 이 파일은 SQL Editor에서 한 번에 돌릴 때 씀.

-- ============================================================
-- 20260927000000_init_event_logs.sql
-- ============================================================
-- 눈대중 이벤트 로그
-- 쓰기는 /api/log 에서 service role key 로만 한다. RLS 켜고 anon/authenticated 정책은 두지 않는다.

create table if not exists public.guesses (
  id          bigint generated always as identity primary key,
  session_id  uuid        not null,
  product_id  text        not null,
  guess       int         not null check (guess > 0),
  price       int         not null check (price > 0),
  is_hit      boolean     not null,
  is_cheaper  boolean     not null,
  error_pct   numeric(10, 2) not null,
  created_at  timestamptz not null default now()
);

create index if not exists guesses_product_id_idx on public.guesses (product_id);
create index if not exists guesses_created_at_idx on public.guesses (created_at);

create table if not exists public.clicks (
  id          bigint generated always as identity primary key,
  session_id  uuid        not null,
  product_id  text        not null,
  source      text        not null check (source in ('reveal', 'result')),
  created_at  timestamptz not null default now()
);

create index if not exists clicks_product_id_idx on public.clicks (product_id);
create index if not exists clicks_created_at_idx on public.clicks (created_at);

alter table public.guesses enable row level security;
alter table public.clicks  enable row level security;

-- ============================================================
-- 20260927010000_click_sources_milestones.sql
-- ============================================================
-- Phase 1.5: 클릭 source 확장 + 스트릭 milestone 로그

alter table public.clicks drop constraint if exists clicks_source_check;
alter table public.clicks
  add constraint clicks_source_check
  check (source in ('reveal', 'reveal_gray', 'result', 'result_rest'));

create table if not exists public.milestones (
  id          bigint generated always as identity primary key,
  session_id  uuid        not null,
  streak      int         not null check (streak > 0),
  created_at  timestamptz not null default now()
);

create index if not exists milestones_created_at_idx on public.milestones (created_at);

alter table public.milestones enable row level security;

-- ============================================================
-- 20260928000000_bonus_rewards.sql
-- ============================================================
-- Phase 2: 보너스 라운드 round_type + 보상 로그(reward)

alter table public.guesses
  add column if not exists round_type text not null default 'main';
alter table public.guesses drop constraint if exists guesses_round_type_check;
alter table public.guesses
  add constraint guesses_round_type_check check (round_type in ('main', 'bonus'));

alter table public.milestones
  add column if not exists reward text;
alter table public.milestones drop constraint if exists milestones_reward_check;
alter table public.milestones
  add constraint milestones_reward_check check (reward is null or reward in ('title', 'bonus_unlock', 'ad_free'));

-- ============================================================
-- 20260930000000_utm_tracking.sql
-- ============================================================
-- 홍보 채널 유입 추적: 첫 방문 URL의 utm_source / utm_campaign (UTM 없이 들어오면 null = 직접 방문)
-- 값 형식 검증은 /api/log 에서 한다 (lib/utm.ts, 영숫자·_.~- 100자 이내). 여기선 길이만 한 번 더 막는다.

alter table public.guesses add column if not exists utm_source   text check (char_length(utm_source) <= 100);
alter table public.guesses add column if not exists utm_campaign text check (char_length(utm_campaign) <= 100);
alter table public.clicks  add column if not exists utm_source   text check (char_length(utm_source) <= 100);
alter table public.clicks  add column if not exists utm_campaign text check (char_length(utm_campaign) <= 100);

create index if not exists guesses_utm_source_idx on public.guesses (utm_source) where utm_source is not null;
create index if not exists clicks_utm_source_idx  on public.clicks  (utm_source) where utm_source is not null;
