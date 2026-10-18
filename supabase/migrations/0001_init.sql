-- Interview Coach schema. Run once in the Supabase SQL editor (or `supabase db push`).
-- The FastAPI server writes with the service-role key; the browser only reads its own rows
-- and uploads its own flag screenshots.

-- Profiles ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  consented_at timestamptz,
  daily_session_limit int not null default 5,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sessions ------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  mode text not null check (mode in ('job', 'student', 'communication')),
  config jsonb not null default '{}',
  questions jsonb not null,
  status text not null default 'created' check (status in ('created', 'processing', 'ready', 'failed')),
  flags jsonb not null default '[]',
  scores jsonb,
  content jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists sessions_user_created on public.sessions (user_id, created_at desc);

create table if not exists public.session_answers (
  session_id uuid not null references public.sessions on delete cascade,
  idx int not null,
  user_id uuid not null references auth.users on delete cascade,
  question text not null,
  duration_s real,
  transcript jsonb,
  metrics jsonb,
  scores jsonb,
  candidates jsonb,
  highlight jsonb,
  timeline jsonb,
  created_at timestamptz not null default now(),
  primary key (session_id, idx)
);

-- Row level security: users can read their own data; all writes go through the API.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_answers enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "read own sessions" on public.sessions;
create policy "read own sessions" on public.sessions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read own answers" on public.session_answers;
create policy "read own answers" on public.session_answers
  for select to authenticated using ((select auth.uid()) = user_id);

-- Storage -------------------------------------------------------------------
-- screenshots: private, one folder per user ({user_id}/{session_id}/{flag_id}.jpg)
-- signals:     private, server-only raw MediaPipe features for threshold tuning
-- tts:         public, cached interviewer audio (question text only, nothing personal)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('screenshots', 'screenshots', false, 1048576, array['image/jpeg']),
  ('signals', 'signals', false, 5242880, array['application/json']),
  ('tts', 'tts', true, 5242880, array['audio/mpeg'])
on conflict (id) do nothing;

drop policy if exists "upload own screenshots" on storage.objects;
create policy "upload own screenshots" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "update own screenshots" on storage.objects;
create policy "update own screenshots" on storage.objects
  for update to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "read own screenshots" on storage.objects;
create policy "read own screenshots" on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
