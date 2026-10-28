-- Practice bank ----------------------------------------------------------------
-- Questions a user saved from a report to practice again later. The browser saves and
-- removes its own rows directly; the API reads them to start a session from the bank.
create table if not exists public.saved_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  mode text not null check (mode in ('job', 'student', 'communication')),
  role text check (char_length(role) <= 120),
  -- Where it was saved from, and how that answer scored (null if feedback was unavailable)
  session_id uuid references public.sessions on delete set null,
  answer_idx int,
  score int,
  created_at timestamptz not null default now(),
  unique (user_id, text)
);
create index if not exists saved_questions_user_created on public.saved_questions (user_id, created_at desc);
create index if not exists saved_questions_session on public.saved_questions (session_id);

alter table public.saved_questions enable row level security;

drop policy if exists "read own saved questions" on public.saved_questions;
create policy "read own saved questions" on public.saved_questions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "save own questions" on public.saved_questions;
create policy "save own questions" on public.saved_questions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "remove own saved questions" on public.saved_questions;
create policy "remove own saved questions" on public.saved_questions
  for delete to authenticated using ((select auth.uid()) = user_id);
