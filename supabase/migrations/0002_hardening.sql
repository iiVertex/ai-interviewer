-- Follow-ups from the Supabase security and performance advisors.

-- handle_new_user only runs as the auth.users trigger; nobody should call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Covering index for the session_answers.user_id foreign key (used by the read policy and account deletes).
create index if not exists session_answers_user on public.session_answers (user_id);
