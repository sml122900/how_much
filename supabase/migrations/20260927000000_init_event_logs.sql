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
