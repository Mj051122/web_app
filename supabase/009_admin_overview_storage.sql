-- ============================================================
-- 009_admin_overview_storage.sql
-- DASHBOARD OVERVIEW + AUDIT LOGS + STORAGE management.
--
-- Run AFTER 008. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- OVERVIEW (dashboard counters + recent activity)
-- Admin-only scope: no professor-side content (classes,
-- assignments, submissions, announcements live in the app).
-- ------------------------------------------------------------
create or replace function public.admin_get_overview(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_auth();
begin
  return jsonb_build_object(
    'students',              (select count(*) from public.app_users where role = 'student'),
    'professors',            (select count(*) from public.app_users where role = 'professor'),
    'admin_users',           (select count(*) from public.admin_users),
    'pending_join_requests', (select count(*) from public.class_join_requests where status = 'pending'),
    'blocked_users',         (select count(*) from public.app_users where is_blocked),
    'audit_entries',         (select count(*) from public.admin_audit_logs),
    'recent_join_requests',  coalesce((
      select jsonb_agg(t) from (
        select r.id, r.status, r.requested_at,
               s.full_name as student_name, s.id_number,
               c.class_name, c.class_code
        from public.class_join_requests r
        join public.app_users s on s.id = r.student_id
        join public.classes c on c.id = r.class_id
        where r.status = 'pending'
        order by r.requested_at desc limit 5
      ) t), '[]'::jsonb),
    'recent_audit',          coalesce((
      select jsonb_agg(t) from (
        select l.action, l.target_table, l.created_at, au.email as admin_name
        from public.admin_audit_logs l
        left join public.admin_users au on au.id = l.admin_id
        order by l.created_at desc limit 8
      ) t), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------
-- AUDIT LOGS (filtered, sorted, paginated)
-- Filters: search, action, target_table, admin_id, date_from,
--          date_to, audit_id
-- ------------------------------------------------------------
create or replace function public.admin_list_audit_logs(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 25), 200), 1);
  v_search text := nullif(p_filters->>'search','');
  v_action text := nullif(p_filters->>'action','');
  v_tbl    text := nullif(p_filters->>'target_table','');
  v_adminf text := nullif(p_filters->>'admin_id','');
  v_from   text := nullif(p_filters->>'date_from','');
  v_to     text := nullif(p_filters->>'date_to','');
  v_lid    text := nullif(p_filters->>'audit_id','');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'created_at'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (l.action ilike %L or l.target_table ilike %L or l.target_id ilike %L or au.email ilike %L or au.full_name ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_action is not null then v_where := v_where || format(' and l.action = %L', v_action); end if;
  if v_tbl    is not null then v_where := v_where || format(' and l.target_table = %L', v_tbl); end if;
  if v_adminf is not null then v_where := v_where || format(' and l.admin_id = %L::uuid', v_adminf); end if;
  if v_from   is not null then v_where := v_where || format(' and l.created_at >= %L::date', v_from); end if;
  if v_to     is not null then v_where := v_where || format(' and l.created_at < (%L::date + interval ''1 day'')', v_to); end if;
  if v_lid    is not null then v_where := v_where || format(' and l.id = %L::bigint', v_lid); end if;

  v_sort_sql := case v_sort
    when 'created_at' then 'l.created_at'
    when 'action' then 'l.action'
    else 'l.created_at'
  end;

  execute format('select count(*) from public.admin_audit_logs l
    left join public.admin_users au on au.id = l.admin_id
    where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select l.id, l.admin_id, coalesce(au.email, l.admin_id::text) as admin_name,
              l.action, l.target_table, l.target_id, l.before_data, l.after_data,
              l.details, l.created_at
       from public.admin_audit_logs l
       left join public.admin_users au on au.id = l.admin_id
       where %s
       order by %s %s, l.id desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- STORAGE — best-effort orphan scan via storage.objects.
-- Buckets: profile-pictures, class-covers, announcement-images,
--          assignment-files
-- ------------------------------------------------------------
create or replace function public.admin_list_storage_orphans(p_bucket text, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 50), 200), 1);
  v_total  int;
  v_orphan int;
  v_rows   jsonb;
begin
  if p_bucket not in ('profile-pictures', 'class-covers', 'announcement-images', 'assignment-files') then
    raise exception 'Unknown bucket.';
  end if;

  select count(*) into v_total from storage.objects o where o.bucket_id = p_bucket;

  select count(*) into v_orphan from storage.objects o where o.bucket_id = p_bucket
  and not (
    (p_bucket = 'profile-pictures' and exists (select 1 from public.app_users u
        where u.profile_picture_url = o.name or u.profile_picture_url = o.bucket_id || '/' || o.name))
    or (p_bucket = 'class-covers' and exists (select 1 from public.classes c
        where c.cover_image_url = o.name or c.cover_image_url = o.bucket_id || '/' || o.name))
    or (p_bucket = 'announcement-images' and exists (select 1 from public.class_announcements a
        where a.image_url = o.name or a.image_url = o.bucket_id || '/' || o.name))
    or (p_bucket = 'assignment-files' and (
        exists (select 1 from public.class_assignments a
          where a.file_url = o.name or a.file_url = o.bucket_id || '/' || o.name)
        or exists (select 1 from public.assignment_submissions s
          where s.submission_file_url = o.name or s.submission_file_url = o.bucket_id || '/' || o.name)))
  );

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select o.name, o.created_at, (o.metadata->>''size'')::bigint as size, %L as bucket,
              not (
                (%L = ''profile-pictures'' and exists (select 1 from public.app_users u
                    where u.profile_picture_url = o.name or u.profile_picture_url = o.bucket_id || ''/'' || o.name))
                or (%L = ''class-covers'' and exists (select 1 from public.classes c
                    where c.cover_image_url = o.name or c.cover_image_url = o.bucket_id || ''/'' || o.name))
                or (%L = ''announcement-images'' and exists (select 1 from public.class_announcements a
                    where a.image_url = o.name or a.image_url = o.bucket_id || ''/'' || o.name))
                or (%L = ''assignment-files'' and (
                    exists (select 1 from public.class_assignments a
                      where a.file_url = o.name or a.file_url = o.bucket_id || ''/'' || o.name)
                    or exists (select 1 from public.assignment_submissions s
                      where s.submission_file_url = o.name or s.submission_file_url = o.bucket_id || ''/'' || o.name)))
              ) as is_orphan
       from storage.objects o
       where o.bucket_id = %L
       order by o.created_at desc
       limit %s offset %s
     ) t',
    p_bucket, p_bucket, p_bucket, p_bucket, p_bucket, p_bucket, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'orphan_total', v_orphan,
                            'page', v_page, 'page_size', v_size, 'bucket', p_bucket);
end $$;

-- ------------------------------------------------------------
-- DELETE storage file (audit-logged)
-- ------------------------------------------------------------
create or replace function public.admin_delete_storage_file(p_bucket text, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
begin
  if p_bucket not in ('profile-pictures', 'class-covers', 'announcement-images', 'assignment-files') then
    raise exception 'Unknown bucket.';
  end if;
  if p_path is null or p_path = '' then raise exception 'Path is required.'; end if;

  begin
    perform storage.delete(p_bucket, array[p_path]);
  exception when others then
    raise exception 'Storage delete failed: %', sqlerrm;
  end;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_delete_storage_file', 'storage.' || p_bucket, p_path
  );
  return jsonb_build_object('ok', true);
end $$;