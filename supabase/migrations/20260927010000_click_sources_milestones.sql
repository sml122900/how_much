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
