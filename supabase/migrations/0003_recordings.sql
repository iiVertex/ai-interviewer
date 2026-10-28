-- Answer replays -------------------------------------------------------------
-- recordings: private, one folder per user ({user_id}/{session_id}/{answer_idx}.webm|.mp4)
-- 20 MB per file covers a 2-minute answer at the browser's recording bitrate with room to spare.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 20971520, array['video/webm', 'video/mp4'])
on conflict (id) do nothing;

drop policy if exists "upload own recordings" on storage.objects;
create policy "upload own recordings" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "update own recordings" on storage.objects;
create policy "update own recordings" on storage.objects
  for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "read own recordings" on storage.objects;
create policy "read own recordings" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
