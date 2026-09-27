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
