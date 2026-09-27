-- how_much 전체 마이그레이션 (SQL Editor 붙여넣기용)
-- supabase/migrations/ 아래 3개 파일을 순서대로 이어붙인 것뿐, 새 로직 없음.
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

