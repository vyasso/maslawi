-- Maslawi: run this once in Supabase → SQL Editor → New query → Run.
-- It creates one row of saved progress per user, and makes sure
-- each person can only ever read and change their own row.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "read own progress"   on public.progress;
drop policy if exists "insert own progress" on public.progress;
drop policy if exists "update own progress" on public.progress;

create policy "read own progress"   on public.progress for select using (auth.uid() = user_id);
create policy "insert own progress" on public.progress for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ Content check (reviewers only) ============
-- Only people whose email is in "reviewers" can see and change phrase checks.
-- Everyone on the list shares the same checks.

create table if not exists public.reviewers (
  email text primary key
);
alter table public.reviewers enable row level security;
drop policy if exists "see own reviewer row" on public.reviewers;
create policy "see own reviewer row" on public.reviewers
  for select using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function public.is_reviewer() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reviewers where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

create table if not exists public.phrase_checks (
  phrase     text primary key,
  status     text not null check (status in ('ok', 'fix')),
  note       text not null default '',
  checked_by text,
  updated_at timestamptz not null default now()
);
alter table public.phrase_checks enable row level security;
drop policy if exists "reviewers read checks"   on public.phrase_checks;
drop policy if exists "reviewers add checks"    on public.phrase_checks;
drop policy if exists "reviewers change checks" on public.phrase_checks;
drop policy if exists "reviewers remove checks" on public.phrase_checks;
create policy "reviewers read checks"   on public.phrase_checks for select using (public.is_reviewer());
create policy "reviewers add checks"    on public.phrase_checks for insert with check (public.is_reviewer());
create policy "reviewers change checks" on public.phrase_checks for update using (public.is_reviewer()) with check (public.is_reviewer());
create policy "reviewers remove checks" on public.phrase_checks for delete using (public.is_reviewer());

-- Newer Supabase projects don't give the app access to new tables automatically.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.progress to authenticated;
grant select on public.reviewers to authenticated;
grant select, insert, update, delete on public.phrase_checks to authenticated;
grant execute on function public.is_reviewer() to authenticated;

-- Add yourself (and your Mosul speaker) as reviewers. Replace the email, then run.
-- To add more people later, run this line again with their email.
insert into public.reviewers (email) values ('YOUR-EMAIL@example.com') on conflict do nothing;

-- ============ League (weekly leaderboard) ============
-- Each learner has one row: first name + XP for the current week.
-- Signed-in learners can see everyone's row, but only change their own.

create table if not exists public.league (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default 'Learner' check (char_length(name) <= 40),
  week       date not null,
  week_xp    integer not null default 0 check (week_xp between 0 and 100000),
  updated_at timestamptz not null default now()
);
create index if not exists league_week_xp on public.league (week, week_xp desc);
alter table public.league enable row level security;
drop policy if exists "signed-in see league" on public.league;
drop policy if exists "add own league row"   on public.league;
drop policy if exists "change own league row" on public.league;
drop policy if exists "remove own league row" on public.league;
create policy "signed-in see league"  on public.league for select to authenticated using (true);
create policy "add own league row"    on public.league for insert to authenticated with check (auth.uid() = user_id);
create policy "change own league row" on public.league for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remove own league row" on public.league for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.league to authenticated;
