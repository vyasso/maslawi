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

-- Add yourself (and your Mosul speaker) as reviewers: run this line on its own,
-- with the email you sign in with. Run it again for each new person.
-- insert into public.reviewers (email) values ('YOUR-EMAIL@example.com') on conflict do nothing;

-- ============ League (weekly leaderboard) ============
-- Each learner has one row: first name, XP for the current week, where they are in the course
-- and a few numbers about their progress (total XP, streak, words learned).
-- Signed-in learners can see everyone's row, but only change their own.

create table if not exists public.league (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default 'Learner' check (char_length(name) <= 40),
  week       date not null,
  week_xp    integer not null default 0 check (week_xp between 0 and 100000),
  level      text check (char_length(level) <= 12),
  stats      jsonb check (pg_column_size(stats) <= 2000),
  updated_at timestamptz not null default now()
);
-- For a league table made before these columns existed:
alter table public.league add column if not exists level text check (char_length(level) <= 12);
alter table public.league add column if not exists stats jsonb check (pg_column_size(stats) <= 2000);
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

-- ============ Suggested phrases ============
-- Signed-in learners send in phrases they say in Mosul. Each one waits as "pending"
-- until a reviewer approves it (or not). Approved phrases show up for everyone under
-- Words, with the first name of the person who sent them in.

create table if not exists public.phrase_suggestions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text check (char_length(name) <= 40),
  tr         text not null check (char_length(tr) between 1 and 120),
  meaning    text not null check (char_length(meaning) between 1 and 200),
  ar         text check (char_length(ar) <= 120),
  note       text check (char_length(note) <= 300),
  lang       text check (lang in ('en', 'sv')),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists phrase_suggestions_status on public.phrase_suggestions (status, created_at desc);
create index if not exists phrase_suggestions_user   on public.phrase_suggestions (user_id, created_at desc);
alter table public.phrase_suggestions enable row level security;
drop policy if exists "everyone sees approved phrases" on public.phrase_suggestions;
drop policy if exists "learners see own suggestions"   on public.phrase_suggestions;
drop policy if exists "learners add suggestions"       on public.phrase_suggestions;
drop policy if exists "reviewers see suggestions"      on public.phrase_suggestions;
drop policy if exists "reviewers change suggestions"   on public.phrase_suggestions;
drop policy if exists "reviewers remove suggestions"   on public.phrase_suggestions;
create policy "everyone sees approved phrases" on public.phrase_suggestions for select to anon, authenticated using (status = 'approved');
create policy "learners see own suggestions"   on public.phrase_suggestions for select to authenticated using (auth.uid() = user_id);
-- New suggestions always start as pending.
create policy "learners add suggestions"       on public.phrase_suggestions for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');
create policy "reviewers see suggestions"      on public.phrase_suggestions for select to authenticated using (public.is_reviewer());
create policy "reviewers change suggestions"   on public.phrase_suggestions for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());
create policy "reviewers remove suggestions"   on public.phrase_suggestions for delete to authenticated using (public.is_reviewer());
-- One person can have at most 50 suggestions waiting for review.
create or replace function public.limit_pending_suggestions() returns trigger
  language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.phrase_suggestions where user_id = new.user_id and status = 'pending') >= 50 then
    raise exception 'Too many suggestions waiting for review' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists limit_pending_suggestions on public.phrase_suggestions;
create trigger limit_pending_suggestions before insert on public.phrase_suggestions
  for each row execute function public.limit_pending_suggestions();
-- Visitors who aren't signed in can only read the columns that approved phrases show.
revoke all on public.phrase_suggestions from anon;
grant select (id, tr, ar, meaning, note, name, status, created_at) on public.phrase_suggestions to anon;
grant select, insert, update, delete on public.phrase_suggestions to authenticated;
