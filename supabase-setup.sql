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

-- ============ Question box (Ask about Maslawi) ============
-- Signed-in learners ask about a word or phrase. A reviewer answers in the app, and
-- answered questions show up for everyone under Words.

create table if not exists public.word_questions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text check (char_length(name) <= 40),
  word        text check (char_length(word) <= 80),
  question    text not null check (char_length(question) between 1 and 300),
  answer      text check (char_length(answer) <= 600),
  lang        text check (lang in ('en', 'sv')),
  status      text not null default 'pending' check (status in ('pending', 'answered', 'hidden')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists word_questions_status on public.word_questions (status, answered_at desc);
create index if not exists word_questions_user   on public.word_questions (user_id, created_at desc);
alter table public.word_questions enable row level security;
drop policy if exists "everyone sees answered questions" on public.word_questions;
drop policy if exists "learners see own questions"       on public.word_questions;
drop policy if exists "learners ask questions"           on public.word_questions;
drop policy if exists "reviewers see questions"          on public.word_questions;
drop policy if exists "reviewers answer questions"       on public.word_questions;
drop policy if exists "reviewers remove questions"       on public.word_questions;
create policy "everyone sees answered questions" on public.word_questions for select to anon, authenticated using (status = 'answered');
create policy "learners see own questions"       on public.word_questions for select to authenticated using (auth.uid() = user_id);
-- New questions always start as pending, without an answer.
create policy "learners ask questions"           on public.word_questions for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending' and answer is null and answered_at is null);
create policy "reviewers see questions"          on public.word_questions for select to authenticated using (public.is_reviewer());
create policy "reviewers answer questions"       on public.word_questions for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());
create policy "reviewers remove questions"       on public.word_questions for delete to authenticated using (public.is_reviewer());
-- One person can have at most 20 questions waiting for an answer.
create or replace function public.limit_pending_questions() returns trigger
  language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.word_questions where user_id = new.user_id and status = 'pending') >= 20 then
    raise exception 'Too many questions waiting for an answer' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists limit_pending_questions on public.word_questions;
create trigger limit_pending_questions before insert on public.word_questions
  for each row execute function public.limit_pending_questions();
-- Visitors who aren't signed in can only read the columns answered questions show.
revoke all on public.word_questions from anon;
grant select (id, name, word, question, answer, status, created_at, answered_at) on public.word_questions to anon;
grant select, insert, update, delete on public.word_questions to authenticated;

-- ============ Streak reminders (push notifications) ============
-- A learner who switches the reminder on gets one row per phone or browser. The app only
-- reaches this table through the two functions below, keyed by the push address (which is
-- long and secret). The GitHub Action (reminders/send.mjs, every 10 minutes) reads it with the secret key.

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  endpoint   text not null unique check (char_length(endpoint) <= 800),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  tz         text not null default 'Europe/Stockholm' check (char_length(tz) <= 60),
  hour       int  not null default 19 check (hour between 0 and 23),
  lang       text not null default 'sv' check (lang in ('sv', 'en')),
  last_day   date,
  streak     int  not null default 0 check (streak between 0 and 100000),
  last_sent  date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- remind: the streak reminder is on. alerts: a reviewer's phone that wants to hear about new
-- questions and phrase suggestions (only reviewers can switch it on).
alter table public.push_subscriptions add column if not exists remind boolean not null default true;
alter table public.push_subscriptions add column if not exists alerts boolean not null default false;
alter table public.push_subscriptions add column if not exists last_alert timestamptz;
-- the reminder job (reminders/send.mjs) uses the secret key, which is the service_role
grant select, update, delete on public.push_subscriptions to service_role;
grant select on public.word_questions, public.phrase_suggestions to service_role;

drop function if exists public.save_push(text, text, text, text, int, text, date, int);
create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text, p_tz text, p_hour int,
                                            p_lang text, p_last_day date, p_streak int,
                                            p_remind boolean default true, p_alerts boolean default false)
  returns void language plpgsql security definer set search_path = public as $$
declare
  want_alerts boolean := coalesce(p_alerts, false) and public.is_reviewer();
begin
  -- only real push services (Chrome/Android, Firefox, Apple, Microsoft)
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'Not a push address' using errcode = 'check_violation';
  end if;
  insert into public.push_subscriptions as s (endpoint, p256dh, auth, tz, hour, lang, last_day, streak, remind, alerts, last_alert)
  values (p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_tz, ''), 'Europe/Stockholm'), coalesce(p_hour, 19),
          coalesce(p_lang, 'sv'), p_last_day, greatest(coalesce(p_streak, 0), 0), coalesce(p_remind, true),
          want_alerts, case when want_alerts then now() end)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, hour = excluded.hour, lang = excluded.lang,
        last_day = excluded.last_day, streak = excluded.streak, remind = excluded.remind, alerts = excluded.alerts,
        last_alert = case when excluded.alerts and not s.alerts then now() else s.last_alert end,
        updated_at = now();
end $$;

create or replace function public.delete_push(p_endpoint text)
  returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;

revoke execute on function public.save_push(text, text, text, text, int, text, date, int, boolean, boolean) from public;
revoke execute on function public.delete_push(text) from public;
grant execute on function public.save_push(text, text, text, text, int, text, date, int, boolean, boolean) to anon, authenticated;
grant execute on function public.delete_push(text) to anon, authenticated;

-- ============ Instant notifications ============
-- GitHub's own schedule is often late, so Supabase starts the notification job instead:
-- right away when someone asks a question or suggests a phrase, and every 10 minutes for
-- the streak reminders. Needs a GitHub token that may only start the job (Actions: read and
-- write on this repo), saved in Supabase Vault as github_dispatch_token:
--   select vault.create_secret('github_pat_…', 'github_dispatch_token');
-- Without the token, nothing happens and the GitHub schedule still runs the job.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.kick_notifications() returns void
  language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
  if tok is null then return; end if;
  perform net.http_post(
    url := 'https://api.github.com/repos/vyasso/maslawi/actions/workflows/streak-reminder.yml/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'maslawi-supabase',
                                  'Content-Type', 'application/json'));
end $$;
revoke execute on function public.kick_notifications() from public, anon, authenticated;

create or replace function public.kick_on_new_post() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.kick_notifications();
  return null;
end $$;
revoke execute on function public.kick_on_new_post() from public, anon, authenticated;
drop trigger if exists kick_new_question on public.word_questions;
create trigger kick_new_question after insert on public.word_questions
  for each statement execute function public.kick_on_new_post();
drop trigger if exists kick_new_suggestion on public.phrase_suggestions;
create trigger kick_new_suggestion after insert on public.phrase_suggestions
  for each statement execute function public.kick_on_new_post();

select cron.schedule('maslawi-notifications', '*/10 * * * *', 'select public.kick_notifications()');
