-- ============================================================
-- LTCOE OSINT Board — Supabase schema
-- Run the whole file once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- ============================================================

-- ---------- 0. Extensions ----------

create extension if not exists pgcrypto;  -- provides gen_random_uuid()

-- ---------- 1. Tables ----------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
                 check (char_length(display_name) between 2 and 50),
  username     text unique
                 check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.challenge_solves (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  challenge_id   text not null check (challenge_id in ('q1','q2','q3','q4')),
  points_awarded integer not null check (points_awarded > 0),
  solved_at      timestamptz not null default now(),
  constraint challenge_solves_user_challenge_key unique (user_id, challenge_id)
);

create index if not exists challenge_solves_user_id_idx on public.challenge_solves(user_id);

-- ---------- 2. updated_at maintenance ----------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- 3. Auto-create a profile on signup ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4. Row Level Security ----------

alter table public.profiles         enable row level security;
alter table public.challenge_solves enable row level security;

-- Profiles: a user can read and update only their own row.
-- (The public leaderboard gets display names from the definer view below,
--  so there is no need to expose other people's profile rows.)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Challenge solves: a user may read only their own solves.
-- There are deliberately NO insert / update / delete policies: rows are written
-- exclusively by the Vercel function using the service-role key, which bypasses
-- RLS. This stops a browser from inserting fake solves or editing points.
drop policy if exists "solves_select_own" on public.challenge_solves;
create policy "solves_select_own"
  on public.challenge_solves for select
  using (auth.uid() = user_id);

-- ---------- 5. Public leaderboard view ----------

-- security_invoker = false (the default) means the view runs with the owner's
-- privileges and bypasses RLS on the underlying tables. That is intentional and
-- safe here because the view exposes ONLY public columns (no email, no user
-- metadata). It is owned by the role that runs this script (usually postgres),
-- which is exempt from RLS.
create or replace view public.leaderboard
with (security_invoker = false)
as
select
  row_number() over (
    order by sum(cs.points_awarded) desc,
             count(cs.challenge_id)  desc,
             min(cs.solved_at)       asc
  )::int                         as rank,
  p.id                           as user_id,
  p.display_name                 as display_name,
  sum(cs.points_awarded)::int    as total_points,
  count(cs.challenge_id)::int    as challenges_solved,
  min(cs.solved_at)              as first_solve_at
from public.profiles p
join public.challenge_solves cs on cs.user_id = p.id
group by p.id, p.display_name;

-- ---------- 6. Grants ----------

grant select on public.leaderboard to anon, authenticated;
grant select on public.profiles to authenticated;         -- still filtered by RLS
grant select on public.challenge_solves to authenticated; -- still filtered by RLS

-- ---------- 7. Backfill profiles for users created before this schema ----------

insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'display_name', ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ---------- 8. Sanity check ----------
-- Should return one row per object with no error after a successful run.
select 'profiles' as object, count(*) from public.profiles
union all
select 'challenge_solves', count(*) from public.challenge_solves
union all
select 'leaderboard', count(*) from public.leaderboard;
